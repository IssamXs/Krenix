// ============================================================
// Courier place-name resolution for Yalidine-compatible APIs.
// The courier validates `to_commune_name` / `to_wilaya_name` against
// its OWN canonical spellings — a near-match ("Ain Taya" vs "Aïn Taya",
// "Khemis-Miliana" vs "Khemis Miliana") is rejected with
// "Unknown to_commune_name value in the order_id <id>". Rather than
// maintaining a second name table that drifts from theirs, we ask the
// courier itself: the /fees/ endpoint returns the destination wilaya's
// communes spelled exactly as they must be sent back. The order's
// commune is fuzzy-matched against that list and the canonical form
// shipped. Any failure here falls back to the raw stored names so
// behavior never regresses below today's.
// ============================================================
import type { CourierCredentials } from '@/lib/couriers'
import { getCompatibleFees, getCompatibleCenters } from '@/lib/yalidine'
import { wilayaId, WILAYAS_AR } from '@/lib/wilayas'

export interface ResolvedDestination {
  toWilaya: string
  toCommune: string
  /**
   * The courier's OWN delivery fees to this commune, in DZD (null when it
   * publishes none). On `freeshipping: false` parcels the courier ADDS its
   * fee on top of the `price` we submit, so the ship route subtracts this
   * from the order total to make the collected amount land exactly on what
   * the customer was quoted. See src/app/api/integrations/delivery/ship.
   */
  homeFee: number | null
  deskFee: number | null
}

export type CourierDeliveryType = 'home' | 'desk'

/**
 * Whether the courier actually serves a resolved commune with the requested
 * delivery type. Some remote communes (e.g. Bordj Omar Driss in Illizi)
 * publish a fee for only one of home/desk — sending the other type still
 * matches the commune name but the courier rejects the parcel at creation
 * time with "commune ... is not deliverable", which tells the merchant
 * nothing actionable. Checking the fee first lets the ship route say
 * exactly which type to switch to instead.
 */
export function deliveryTypeAvailability(
  resolved: Pick<ResolvedDestination, 'homeFee' | 'deskFee'>,
  requested: CourierDeliveryType,
): { available: true } | { available: false; onlyType: CourierDeliveryType | null } {
  const requestedFee = requested === 'desk' ? resolved.deskFee : resolved.homeFee
  if (requestedFee !== null) return { available: true }
  const otherType: CourierDeliveryType = requested === 'desk' ? 'home' : 'desk'
  const otherFee = requested === 'desk' ? resolved.homeFee : resolved.deskFee
  return { available: false, onlyType: otherFee !== null ? otherType : null }
}

/** Lowercase, accent-stripped, punctuation-free form for place matching. */
function normalizePlace(raw: string): string {
  return raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

/**
 * Arabic-script equivalent of normalizePlace: drops harakat/tatweel and folds
 * the letter variants people type interchangeably (\u0623 \u0625 \u0622 \u0671 \u2192 \u0627, \u0649 \u2192 \u064a, \u0629 \u2192 \u0647)
 * so "\u0627\u0644\u064a\u0632\u064a" and "\u0625\u0644\u064a\u0632\u064a" compare equal.
 */
function normalizeArabic(raw: string): string {
  return raw
    .replace(/[\u064b-\u0652\u0640]/g, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627')
    .replace(/\u0649/g, '\u064a')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\u0621-\u064a]/g, '')
}

/**
 * Communes typed in Arabic cannot be string-matched against a courier's Latin
 * commune list \u2014 normalizePlace() strips the script entirely and yields "".
 *
 * The wilayas whose commune list we don't ship (see communes.ts: Illizi, Bordj
 * Badji Mokhtar, In Guezzam, Djanet) render a FREE-TEXT commune box at
 * checkout, and on an Arabic storefront the customer naturally types the
 * Arabic place name into it. The overwhelmingly common entry is the wilaya's
 * own name, since its chef-lieu commune shares it \u2014 so bridge through
 * WILAYAS_AR and hand back the French name, which then matches the courier's
 * list normally.
 *
 * Returns null when the text isn't recognisable, so the caller can raise an
 * actionable error instead of shipping something the courier will reject.
 */
/**
 * The commune names a courier will accept for a destination wilaya, spelled
 * exactly as they must be submitted. Powers the "pick the right commune"
 * correction flow when an order's stored commune can't be resolved.
 * Returns [] on any failure — callers treat it as "no suggestions available".
 */
export async function listCourierCommunes(
  base: string,
  creds: CourierCredentials,
  fromWilaya: string,
  toWilaya: string,
): Promise<string[]> {
  const fromId = wilayaId(fromWilaya)
  const toId = wilayaId(toWilaya)
  if (!fromId || !toId) return []
  const fees = await getCompatibleFees(base, creds, fromId, toId)
  if (!fees) return []
  return fees.communes.map(c => c.communeName).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'))
}

