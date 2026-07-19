import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { expireLapsedPlans } from '@/lib/plan-expiry'

// Daily Vercel cron. Expires subscriptions past their expires_at and restricts
// the stores left without cover. Idempotent — re-running changes nothing.
//
// Fails CLOSED when CRON_SECRET is unset: this route mutates billing state, so
// "no secret configured" must mean "nobody may call it", not "everybody may".
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error('[cron/expire-plans] CRON_SECRET is not set — refusing to run')
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const result = await expireLapsedPlans(createAdminClient())
    if (result.subscriptionsExpired > 0 || result.storesRestricted > 0) {
      console.log('[cron/expire-plans]', result)
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('[cron/expire-plans] failed:', err)
    return NextResponse.json({ error: 'Expiry run failed' }, { status: 500 })
  }
}
