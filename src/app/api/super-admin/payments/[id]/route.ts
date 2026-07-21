import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { PLAN_CREDITS, PLAN_CHATBOT_LIMITS, PLAN_LABELS, type Plan } from '@/types/database'
import { computePlanExpiry } from '@/lib/plan-expiry'
import { sendEmail, planApprovedEmail } from '@/lib/email'
import type { SupabaseClient } from '@supabase/supabase-js'

// Fire-and-forget: the store owner's plan is already active regardless of
// whether this email goes out, so a failure here must never block or fail
// the confirm action itself.
async function notifyOwner(admin: SupabaseClient, ownerId: string, storeName: string, storeSlug: string, plan: Plan) {
  try {
    const { data } = await admin.auth.admin.getUserById(ownerId)
    const email = data.user?.email
    if (!email) return
    const { subject, html } = planApprovedEmail({ storeName, planLabel: PLAN_LABELS[plan], storeSlug })
    await sendEmail({ to: email, subject, html })
  } catch (err) {
    console.error('[payments/confirm] notifyOwner failed:', err)
  }
}

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { action, reason } = await request.json().catch(() => ({}))
  const admin = auth.admin

  const { data: sub } = await admin.from('subscriptions').select('store_id, plan, status').eq('id', id).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Paiement introuvable' }, { status: 400 })
  const plan = sub.plan as Plan

  if (action === 'cancel') {
    if (sub.status !== 'active') return NextResponse.json({ error: 'Ce paiement n\'est pas actif' }, { status: 400 })
    const tierCredits = PLAN_CREDITS[plan]
    const { data: store } = await admin.from('stores').select('ai_credits').eq('id', sub.store_id).single()
    const nextCredits = Math.max(0, (store?.ai_credits ?? 0) - tierCredits)

    await admin.from('subscriptions').update({
      status: 'pending', confirmed_at: null, confirmed_by: null, started_at: null, expires_at: null
    }).eq('id', id)
    
    await admin.from('stores').update({ subscription_status: 'inactive', ai_credits: nextCredits }).eq('id', sub.store_id)
    await logAdminAction(admin, auth.userId, 'payment.cancel', 'subscription', id, { plan })
    return NextResponse.json({ ok: true })
  }

  if (sub.status !== 'pending') return NextResponse.json({ error: 'Paiement déjà traité' }, { status: 400 })

  if (action === 'reject') {
    await admin.from('subscriptions').update({ status: 'rejected', rejected_reason: reason ?? null }).eq('id', id)
    await logAdminAction(admin, auth.userId, 'payment.reject', 'subscription', id, { reason })
    return NextResponse.json({ ok: true })
  }

  const { data: store } = await admin.from('stores').select('ai_credits, plan, owner_id, name, slug').eq('id', sub.store_id).single()
  const tierCredits = PLAN_CREDITS[plan]
  const isRenewal = store?.plan === plan
  const nextCredits = isRenewal ? tierCredits : (store?.ai_credits ?? 0) + tierCredits
  const now = new Date()
  const expiresAt = computePlanExpiry(plan, now)

  await admin.from('subscriptions').update({
    status: 'active', confirmed_at: now.toISOString(), confirmed_by: auth.userId,
    started_at: now.toISOString(), expires_at: expiresAt,
  }).eq('id', id)
  
  await admin.from('stores').update({
    plan, subscription_status: 'active', ai_credits: nextCredits, chatbot_daily_limit: PLAN_CHATBOT_LIMITS[plan],
  }).eq('id', sub.store_id)
  
  await logAdminAction(admin, auth.userId, 'payment.confirm', 'subscription', id, { plan, nextCredits })

  if (store?.owner_id) {
    await notifyOwner(admin, store.owner_id as string, store.name as string, store.slug as string, plan)
  }

  return NextResponse.json({ ok: true })
}
