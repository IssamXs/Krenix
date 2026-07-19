import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Callable by a Vercel cron. Protected by CRON_SECRET:
//   Authorization: Bearer <CRON_SECRET>   (Vercel cron sends this automatically)
//
// Finds abandoned-cart leads older than 30 min that haven't converted (no
// order with the same phone) and haven't been processed yet, and marks them
// as recovery-ready. NOTE: wa.me is click-to-send and can't be fired
// server-side, so actual outreach is the one-click WhatsApp relance in the
// dashboard (or SMS once a Business SMS provider is configured). This job
// just flags the window.
//
// The lookback is deliberately wide (7 days), not tied to the cron's own
// cadence — the `recovery_sent_at IS NULL` filter below is what prevents a
// lead from being re-flagged, so a wide window is safe at any run frequency.
// This currently runs once/day (vercel.json) — a temporary Vercel Hobby-plan
// limit (Hobby caps cron frequency at once/day; revert to */10 * * * * after
// upgrading to Pro) — not the ~10 min it's tuned for. A narrow window tied to
// that original cadence would have silently missed almost every cart once
// the schedule went daily.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()
  const now = Date.now()
  const from = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days ago
  const to = new Date(now - 30 * 60 * 1000).toISOString()            // 30 min ago (grace period)

  const { data: leads } = await admin
    .from('leads')
    .select('id, store_id, phone, created_at')
    .eq('status', 'abandoned')
    .is('recovery_sent_at', null)
    .gte('created_at', from)
    .lte('created_at', to)

  let processed = 0
  for (const lead of leads ?? []) {
    // Skip if this phone already placed an order for the store (already converted).
    const { count } = await admin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', lead.store_id)
      .eq('customer_phone', lead.phone)
    if ((count ?? 0) > 0) continue

    await admin.from('leads').update({ recovery_sent_at: new Date().toISOString() }).eq('id', lead.id)
    processed += 1
  }

  return NextResponse.json({ scanned: leads?.length ?? 0, flagged: processed })
}
