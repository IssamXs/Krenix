import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { ASSIGNABLE_PLANS, type Plan } from '@/types/database'
import { revalidateStoreCache } from '@/lib/cache/store-cache'

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
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { plan, ai_credits, chatbot_daily_limit, trial_hours } = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}

  if (plan === 'trial') {
    if (trial_hours === undefined) return NextResponse.json({ error: 'Heures d\'essai requises' }, { status: 400 })
    const hours = Number(trial_hours)
    if (!Number.isFinite(hours) || hours <= 0 || hours > 720) return NextResponse.json({ error: 'Heures invalides' }, { status: 400 })
    
    patch.plan = 'basic'
    patch.subscription_status = 'active'
    
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()
    await auth.admin.from('subscriptions').insert({
      store_id: id,
      plan: 'basic',
      status: 'active',
      amount_dzd: 0,
      expires_at: expiresAt
    })
  } else if (plan !== undefined) {
    // Only real tiers are assignable — the legacy 'sur_mesure' catch-all is
    // rejected here too, so the closed dropdown can't be bypassed via the API.
    if (!ASSIGNABLE_PLANS.includes(plan as Plan)) {
      return NextResponse.json({ error: 'Plan invalide' }, { status: 400 })
    }
    patch.plan = plan
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

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucune modification' }, { status: 400 })
  }

  const { error } = await auth.admin.from('stores').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  await logAdminAction(auth.admin, auth.userId, 'store.update', 'store', id, patch)
  revalidateStoreCache() // plan change can flip storefront-visible features (e.g. chatbot on Ultimate+)
  return NextResponse.json({ ok: true })
}
