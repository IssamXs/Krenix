// ============================================================
// WECAN Services delivery API client (BYO-key).
// The real API is served from wecanservices.com/api/v1 (api.wecanservices.com
// does not resolve — that hostname was a holdover from the prior integration).
// The live 401 error explicitly asks for X-API-Key + X-API-Secret headers,
// but WeCan's dashboard labels its own two fields as "API Key" + "API Token".
// creds.apiId = the "API Key" from WeCan's dashboard, creds.apiToken = the
// "API Token" / secret. Payload field names for /orders are UNVERIFIED.
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult, CourierValidationResult } from '@/lib/couriers'

const BASE = 'https://wecanservices.com/api/v1'

function headers(c: CourierCredentials): Record<string, string> {
  return { 'X-API-Key': c.apiId, 'X-API-Secret': c.apiToken, 'Content-Type': 'application/json', Accept: 'application/json' }
}

// Try /communes first (cheap, auth-gated, no side effects). On failure,
// return WeCan's own error body so the UI can surface the real reason
// (invalid key vs. expired vs. account-not-activated vs. network) instead
// of a generic "invalides".
export async function validateWecan(c: CourierCredentials): Promise<CourierValidationResult> {
  try {
    const res = await fetch(`${BASE}/communes`, { headers: headers(c) })
    if (res.ok) return { ok: true }
    const body = await res.text().catch(() => '')
    const snippet = body.slice(0, 200)
    return { ok: false, reason: `WECAN HTTP ${res.status}${snippet ? ` — ${snippet}` : ''}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, reason: `Connexion à WECAN impossible — ${msg}` }
  }
}

export async function createWecanParcel(c: CourierCredentials, p: CourierParcelInput): Promise<CourierParcelResult> {
  try {
    const res = await fetch(`${BASE}/orders`, {
      method: 'POST',
      headers: headers(c),
      body: JSON.stringify({
        reference: p.orderNumber,
        customer: {
          first_name: p.firstname,
          last_name: p.familyname,
          phone: p.phone,
          address: p.address,
          wilaya: p.toWilaya,
          commune: p.toCommune,
        },
        product: { name: p.productList },
        total_price: Math.round(p.codAmount),
        note: `Krenix — ${p.orderNumber}`,
      }),
    })
    const json = (await res.json().catch(() => null)) as { id?: string; order_id?: string; tracking_number?: string; label_url?: string } | null
    if (!res.ok || !json) return { success: false, tracking: null, labelUrl: null, error: `WECAN (${res.status})` }
    return {
      success: true,
      tracking: json.tracking_number ?? json.id ?? json.order_id ?? p.orderNumber,
      labelUrl: json.label_url ?? null,
    }
  } catch {
    return { success: false, tracking: null, labelUrl: null, error: 'Connexion à WECAN impossible' }
  }
}
