import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const MAX_ATTEMPTS = 5
const LOCK_MINUTES = 15

// Per-email login lockout, checked/recorded by the login page around its
// client-side supabase.auth.signInWithPassword call. Supabase's own GoTrue
// backend rate-limits by IP, which a distributed attempt across many IPs
// bypasses — this closes that gap by tracking failures per account instead.
export async function POST(request: Request) {
  const { email, action, success } = await request.json() as {
    email?: string
    action?: 'check' | 'record'
    success?: boolean
  }
  if (!email || !action) {
    return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
  }
  const normalizedEmail = email.trim().toLowerCase()
  const admin = createAdminClient()

  if (action === 'check') {
    const { data } = await admin
      .from('login_attempts')
      .select('locked_until')
      .eq('email', normalizedEmail)
      .maybeSingle()

    const lockedUntil = data?.locked_until ? new Date(data.locked_until) : null
    const locked = !!lockedUntil && lockedUntil.getTime() > Date.now()
    return NextResponse.json({ locked })
  }

  if (action === 'record') {
    if (success) {
      await admin.from('login_attempts').delete().eq('email', normalizedEmail)
      return NextResponse.json({ ok: true })
    }

    const { data } = await admin
      .from('login_attempts')
      .select('failed_count')
      .eq('email', normalizedEmail)
      .maybeSingle()

    const nextCount = (data?.failed_count ?? 0) + 1
    const lockedUntil = nextCount >= MAX_ATTEMPTS
      ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString()
      : null

    await admin.from('login_attempts').upsert({
      email: normalizedEmail,
      failed_count: nextCount,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    return NextResponse.json({ ok: true, locked: !!lockedUntil })
  }

  return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
}
