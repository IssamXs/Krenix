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
import { getCompatibleFees } from '@/lib/yalidine'
import { wilayaId } from '@/lib/wilayas'

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

/** Lowercase, accent-stripped, punctuation-free form for place matching. */
function normalizePlace(raw: string): string {
  return raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
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

  const matched = bestCommuneMatch(fees.communes.map(k => k.communeName).filter(Boolean), toCommune)
  if (!matched) return null
  const row = fees.communes.find(k => k.communeName === matched)
  return {
    toWilaya: fees.toWilaya || toWilaya,
    toCommune: matched,
    homeFee: row?.home ?? null,
    deskFee: row?.desk ?? null,
  }
}
