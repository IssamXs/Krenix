// ============================================================
// WECAN Services delivery API client (BYO-key).
// Verified 2026-08-20 against the live API: api.wecanservices.com does not
// resolve (was never real — a holdover from the prior single-tenant
// integration). The real API is served from the main domain at /api/v1 and
// authenticates via X-API-Key / X-API-Secret headers (confirmed from the
// live 401 body: "Missing API credentials. Please provide X-API-Key and
// X-API-Secret headers."), not a Bearer token. There is no store-id concept
// in the header auth — creds.apiId = API Key, creds.apiToken = API Secret.
// The /orders create-parcel body shape below is still UNVERIFIED against a
// real key — confirm field names on first real shipment.
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult } from '@/lib/couriers'

const BASE = 'https://wecanservices.com/api/v1'

function headers(c: CourierCredentials): Record<string, string> {
  return { 'X-API-Key': c.apiId, 'X-API-Secret': c.apiToken, 'Content-Type': 'application/json', Accept: 'application/json' }
}

// /communes is a cheap authenticated GET (confirmed to exist and be
// auth-gated live) — used as a side-effect-free credential check instead of
// hitting /orders.
export async function validateWecan(c: CourierCredentials): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/communes`, { headers: headers(c) })
    return res.ok
  } catch {
    return false
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
