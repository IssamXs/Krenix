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

export async function lookupIpIntel(ip: string): Promise<IpIntel> {
  if (!ip || ip === 'unknown') return EMPTY
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,proxy,hosting`,
      { signal: AbortSignal.timeout(2000) },
    )
    if (!res.ok) return EMPTY
    const data = await res.json()
    if (data.status !== 'success') return EMPTY
    return {
      country: data.countryCode ?? null,
      isProxyOrHosting: !!data.proxy || !!data.hosting,
    }
  } catch {
    // A lookup failure must never block a real order — fail open.
    return EMPTY
  }
}
