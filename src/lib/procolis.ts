// ============================================================
// Procolis API client (BYO-key). UNVERIFIED — confirm against live docs.
// Base: https://procolis.com/api_v1  ·  Auth headers: token + key
// creds.apiId = token, creds.apiToken = key.
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult } from '@/lib/couriers'

const BASE = 'https://procolis.com/api_v1'

function headers(c: CourierCredentials): Record<string, string> {
  return { token: c.apiId, key: c.apiToken, 'Content-Type': 'application/json' }
}

export async function validateProcolis(c: CourierCredentials): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/token`, { method: 'POST', headers: headers(c) })
    return res.ok
  } catch {
    return false
  }
}

export async function createProcolisParcel(c: CourierCredentials, p: CourierParcelInput): Promise<CourierParcelResult> {
  try {
    const res = await fetch(`${BASE}/add_colis`, {
      method: 'POST',
      headers: headers(c),
      body: JSON.stringify({
        Colis: [{
          Tracking: p.orderNumber,
          TypeLivraison: '0',
          TypeColis: '0',
          Confrimee: '',
          Client: `${p.firstname} ${p.familyname}`.trim(),
          MobileA: p.phone,
          MobileB: '',
          Adresse: p.address,
          IDWilaya: p.toWilaya,
          Commune: p.toCommune,
          Total: String(Math.round(p.codAmount)),
          Note: '',
          TProduit: p.productList,
          id_Externe: p.orderNumber,
        }],
      }),
    })
    const json = (await res.json().catch(() => null)) as { Colis?: Array<{ Tracking?: string }> } | null
    if (!res.ok || !json) return { success: false, tracking: null, labelUrl: null, error: `Procolis (${res.status})` }
    return { success: true, tracking: json.Colis?.[0]?.Tracking ?? p.orderNumber, labelUrl: null }
  } catch {
    return { success: false, tracking: null, labelUrl: null, error: 'Connexion à Procolis impossible' }
  }
}
