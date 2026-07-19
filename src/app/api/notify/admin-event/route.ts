import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendTelegramMessage } from '@/lib/telegram'
import { PLAN_LABELS, type Plan } from '@/types/database'
import type { SupabaseClient } from '@supabase/supabase-js'

type EventType = 'new_store' | 'new_payment' | 'new_topup'

// Fire-and-forget: pings the super admin's Telegram the moment a store owner
// does something that needs manual attention — a new signup, or a payment /
// top-up submitted for confirmation. Deliberately narrow: online (SlickPay)
// payments resolve themselves via webhook and aren't reported here, only the
// manual/offline submissions that actually need a human to act.
//
// Requires the caller to be authenticated AND to own the row being reported —
// without that check, anyone could spam the admin's phone by POSTing an
// arbitrary existing id. The message content always comes from the DB, never
// from the request body, so a caller can influence WHETHER a message sends
// but never WHAT it says.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false })

    const body = await request.json().catch(() => ({})) as { type?: EventType; id?: string }
    if (!body.type || !body.id) return NextResponse.json({ ok: false })

    const admin = createAdminClient()
    const text = await buildMessage(admin, body.type, body.id, user.id)
    if (!text) return NextResponse.json({ ok: false })

    await sendTelegramMessage(text)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}

async function buildMessage(
  admin: SupabaseClient,
  type: EventType,
  id: string,
  callerUserId: string,
): Promise<string | null> {
  if (type === 'new_store') {
    const { data: store } = await admin.from('stores')
      .select('name, slug, plan, owner_id').eq('id', id).maybeSingle()
    if (!store || store.owner_id !== callerUserId) return null
    return `🆕 <b>Nouvelle boutique</b>\n${store.name} (${store.slug}.krenix.store)\nPlan initial : ${PLAN_LABELS[store.plan as Plan]}`
  }

  if (type === 'new_payment') {
    const { data: sub } = await admin.from('subscriptions')
      .select('store_id, plan, amount_dzd').eq('id', id).maybeSingle()
    if (!sub) return null
    const { data: store } = await admin.from('stores')
      .select('name, slug, owner_id').eq('id', sub.store_id).maybeSingle()
    if (!store || store.owner_id !== callerUserId) return null
    return `💳 <b>Paiement soumis</b>\n${store.name} (${store.slug})\nPlan ${PLAN_LABELS[sub.plan as Plan]} — ${Number(sub.amount_dzd).toLocaleString('fr-DZ')} DZD\nÀ confirmer dans le panneau admin.`
  }

  if (type === 'new_topup') {
    const { data: cp } = await admin.from('credit_purchases')
      .select('store_id, kind, quantity, amount_dzd').eq('id', id).maybeSingle()
    if (!cp) return null
    const { data: store } = await admin.from('stores')
      .select('name, slug, owner_id').eq('id', cp.store_id).maybeSingle()
    if (!store || store.owner_id !== callerUserId) return null
    const label = cp.kind === 'ai_credits' ? 'crédits IA' : 'messages chatbot'
    return `🔋 <b>Recharge soumise</b>\n${store.name} (${store.slug})\n+${cp.quantity} ${label} — ${Number(cp.amount_dzd).toLocaleString('fr-DZ')} DZD\nÀ confirmer dans le panneau admin.`
  }

  return null
}
