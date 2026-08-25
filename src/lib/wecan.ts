// ============================================================
// WECAN Services delivery API client (BYO-key).
// Verified 2026-08-20 against the LIVE API. Three false leads corrected:
//   - The service is at wecanservices.me (not .com — .com is an unrelated
//     Laravel SaaS that also happens to expose /api/v1/orders and answered
//     probes with plausible-looking errors).
//   - Auth headers are X-API-ID + X-API-TOKEN, matching the dashboard's
//     "API ID" / "API TOKEN" fields exactly.
//   - Real API is on the `api.` SUBDOMAIN with paths at /v1/ (no /api
//     prefix). The main domain's /api/v1/* paths look like they exist but
//     always return "Wrong endpoint" 400 once authenticated — different
//     backend entirely. This mirrors Yalidine's URL layout exactly
//     (api.yalidine.app/v1/*), consistent with WeCan being a Yalidine-
//     compatible API (same rate-limit headers, same error shape).
// creds.apiId = API ID (numeric), creds.apiToken = API TOKEN (opaque secret).
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult, CourierValidationResult } from '@/lib/couriers'

const BASE = 'https://api.wecanservices.me/v1'

function headers(c: CourierCredentials): Record<string, string> {
  return { 'X-API-ID': c.apiId, 'X-API-TOKEN': c.apiToken, 'Content-Type': 'application/json', Accept: 'application/json' }
}

// Cheap authenticated GET; /wilayas exists on the real API subdomain and is
// auth-gated. On failure, return WeCan's own error body so the UI shows the
// real reason.
export async function validateWecan(c: CourierCredentials): Promise<CourierValidationResult> {
  try {
    const res = await fetch(`${BASE}/wilayas/?page_size=1`, { headers: headers(c) })
    if (res.ok) return { ok: true }
    const body = await res.text().catch(() => '')
    const snippet = body.slice(0, 200)
    return { ok: false, reason: `WECAN HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `Connexion à WECAN impossible — ${msg}` }
  }
}

// Yalidine-compatible parcel-creation: POST /v1/parcels/ (trailing slash),
// body is an ARRAY of parcels (Yalidine takes an array; WeCan mirrors it).
// Response is keyed by order_id.
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
    length: 0, width: 0, height: 0, weight: p.weight ?? 0,
    // MUST stay false, and `price` must already be NET of the courier's fee.
    // On this API the courier ADDS its own delivery fee on top of `price` and
    // collects the sum, so the ship route pre-subtracts that fee from the
    // order total (see resolveCourierDestination + codAmount there) — the
    // customer then pays exactly the total they were quoted.
    // `true` is NOT an alternative: it means the MERCHANT prepays delivery
    // from their courier account balance, and WeCan rejects the parcel
    // outright when that balance is short ("Vous ne pouvez pas utiliser la
    // livraison gratuite, car le solde actuel de votre compte ne couvre pas
    // les frais de livraison du colis.").
    freeshipping: false,
    is_stopdesk: p.isStopdesk ?? false,
    // Required alongside is_stopdesk: true — the id of an actual pickup
    // point from the Centers endpoint. Omitting it (or sending it for a
    // home parcel) is rejected as "Unknown stopdesk_id value in the order_id
    // ...". The ship route resolves this via resolveStopdeskCenter and
    // refuses to ship a stopdesk parcel when it can't.
    stopdesk_id: p.isStopdesk ? p.stopdeskCenterId : null,
    has_exchange: false,
    product_to_collect: null,
  }]

  let res: Response
  try {
    res = await fetch(`${BASE}/parcels/`, { method: 'POST', headers: headers(c), body: JSON.stringify(body) })
  } catch {
    return { success: false, tracking: null, labelUrl: null, error: 'Connexion à WECAN impossible' }
  }

  const raw = await res.text().catch(() => '')
  // Diagnostic: the price/weight WeCan actually prints on the label has been
  // observed to diverge from what we submit (recouvrement + service tier both
  // off on a real shipment). Log the outgoing declared amount next to their
  // raw response so a mismatch can be traced without guessing.
  console.log('[wecan] createParcel', {
    order_id: p.orderNumber, price: body[0].price, weight: body[0].weight, is_stopdesk: body[0].is_stopdesk,
    stopdesk_id: body[0].stopdesk_id, status: res.status, raw: raw.slice(0, 500),
  })
  let json: unknown = null
  try { json = raw ? JSON.parse(raw) : null } catch { json = null }
  // Surface WeCan's actual error body instead of a bare status code — the
  // payload shape below is unverified, so this is how we diagnose which
  // field WeCan is rejecting. Includes content-type/length so an empty
  // body can be told apart from a body we failed to read.
  if (!res.ok) {
    const ct = res.headers.get('content-type') ?? '?'
    const cl = res.headers.get('content-length') ?? '?'
    return { success: false, tracking: null, labelUrl: null, error: `WECAN (${res.status}) ct=${ct} cl=${cl} body="${raw.slice(0, 300)}"` }
  }
  if (!json) return { success: false, tracking: null, labelUrl: null, error: `WECAN (${res.status}) — réponse vide, body="${raw.slice(0, 300)}"` }

  type Entry = { success?: boolean; tracking?: string; label?: string; message?: string }
  const keyed = json as Record<string, Entry>
  const entry: Entry | undefined = keyed[p.orderNumber] ?? (Array.isArray(json) ? (json[0] as Entry) : undefined)
  if (!entry || entry.success === false) {
    return { success: false, tracking: null, labelUrl: null, error: entry?.message ?? `Création du colis échouée — ${raw.slice(0, 300)}` }
  }
  return { success: true, tracking: entry.tracking ?? null, labelUrl: entry.label ?? null }
}
