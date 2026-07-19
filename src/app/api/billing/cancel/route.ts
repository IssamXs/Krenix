import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'

// Self-service "cancel at period end" for the store owner's own monthly plan.
// This never touches store access directly — it only flags the store's
// currently-active subscription row so the existing plan-expiry cron (which
// already lapses any subscription at its expires_at, renewed or not) simply
// isn't followed by a new payment. Access continues, unchanged, until then.

async function findActiveSubscription(admin: ReturnType<typeof createAdminClient>, storeId: string, plan: string) {
  const { data } = await admin
    .from('subscriptions')
    .select('id, expires_at, cancel_at_period_end')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .eq('plan', plan)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  if (store.plan === 'basic') return NextResponse.json({ plan: store.plan, cancelable: false })

  const admin = createAdminClient()
  const sub = await findActiveSubscription(admin, store.id, store.plan)
  return NextResponse.json({
    plan: store.plan,
    cancelable: true,
    cancelAtPeriodEnd: sub?.cancel_at_period_end ?? false,
    expiresAt: sub?.expires_at ?? null,
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
  if (store.plan === 'basic') {
    return NextResponse.json({ error: 'Le plan Basic est un achat unique — rien à annuler.' }, { status: 400 })
  }

  const { action } = await request.json().catch(() => ({}))
  if (action !== 'cancel' && action !== 'resume') {
    return NextResponse.json({ error: 'Action invalide' }, { status: 400 })
  }

  const admin = createAdminClient()
  const sub = await findActiveSubscription(admin, store.id, store.plan)
  if (!sub) return NextResponse.json({ error: 'Aucun abonnement actif à annuler.' }, { status: 400 })

  await admin
    .from('subscriptions')
    .update({ cancel_at_period_end: action === 'cancel' })
    .eq('id', sub.id)
    .eq('status', 'active')

  return NextResponse.json({ ok: true, cancelAtPeriodEnd: action === 'cancel', expiresAt: sub.expires_at })
}
