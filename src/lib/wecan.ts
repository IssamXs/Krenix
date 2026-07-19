// ============================================================
// WECAN Services delivery API client (BYO-key). UNVERIFIED against live keys —
// same status as Maystro/ZR Express/Procolis (see couriers.ts). Endpoint and
// auth scheme are carried over from the prior single-tenant Wecan integration
// (api.wecanservices.com, Bearer token); adjust payload field names on first
// real shipment if WECAN's dashboard docs differ.
// creds.apiId = API token (Bearer auth), creds.apiToken = Store ID.
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult } from '@/lib/couriers'

const BASE = 'https://api.wecanservices.com/api'

function headers(c: CourierCredentials): Record<string, string> {
  return { Authorization: `Bearer ${c.apiId}`, 'Content-Type': 'application/json', Accept: 'application/json' }
}

// No dedicated "check credentials" endpoint is documented, so we probe the
// orders endpoint with an empty body: a bad/missing token comes back 401/403,
// while a valid token gets past auth and only fails body validation (400/422)
// — which we still count as "the token works".
export async function validateWecan(c: CourierCredentials): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/orders`, { method: 'POST', headers: headers(c), body: JSON.stringify({}) })
    return res.status !== 401 && res.status !== 403
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
        store_id: c.apiToken || undefined,
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
