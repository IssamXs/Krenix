import { NextResponse } from 'next/server'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

// Register and forgot-password call Supabase directly from the client
// ('use client' pages), so unlike login (which has its own DB-backed
// per-account lockout in /api/auth/lockout) they had no throttle beyond
// Supabase GoTrue's own IP-based rate limit — bypassable by a distributed
// attacker. This gives both flows the same DB-backed, per-account +
// per-IP protection.
const LIMITS = {
  register: { perEmail: 3, perEmailWindow: 3600, perIp: 10, perIpWindow: 3600 },
  reset: { perEmail: 3, perEmailWindow: 900, perIp: 15, perIpWindow: 3600 },
} as const

export async function POST(request: Request) {
  try {
    const { email, action } = await request.json().catch(() => ({})) as {
      email?: string
      action?: keyof typeof LIMITS
    }
    if (!email || !action || !(action in LIMITS)) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const ip = requestIp(request)
    const cfg = LIMITS[action]

    const [emailOk, ipOk] = await Promise.all([
      checkRateLimit(`auth:${action}:email:${normalizedEmail}`, cfg.perEmail, cfg.perEmailWindow),
      checkRateLimit(`auth:${action}:ip:${ip}`, cfg.perIp, cfg.perIpWindow),
    ])

    return NextResponse.json({ allowed: emailOk && ipOk })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
