import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// Two-step confirmation for recovery/magic-link emails. The email link points
// here (not straight at Supabase's own /verify redirect) so the token_hash is
// only consumed when the user actually clicks the "Confirmer" button on the
// /auth/confirm page — a passive GET from an email security scanner (Outlook
// Safe Links, Gmail link prefetching, corporate proxies) never triggers this
// POST, so it can no longer burn the one-time token before the real user
// opens the email. See https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching.
export async function POST(request: Request) {
  const { token_hash, type } = (await request.json().catch(() => ({}))) as {
    token_hash?: string
    type?: EmailOtpType
  }

  if (!token_hash || !type) {
    return NextResponse.json({ ok: false, error: 'Lien invalide.' }, { status: 400 })
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash, type })

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'Ce lien a expiré ou a déjà été utilisé. Redemandez un lien.' },
      { status: 400 },
    )
  }

  return NextResponse.json({ ok: true })
}
