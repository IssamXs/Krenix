// ============================================================
// Maystro Delivery API client (BYO-key). UNVERIFIED — confirm against live docs.
// Base: https://backend.maystro-delivery.com/api  ·  Auth: Authorization: Token <key>
// creds.apiId = API key, creds.apiToken = store id.
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult } from '@/lib/couriers'

const BASE = 'https://backend.maystro-delivery.com/api'

function headers(c: CourierCredentials): Record<string, string> {
  return { Authorization: `Token ${c.apiId}`, 'Content-Type': 'application/json' }
}

export async function validateMaystro(c: CourierCredentials): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/stores/`, { headers: headers(c) })
    return res.ok
  } catch {
    return false
  }
}

export async function createMaystroParcel(c: CourierCredentials, p: CourierParcelInput): Promise<CourierParcelResult> {
  try {
    const res = await fetch(`${BASE}/stores/orders/`, {
      method: 'POST',
      headers: headers(c),
      body: JSON.stringify({
        store: c.apiToken || undefined,
        external_order_id: p.orderNumber,
        customer_name: `${p.firstname} ${p.familyname}`.trim(),
        customer_phone: p.phone,
        destination_text: p.address,
        wilaya: p.toWilaya,
        commune: p.toCommune,
        product_name: p.productList,
        price: Math.round(p.codAmount),
      }),
    })
    const json = (await res.json().catch(() => null)) as { display_id?: string; tracking?: string; label_url?: string } | null
    if (!res.ok || !json) return { success: false, tracking: null, labelUrl: null, error: `Maystro (${res.status})` }
    return { success: true, tracking: json.tracking ?? json.display_id ?? null, labelUrl: json.label_url ?? null }
  } catch {
    return { success: false, tracking: null, labelUrl: null, error: 'Connexion à Maystro impossible' }
  }
}
