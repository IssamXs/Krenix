// ============================================================
// Plan expiry — the single source of truth for when a paid plan lapses.
//
// Two layers, deliberately:
//   1. The daily cron (/api/cron/expire-plans) flips lapsed plans to 'expired'.
//   2. isStoreAccessExpired() is checked at read time, so a store whose plan has
//      lapsed is locked out even if the cron never ran. Billing enforcement that
//      depends on a scheduled job alone fails silently and for free.
//
// Expiring NEVER deletes credits (CLAUDE.md rule 1: downgrade restricts access,
// it does not destroy data). Balances are frozen and restored on renewal.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_CHATBOT_LIMITS, type Plan } from '@/types/database'

export const PLAN_PERIOD_DAYS = 30

// Ordered weakest → strongest. Used to work out what a store falls back to when
// its top plan lapses but a lesser one still covers it.
const PLAN_RANK: Record<Plan, number> = {
  basic: 1, pro: 2, ultimate: 3, growth: 4, business: 5, agency: 6, enterprise: 7,
  sur_mesure: 3, // legacy catch-all — treat as Ultimate-equivalent for ranking
}

export function bestPlan(plans: Plan[]): Plan | null {
  if (plans.length === 0) return null
  return plans.reduce((a, b) => (PLAN_RANK[a] >= PLAN_RANK[b] ? a : b))
}

// Basic is a one-time purchase — it never expires, so it has no expiry date.
// Every other plan runs in 30-day periods from confirmation.
export function computePlanExpiry(plan: Plan, from: Date = new Date()): string | null {
  if (plan === 'basic') return null
  return new Date(from.getTime() + PLAN_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

// A null expiry means "never expires" (basic), NOT "already expired".
export function isExpired(expiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false
  const t = new Date(expiresAt).getTime()
  return Number.isFinite(t) && t <= now
}

export interface SubscriptionLike { status: string; expires_at: string | null }

// True when the store presents as active but every one of its active
// subscriptions has actually lapsed. Used as the read-time backstop.
//
// A store can legitimately hold several active subscriptions at once (e.g. a
// one-time Basic alongside a monthly Ultimate), so access only ends when NO
// active subscription is still within its period.
export function isStoreAccessExpired(
  store: { subscription_status: string },
  subscriptions: SubscriptionLike[] | null | undefined,
  now: number = Date.now(),
): boolean {
  if (store.subscription_status !== 'active') return false
  const active = (subscriptions ?? []).filter(s => s.status === 'active')
  if (active.length === 0) return false // nothing to judge against — leave as-is
  return active.every(s => isExpired(s.expires_at, now))
}

export interface ExpiryRunResult {
  scanned: number
  subscriptionsExpired: number
  storesRestricted: number
  storesDowngraded: number
}

// Flip every lapsed subscription to 'expired', then reconcile each affected
// store against whatever cover it has left:
//
//   • nothing left            → restrict (subscription_status 'expired')
//   • a weaker plan survives  → downgrade to that plan
//
// The downgrade branch matters: a store can hold a one-time Basic alongside a
// monthly Ultimate, and without it the lapsed Ultimate's features would ride on
// the permanent Basic forever.
//
// Credits are deliberately never touched — CLAUDE.md rule 1: a downgrade
// restricts access, it does not destroy data. Balances freeze and come back on
// renewal. Requires a service-role client (protected columns).
export async function expireLapsedPlans(admin: SupabaseClient): Promise<ExpiryRunResult> {
  const nowIso = new Date().toISOString()

  const { data: lapsed } = await admin
    .from('subscriptions')
    .select('id, store_id, plan, expires_at')
    .eq('status', 'active')
    .not('expires_at', 'is', null)
    .lte('expires_at', nowIso)

  const rows = (lapsed ?? []) as Array<{ id: string; store_id: string }>
  if (rows.length === 0) {
    return { scanned: 0, subscriptionsExpired: 0, storesRestricted: 0, storesDowngraded: 0 }
  }

  // Guard on status so a renewal landing mid-run can't be clobbered.
  const ids = rows.map(r => r.id)
  const { data: updated } = await admin
    .from('subscriptions')
    .update({ status: 'expired' })
    .in('id', ids)
    .eq('status', 'active')
    .select('id')

  let storesRestricted = 0
  let storesDowngraded = 0
  const affectedStoreIds = [...new Set(rows.map(r => r.store_id))]

  for (const storeId of affectedStoreIds) {
    const { data: survivors } = await admin
      .from('subscriptions')
      .select('plan, expires_at')
      .eq('store_id', storeId)
      .eq('status', 'active')

    const coveringPlans = (survivors ?? [])
      .filter(s => !isExpired(s.expires_at as string | null))
      .map(s => s.plan as Plan)

    const fallback = bestPlan(coveringPlans)

    if (!fallback) {
      // Nothing covers this store any more — restrict it.
      const { data: touched } = await admin
        .from('stores')
        .update({ subscription_status: 'expired', chatbot_daily_limit: 0 })
        .eq('id', storeId)
        .eq('subscription_status', 'active')
        .select('id')
      if (touched?.length) storesRestricted += 1
      continue
    }

    // Still covered, but possibly by a weaker plan than the store is currently
    // on. Drop to the best surviving plan; no-op when already there.
    const { data: store } = await admin
      .from('stores').select('plan').eq('id', storeId).maybeSingle()
    const current = store?.plan as Plan | undefined
    if (!current || PLAN_RANK[fallback] >= PLAN_RANK[current]) continue

    const { data: touched } = await admin
      .from('stores')
      .update({ plan: fallback, chatbot_daily_limit: PLAN_CHATBOT_LIMITS[fallback] })
      .eq('id', storeId)
      .eq('plan', current)
      .select('id')
    if (touched?.length) storesDowngraded += 1
  }

  return {
    scanned: rows.length,
    subscriptionsExpired: updated?.length ?? 0,
    storesRestricted,
    storesDowngraded,
  }
}
