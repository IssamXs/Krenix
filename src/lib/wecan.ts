// ============================================================
// WECAN Services delivery API client (BYO-key).
// Verified 2026-08-20 against the LIVE API. Two false leads corrected:
//   - The service is at wecanservices.me (not .com — .com is an unrelated
//     Laravel SaaS that also happens to expose /api/v1/orders and answered
//     probes; that domain sent us down a rabbit hole for hours).
//   - Auth headers are X-API-ID + X-API-TOKEN, matching the dashboard's
//     "API ID" / "API TOKEN" fields exactly. Confirmed from WeCan's own
//     error responses: no auth → "API ID and/or Token must be specified";
//     numeric-only API-ID field ("must be numeric and up to 20 characters")
//     lines up with the ~20-digit numeric IDs the dashboard issues.
// The response also carries day/hour/minute/second-quota-left headers,
// identical to Yalidine — WeCan appears to be Yalidine-API-compatible, so
// the parcel-creation shape below is modelled on Yalidine's (still UNVERIFIED
// against a real shipment — adjust field names on first real ship if WeCan
// rejects them).
// creds.apiId = API ID (numeric), creds.apiToken = API TOKEN (opaque secret).
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult, CourierValidationResult } from '@/lib/couriers'

const BASE = 'https://wecanservices.me/api/v1'

function headers(c: CourierCredentials): Record<string, string> {
  return { 'X-API-ID': c.apiId, 'X-API-TOKEN': c.apiToken, 'Content-Type': 'application/json', Accept: 'application/json' }
}

// WeCan's dashboard exposes NO public API docs — /orders is the only path
// confirmed to exist (unauth returns "API ID and/or Token must be specified").
// A GET /wilayas probe returned "Wrong endpoint" with valid creds, so that
// path doesn't exist in this WeCan install. We POST an empty array to /orders
// as a benign zero-side-effect probe: no items to create → auth ran, no
// parcel was made. Any non-401 status means credentials are accepted.
export async function validateWecan(c: CourierCredentials): Promise<CourierValidationResult> {
  try {
    const res = await fetch(`${BASE}/orders`, { method: 'POST', headers: headers(c), body: '[]' })
    if (res.status !== 401) return { ok: true }
    const body = await res.text().catch(() => '')
    const snippet = body.slice(0, 200)
    return { ok: false, reason: `WECAN HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `Connexion à WECAN impossible — ${msg}` }
  }
}

// Yalidine-compatible parcel-creation payload — WeCan's API surface mirrors
// Yalidine's (same auth headers, same rate-limit headers). Response shape
// UNVERIFIED — the accessor chain below tolerates either the Yalidine-style
// keyed-by-order_id object or a flatter shape.
export async function createWecanParcel(c: CourierCredentials, p: CourierParcelInput): Promise<CourierParcelResult> {
  const body = [{
    order_id: p.orderNumber,
    from_wilaya_name: p.fromWilaya,
    firstname: p.firstname,
    familyname: p.familyname,
    contact_phone: p.phone,
    address: p.address,
    to_commune_name: p.toCommune,
    to_wilaya_name: p.toWilaya,
    product_list: p.productList,
    price: Math.round(p.codAmount),
    do_insurance: false,
    declared_value: Math.round(p.codAmount),
    length: 0, width: 0, height: 0, weight: 0,
    freeshipping: false,
    is_stopdesk: p.isStopdesk ?? false,
    has_exchange: false,
    product_to_collect: null,
  }]

  let res: Response
  try {
    res = await fetch(`${BASE}/orders`, { method: 'POST', headers: headers(c), body: JSON.stringify(body) })
  } catch {
    return { success: false, tracking: null, labelUrl: null, error: 'Connexion à WECAN impossible' }
  }

  const raw = await res.text().catch(() => '')
  let json: unknown = null
  try { json = raw ? JSON.parse(raw) : null } catch { json = null }
  // Surface WeCan's actual error body instead of a bare status code — the
  // payload shape below is unverified, so this is how we diagnose which
  // field WeCan is rejecting.
  if (!res.ok) return { success: false, tracking: null, labelUrl: null, error: `WECAN (${res.status}) — ${raw.slice(0, 300)}` }
  if (!json) return { success: false, tracking: null, labelUrl: null, error: `WECAN (${res.status}) — réponse vide` }

  type Entry = { success?: boolean; tracking?: string; label?: string; message?: string }
  const keyed = json as Record<string, Entry>
  const entry: Entry | undefined = keyed[p.orderNumber] ?? (Array.isArray(json) ? (json[0] as Entry) : undefined)
  if (!entry || entry.success === false) {
    return { success: false, tracking: null, labelUrl: null, error: entry?.message ?? `Création du colis échouée — ${raw.slice(0, 300)}` }
  }
  return { success: true, tracking: entry.tracking ?? null, labelUrl: entry.label ?? null }
}
