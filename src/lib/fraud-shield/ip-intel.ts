// ============================================================
// IP reputation lookup.
//
// Primary provider: IPQualityScore (https://ipqualityscore.com), used when
// IPQUALITYSCORE_API_KEY is configured — a proper commercial-grade proxy/VPN/
// Tor/recent-abuse/bot signal with a fraud_score, no ToS conflict with a
// commercial SaaS. Falls back to ip-api.com (free, no key, ~45 req/min,
// non-commercial ToS) when no key is set, so Fraud Shield still works with
// zero configuration for a new/pilot deployment.
//
// The return shape is intentionally provider-agnostic ({ country,
// isProxyOrHosting }) so score.ts and the evolving engine never need to know
// which provider answered — kept isolated in this one file so swapping (or
// adding a third) provider later is a single-file change.
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

// A fraud_score at or above this is treated as proxy/hosting-equivalent even
// when IPQualityScore's boolean flags are all false (e.g. a residential proxy
// or a freshly-abused mobile IP it hasn't explicitly tagged yet).
const IPQS_FRAUD_SCORE_THRESHOLD = 75

async function lookupIpQualityScore(ip: string, apiKey: string): Promise<IpIntel | null> {
  try {
    const res = await fetch(
      `https://ipqualityscore.com/api/json/ip/${encodeURIComponent(apiKey)}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`,
      { signal: AbortSignal.timeout(2500) },
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.success) return null
    const isProxyOrHosting = !!(
      data.proxy || data.vpn || data.tor || data.active_vpn || data.active_tor ||
      data.hosting || data.recent_abuse || data.bot_status ||
      (Number(data.fraud_score) || 0) >= IPQS_FRAUD_SCORE_THRESHOLD
    )
    return { country: data.country_code ?? null, isProxyOrHosting }
  } catch {
    return null
  }
}

async function lookupIpApiFree(ip: string): Promise<IpIntel> {
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

export async function lookupIpIntel(ip: string): Promise<IpIntel> {
  if (!ip || ip === 'unknown') return EMPTY
  const hit = cache.get(ip)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.intel

  const apiKey = process.env.IPQUALITYSCORE_API_KEY
  const intel = (apiKey ? await lookupIpQualityScore(ip, apiKey) : null) ?? await lookupIpApiFree(ip)

  cache.set(ip, { at: Date.now(), intel })
  return intel
}