export function latinizeCommune(submitted: string, toWilaya: string): string | null {
  if (normalizePlace(submitted)) return submitted // already contains Latin characters
  const ar = normalizeArabic(submitted)
  if (!ar) return null

  const wilayaAr = WILAYAS_AR[toWilaya]
  if (wilayaAr && normalizeArabic(wilayaAr) === ar) return toWilaya

  // Accept any wilaya's Arabic name: the text is still meaningful on its own
  // even if it doesn't match the wilaya recorded on the order.
  for (const [fr, arName] of Object.entries(WILAYAS_AR)) {
    if (normalizeArabic(arName) === ar) return fr
  }
  return null
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length
  const prev = new Array(b.length + 1).fill(0).map((_, i) => i)
  const cur = new Array(b.length + 1).fill(0)
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]
  }
  return cur[b.length]
}

/**
 * Best canonical spelling for `submitted` among `candidates`.
 * Exact normalized match wins outright; then prefix matches and edit
 * distance ≤ 2 typos (real orders carry accents lost, hyphens dropped,
 * misspellings). Returns null when nothing is close enough — shipping an
 * actually-different commune would misroute the parcel.
 */
export function bestCommuneMatch(candidates: string[], submitted: string): string | null {
  const target = normalizePlace(submitted)
  if (!target || candidates.length === 0) return null

  let bestName: string | null = null
  let bestTier = Infinity
  let bestTiebreak = Infinity
  for (const candidate of candidates) {
    const norm = normalizePlace(candidate)
    if (!norm) continue
    if (norm === target) return candidate // exact — nothing beats it
    let tier: number
    let tiebreak: number
    if (Math.min(target.length, norm.length) >= 5 && (norm.startsWith(target) || target.startsWith(norm))) {
      tier = 1; tiebreak = 0
    } else {
      const d = levenshtein(target, norm)
      if (d > 2) continue
      tier = 2; tiebreak = d
    }
    if (tier < bestTier || (tier === bestTier && tiebreak < bestTiebreak)) {
      bestName = candidate
      bestTier = tier
      bestTiebreak = tiebreak
    }
  }
  return bestName
}

/**
 * Map an order's wilaya/commune onto the courier's canonical spellings,
 * or null when resolution isn't possible (unknown wilaya code, fees
 * endpoint unavailable, no close commune match). Callers should fall
 * back to the raw order values on null.
 */
export async function resolveCourierDestination(
  base: string,
  creds: CourierCredentials,
  fromWilaya: string,
  toWilaya: string,
  toCommune: string,
): Promise<ResolvedDestination | null> {
  const fromId = wilayaId(fromWilaya)
  const toId = wilayaId(toWilaya)
  if (!fromId || !toId || !toCommune.trim()) return null

  const fees = await getCompatibleFees(base, creds, fromId, toId)
  if (!fees) return null

  // Arabic free-text communes are bridged to their French name first —
  // otherwise they normalize to "" and can never match the courier's list.
  const searchable = latinizeCommune(toCommune, toWilaya)
  if (!searchable) return null

  const matched = bestCommuneMatch(fees.communes.map(k => k.communeName).filter(Boolean), searchable)
  if (!matched) return null
  const row = fees.communes.find(k => k.communeName === matched)
  return {
    toWilaya: fees.toWilaya || toWilaya,
    toCommune: matched,
    homeFee: row?.home ?? null,
    deskFee: row?.desk ?? null,
  }
}

export interface ResolvedCenter {
  centerId: number
  centerName: string
  /**
   * The commune the center itself is registered under. The courier requires
   * `stopdesk_id` and `to_commune_name` to name the SAME commune ("The
   * selected stopdesk_id does not belong to the selected to_commune_name")
   * — when the customer's own commune has no desk of its own and this falls
   * back to a neighbouring hub, the caller MUST submit this commune instead
   * of the customer's, since that's physically where the parcel is routed
   * and the customer travels to collect it.
   */
  communeName: string
}

/**
 * The stop-desk pickup point to submit as `stopdesk_id` on an `is_stopdesk`
 * parcel. Prefers a center exactly in the destination commune; many remote
 * communes (e.g. Bordj Omar Driss in Illizi) have no desk of their own, so
 * this falls back to the wilaya's sole center, or the closest-matching one
 * when several exist — the caller is responsible for then submitting THIS
 * center's own commune (see ResolvedCenter.communeName), not the customer's.
 * Returns null when no center exists at all (this delivery type truly isn't
 * offered) — callers must not submit is_stopdesk without a resolved id, since
 * that's exactly what "Unknown stopdesk_id value" was caused by.
 */
export async function resolveStopdeskCenter(
  base: string,
  creds: CourierCredentials,
  toWilaya: string,
  toCommune: string,
): Promise<ResolvedCenter | null> {
  const toId = wilayaId(toWilaya)
  if (!toId) return null

  const centers = await getCompatibleCenters(base, creds, toId)
  if (!centers || centers.length === 0) return null
  if (centers.length === 1) {
    return { centerId: centers[0].centerId, centerName: centers[0].name, communeName: centers[0].communeName }
  }

  const searchable = latinizeCommune(toCommune, toWilaya) ?? toCommune
  const matched = bestCommuneMatch(centers.map(c => c.communeName).filter(Boolean), searchable)
  const row = matched ? centers.find(c => c.communeName === matched) : undefined
  const chosen = row ?? centers[0]
  return { centerId: chosen.centerId, centerName: chosen.name, communeName: chosen.communeName }
}
