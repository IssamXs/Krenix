// ============================================================
// Free IP reputation lookup via ip-api.com (no key, ~45 req/min limit).
//
// NOTE: ip-api.com's free tier ToS restricts use to non-commercial purposes.
// Krenix is a commercial SaaS — confirm ip-api.com's paid plan (or swap this
// file for another provider) before relying on this for more than one pilot
// store at real volume. Kept isolated in this one file so swapping providers
// later is a single-file change.
// ============================================================

export interface IpIntel {
  country: string | null
  isProxyOrHosting: boolean
}

const EMPTY: IpIntel = { country: null, isProxyOrHosting: false }

// A bot wave can fire dozens of orders from the same IP in minutes; caching
// the lookup per IP (best-effort, in-memory) avoids hammering the provider
// 1:1 per order. Vercel serverless instances may reset this — it is an
// optimization, not a correctness requirement.
const CACHE_TTL_MS = 15 * 60 * 1000
const cache = new Map<string, { at: number; intel: IpIntel }>()

export async function lookupIpIntel(ip: string): Promise<IpIntel> {
  if (!ip || ip === 'unknown') return EMPTY
  const hit = cache.get(ip)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.intel
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,proxy,hosting`,
      { signal: AbortSignal.timeout(2000) },
    )
    if (!res.ok) return EMPTY
    const data = await res.json()
    if (data.status !== 'success') return EMPTY
    const intel = {
      country: data.countryCode ?? null,
      isProxyOrHosting: !!data.proxy || !!data.hosting,
    }
    cache.set(ip, { at: Date.now(), intel })
    return intel
  } catch {
    // A lookup failure must never block a real order — fail open.
    return EMPTY
  }
}
