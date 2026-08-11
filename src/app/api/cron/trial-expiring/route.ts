import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, trialExpiringEmail } from '@/lib/email'

// Daily Vercel cron (runs before /api/cron/expire-plans so trials are still
// 'active' when checked). Emails free-trial owners whose trial ends within
// the next 24h and haven't been reminded yet.
//
// A trial IS a `subscriptions` row with plan='basic', status='active' and a
// non-null expires_at — a genuinely purchased Basic plan never expires (see
// lib/plan-expiry.ts computePlanExpiry), so that combination is unique to the
// 2-day free trial granted in Database/041_free_trial.sql.
//
// Fails CLOSED when CRON_SECRET is unset, same as expire-plans — this route
// reads owner PII (email) and shouldn't be callable by anyone who happens to
// guess the URL.
export async function GET(request: Request) {
  try {
    const secret = process.env.CRON_SECRET
    if (!secret) {
      console.error('[cron/trial-expiring] CRON_SECRET is not set — refusing to run')
      return NextResponse.json({ error: 'Not configured' }, { status: 503 })
    }
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const admin = createAdminClient()
    const nowIso = new Date().toISOString()
    const soonIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: trials } = await admin
      .from('subscriptions')
      .select('id, store_id, expires_at')
      .eq('plan', 'basic')
      .eq('status', 'active')
      .not('expires_at', 'is', null)
      .is('trial_reminder_sent_at', null)
      .gte('expires_at', nowIso)
      .lte('expires_at', soonIso)

    let sent = 0
    for (const trial of trials ?? []) {
      const { data: store } = await admin
        .from('stores')
        .select('id, name, slug, owner_id')
        .eq('id', trial.store_id)
        .maybeSingle()
      if (!store) continue

      const { data: userData } = await admin.auth.admin.getUserById(store.owner_id)
      const email = userData?.user?.email
      if (!email) continue

      const { subject, html } = trialExpiringEmail({ storeName: store.name, storeSlug: store.slug })
      const ok = await sendEmail({ to: email, subject, html })
      if (ok) {
        await admin.from('subscriptions').update({ trial_reminder_sent_at: new Date().toISOString() }).eq('id', trial.id)
        sent += 1
      }
    }

    return NextResponse.json({ scanned: trials?.length ?? 0, sent })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
