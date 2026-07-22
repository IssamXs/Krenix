// ============================================================
// KRENIX — Rate limiting (Supabase-backed fixed window)
// Serverless functions have no shared in-memory state across invocations, so
// the counter lives in Postgres (see migration 033: rate_limits table +
// bump_rate_limit RPC, both service-role only).
// ============================================================
import { createAdminClient } from '@/lib/supabase/admin'

// Returns true if the request is ALLOWED, false if the caller is over the limit.
// Fails open (allows the request) if the limiter itself errors — a broken
// limiter must never take down a real feature.
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  try {
    const admin = createAdminClient()
    const bucketMs = windowSeconds * 1000
    const windowStart = new Date(Math.floor(Date.now() / bucketMs) * bucketMs).toISOString()
    const { data, error } = await admin.rpc('bump_rate_limit', { p_key: key, p_window_start: windowStart })
    if (error) return true
    return (data as number) <= limit
  } catch {
    return true
  }
}

// Best-effort caller IP from standard proxy headers (Vercel sets x-forwarded-for).
export function requestIp(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
