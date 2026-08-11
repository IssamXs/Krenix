import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { ASSIGNABLE_PLANS, type Plan } from '@/types/database'
import { revalidateStoreCache } from '@/lib/cache/store-cache'
import { computePlanExpiry } from '@/lib/plan-expiry'

// Credits/limits are stored as plain ints; keep them sane rather than trusting
// whatever the client sent (Number('abc') is NaN, and negatives would invert
// the credit checks everywhere downstream).
const MAX_CREDITS = 100_000
const MAX_CHATBOT_DAILY = 100_000

function readCount(value: unknown, max: number): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > max) return null
  return n
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin({ stepUp: true })
    if (!isAdminContext(auth)) return auth
    const { id } = await ctx.params
    const { plan, ai_credits, chatbot_daily_limit, trial_hours, expires_at } = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  // Explicit expiry override — lets the admin correct/extend a period directly
  // instead of only ever getting the automatic 30-day (or trial-hours) default.
  let expiresAtOverride: string | null | undefined
  if (expires_at !== undefined) {
    if (expires_at === null || expires_at === '') {
      expiresAtOverride = null
    } else {
      const d = new Date(expires_at)
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Date d\'expiration invalide' }, { status: 400 })
      expiresAtOverride = d.toISOString()
    }
  }

  // Whenever the plan changes (or the admin explicitly sets a new expiry), we
  // reconcile `subscriptions` to a single clean active row for the new state.
  //
  // WHY: this route used to only ever touch `stores.plan`, never the
  // subscriptions table. A store's very first subscription (e.g. the 2-day
  // trial) stayed `status: 'active'` forever, so after manually upgrading a
  // trial store to Pro here, the super-admin list (which reads the latest
  // active subscription's expires_at) kept showing the OLD trial's ~2-day
  // countdown under the new plan — the upgrade never got its own expiry.
  let newSubscriptionPlan: Plan | null = null
  let newSubscriptionExpiresAt: string | null = null

  if (plan === 'trial') {
    if (trial_hours === undefined) return NextResponse.json({ error: 'Heures d\'essai requises' }, { status: 400 })
    const hours = Number(trial_hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 720) return NextResponse.json({ error: 'Heures invalides' }, { status: 400 })

    patch.plan = 'basic'
    patch.subscription_status = 'active'
    newSubscriptionPlan = 'basic'
    newSubscriptionExpiresAt = expiresAtOverride ?? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
  } else if (plan !== undefined) {
    // Only real tiers are assignable — the legacy 'sur_mesure' catch-all is
    // rejected here too, so the closed dropdown can't be bypassed via the API.
    if (!ASSIGNABLE_PLANS.includes(plan as Plan)) {
      return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
    }
    patch.plan = plan
    patch.subscription_status = 'active'
    newSubscriptionPlan = plan as Plan
    newSubscriptionExpiresAt = expiresAtOverride !== undefined ? expiresAtOverride : computePlanExpiry(plan as Plan)
  } else if (expiresAtOverride !== undefined) {
    // Plan unchanged — the admin only wants to correct/extend the current
    // period's expiry. Still needs a plan value for the fresh row.
    const { data: current } = await auth.admin.from('stores').select('plan').eq('id', id).maybeSingle()
    if (current?.plan) {
      newSubscriptionPlan = current.plan as Plan
      newSubscriptionExpiresAt = expiresAtOverride
    }
  }

  if (ai_credits !== undefined) {
    const n = readCount(ai_credits, MAX_CREDITS)
    if (n === null) return NextResponse.json({ error: 'Crédits IA invalides' }, { status: 400 })
    patch.ai_credits = n
  }

  if (chatbot_daily_limit !== undefined) {
    const n = readCount(chatbot_daily_limit, MAX_CHATBOT_DAILY)
    if (n === null) return NextResponse.json({ error: 'Limite chatbot invalide' }, { status: 400 })
    patch.chatbot_daily_limit = n
  }

  if (Object.keys(patch).length === 0 && newSubscriptionPlan === null) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  if (newSubscriptionPlan) {
    // Close out every stale "active" row first so exactly one subscription —
    // the one we're about to insert — represents this store's real state.
    await auth.admin.from('subscriptions').update({ status: 'expired' }).eq('store_id', id).eq('status', 'active')
    const { error: subError } = await auth.admin.from('subscriptions').insert({
      store_id: id,
      plan: newSubscriptionPlan,
      status: 'active',
      amount_dzd: 0,
      expires_at: newSubscriptionExpiresAt,
    })
    if (subError) return NextResponse.json({ error: 'Échec de la mise à jour de l\'abonnement' }, { status: 500 })
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await auth.admin.from('stores').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  }

    await logAdminAction(auth.admin, auth.userId, 'store.update', 'store', id, { ...patch, expires_at: newSubscriptionExpiresAt })
    revalidateStoreCache() // plan change can flip storefront-visible features (e.g. chatbot on Ultimate+)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
