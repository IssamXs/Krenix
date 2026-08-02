// ============================================================
// Cloudflare Turnstile server-side verification.
//
// Fails OPEN (treats the order as legitimate) when TURNSTILE_SECRET_KEY is
// unset or Cloudflare's endpoint errors — a misconfigured or down CAPTCHA
// provider must never block real checkouts. It only fails CLOSED (rejects
// the order) when the key IS configured and Cloudflare explicitly says the
// token is invalid, or no token was submitted at all.
// ============================================================

export async function verifyTurnstileToken(token: string | null | undefined, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return true
    const data = await res.json()
    return !!data.success
  } catch {
    return true
  }
}
