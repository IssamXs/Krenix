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
  stopdeskCenterId?: number // required alongside isStopdesk — see couriers.ts
  weight?: number      // parcel weight in kg (0 = unspecified)
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
    weight: p.weight ?? 0,
    // MUST stay false — see the same flag in src/lib/wecan.ts. The courier
    // adds its fee on top of `price`, which the ship route has already
    // subtracted from the order total. `true` would make the merchant prepay
    // delivery from their courier account balance and is rejected when short.
    freeshipping: false,
    is_stopdesk: p.isStopdesk ?? false,
    // Required alongside is_stopdesk: true — see the same field in
    // src/lib/wecan.ts (identical Yalidine-compatible contract).
    stopdesk_id: p.isStopdesk ? p.stopdeskCenterId : null,
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

  // Diagnostic: the price/weight printed on a real label has been observed to
  // diverge from what we submit — log the declared amount so a mismatch can
  // be traced without guessing.
  console.log('[yalidine] createParcel', {
    order_id: p.orderNumber, price: body[0].price, weight: body[0].weight, is_stopdesk: body[0].is_stopdesk,
    stopdesk_id: body[0].stopdesk_id, status: res.status,
  })
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

/**
 * Delete a parcel at the courier. Only possible while it is still pending —
 * once the courier has taken it in, the API refuses and the merchant has to
 * cancel through the courier's own dashboard. The courier's own message is
 * surfaced verbatim so the UI can tell the merchant which case they're in.
 *
 * Shared by every Yalidine-compatible courier via `base` (WeCan mirrors the
 * same DELETE /parcels/?tracking= contract).
 */
export async function deleteCompatibleParcel(
  base: string,
  c: YalidineCredentials,
  tracking: string,
): Promise<{ success: boolean; error?: string }> {
  let res: Response
  try {
    res = await fetch(`${base}/parcels/?tracking=${encodeURIComponent(tracking)}`, {
      method: 'DELETE',
      headers: authHeaders(c),
    })
  } catch {
    return { success: false, error: 'Connexion au transporteur impossible' }
  }

  const raw = await res.text().catch(() => '')
  let json: unknown = null
  try { json = raw ? JSON.parse(raw) : null } catch { json = null }

  if (!res.ok) {
    const msg = (json as { error?: { message?: string } } | null)?.error?.message
    return { success: false, error: msg ?? `Le transporteur a refusé la suppression (${res.status})${raw ? ` — ${raw.slice(0, 200)}` : ''}` }
  }

  // Success shape is keyed by tracking number: { "yal-XXXX": { "deleted": true } }
  const entry = (json as Record<string, { deleted?: boolean; message?: string }> | null)?.[tracking]
  if (entry && entry.deleted === false) {
    return { success: false, error: entry.message ?? 'Le transporteur a refusé la suppression' }
  }
  return { success: true }
}

export interface YalidineCommuneFee {
  communeName: string
  home: number | null   // express home-delivery fee (express_home)
  desk: number | null   // stopdesk pickup fee (express_desk)
}

export interface YalidineFees {
  toWilaya: string
  communes: YalidineCommuneFee[]
}

/**
 * Look up delivery fees from the store's pickup wilaya to a destination wilaya.
 * Yalidine returns a `per_commune` map with express_home / express_desk prices.
 * Returns null on any error (invalid key, network, unexpected shape).
 */
export async function getYalidineFees(
  c: YalidineCredentials,
  fromWilayaId: number,
  toWilayaId: number,
): Promise<YalidineFees | null> {
  return getCompatibleFees(BASE, c, fromWilayaId, toWilayaId)
}

/**
 * Same contract as getYalidineFees but against any base URL — WeCan mirrors
 * the /fees/ shape exactly (src/lib/wecan.ts), and courier-communes.ts uses
 * the per_commune commune_name values as the canonical spelling source.
 */
export async function getCompatibleFees(
  base: string,
  c: YalidineCredentials,
  fromWilayaId: number,
  toWilayaId: number,
): Promise<YalidineFees | null> {
  let res: Response
  try {
    res = await fetch(`${base}/fees/?from_wilaya_id=${fromWilayaId}&to_wilaya_id=${toWilayaId}`, {
      headers: authHeaders(c),
    })
  } catch {
    return null
  }
  if (!res.ok) return null

  const json = (await res.json().catch(() => null)) as {
    to_wilaya_name?: string
    per_commune?: Record<string, { commune_name?: string; express_home?: number; express_desk?: number }>
  } | null
  if (!json) return null

  const perCommune = json.per_commune ?? {}
  const communes: YalidineCommuneFee[] = Object.values(perCommune).map(v => ({
    communeName: v.commune_name ?? '',
    home: typeof v.express_home === 'number' ? v.express_home : null,
    desk: typeof v.express_desk === 'number' ? v.express_desk : null,
  }))
  return { toWilaya: json.to_wilaya_name ?? '', communes }
}

export interface YalidineCenter {
  centerId: number
  name: string
  communeId: number | null
  communeName: string
}

/**
 * Stop-desk pickup points ("Centers Endpoint" per the courier's own error
 * message). A stopdesk parcel (is_stopdesk: true) needs a `stopdesk_id`
 * naming an actual center — sending none/an invalid one is rejected with
 * "Unknown stopdesk_id value in the order_id ..." (the real LEM-0032
 * failure once the commune/delivery-type mismatch was fixed).
 *
 * Endpoint shape follows Yalidine's own documented /centers/ contract
 * (WeCan mirrors it, same as /fees/); unverified against a live key — the
 * raw response is logged below so a shape mismatch is visible in
 * production logs rather than silently misparsed.
 */
export async function getCompatibleCenters(
  base: string,
  c: YalidineCredentials,
  wilayaId: number,
): Promise<YalidineCenter[] | null> {
  let res: Response
  try {
    res = await fetch(`${base}/centers/?wilaya_id=${wilayaId}&page_size=100`, { headers: authHeaders(c) })
  } catch {
    return null
  }
  const raw = await res.text().catch(() => '')
  console.log('[centers] getCompatibleCenters', { base, wilayaId, status: res.status, raw: raw.slice(0, 500) })
  if (!res.ok) return null

  let json: unknown = null
  try { json = raw ? JSON.parse(raw) : null } catch { json = null }
  if (!json) return null

  type Row = { id?: number; center_id?: number; name?: string; center_name?: string; commune_id?: number; commune_name?: string }
  const rows: Row[] = Array.isArray(json) ? json : Array.isArray((json as { data?: unknown }).data) ? (json as { data: Row[] }).data : []

  return rows
    .map(r => ({
      centerId: Number(r.center_id ?? r.id),
      name: String(r.name ?? r.center_name ?? ''),
      communeId: r.commune_id != null ? Number(r.commune_id) : null,
      communeName: String(r.commune_name ?? ''),
    }))
    .filter(r => Number.isFinite(r.centerId))
}
