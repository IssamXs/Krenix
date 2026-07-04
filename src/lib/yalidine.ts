// ============================================================
// Yalidine courier API client (https://api.yalidine.app/v1)
// Bring-your-own-key: credentials belong to the individual store owner.
// Auth is via X-API-ID / X-API-TOKEN request headers.
// NOTE: exact field names follow Yalidine's documented v1 contract; verify
// against a live key before production use.
// ============================================================

const BASE = 'https://api.yalidine.app/v1'

export interface YalidineCredentials {
  apiId: string
  apiToken: string
}

function authHeaders(c: YalidineCredentials): Record<string, string> {
  return {
    'X-API-ID': c.apiId,
    'X-API-TOKEN': c.apiToken,
    'Content-Type': 'application/json',
  }
}

/** Cheap authenticated ping to confirm a key pair is valid. */
export async function validateYalidineCredentials(c: YalidineCredentials): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/wilayas/?page_size=1`, { headers: authHeaders(c) })
    return res.ok
  } catch {
    return false
  }
}

export interface YalidineParcelInput {
  orderNumber: string
  fromWilaya: string   // pickup wilaya name (store's)
  firstname: string
  familyname: string
  phone: string
  address: string
  toWilaya: string
  toCommune: string
  productList: string
  codAmount: number    // amount for the courier to collect (COD)
  isStopdesk?: boolean
}

export interface YalidineParcelResult {
  success: boolean
  tracking: string | null
  labelUrl: string | null
  error?: string
}

/**
 * Create a single parcel. Yalidine accepts an array of parcels and returns an
 * object keyed by each order_id: { "<orderNumber>": { success, tracking, label, message } }.
 */
export async function createYalidineParcel(
  c: YalidineCredentials,
  p: YalidineParcelInput,
): Promise<YalidineParcelResult> {
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
    length: 0,
    width: 0,
    height: 0,
    weight: 0,
    freeshipping: false,
    is_stopdesk: p.isStopdesk ?? false,
    has_exchange: false,
    product_to_collect: null,
  }]

  let res: Response
  try {
    res = await fetch(`${BASE}/parcels/`, {
      method: 'POST',
      headers: authHeaders(c),
      body: JSON.stringify(body),
    })
  } catch {
    return { success: false, tracking: null, labelUrl: null, error: 'Connexion à Yalidine impossible' }
  }

  const json = (await res.json().catch(() => null)) as unknown
  if (!res.ok || !json) {
    return { success: false, tracking: null, labelUrl: null, error: `Yalidine a refusé la demande (${res.status})` }
  }

  type Entry = { success?: boolean; tracking?: string; label?: string; message?: string }
  const keyed = json as Record<string, Entry>
  const entry: Entry | undefined = keyed[p.orderNumber] ?? (Array.isArray(json) ? (json[0] as Entry) : undefined)

  if (!entry || entry.success === false) {
    return { success: false, tracking: null, labelUrl: null, error: entry?.message ?? 'Création du colis échouée' }
  }
  return { success: true, tracking: entry.tracking ?? null, labelUrl: entry.label ?? null }
}
