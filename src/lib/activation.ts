// ============================================================
// Server-side plan activation & top-up granting (service-role only).
// Shared by the super-admin manual confirm and the SlickPay webhook/return so both
// paths grant exactly the same thing. All writes touch protected store columns,
// so the caller MUST pass a service-role (admin) client.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_CREDITS, PLAN_CHATBOT_LIMITS, type Plan } from '@/types/database'
import { computePlanExpiry } from '@/lib/plan-expiry'

// Length of one Fraud Shield subscription period (30 days).
export const FRAUD_SHIELD_PERIOD_MS = 30 * 24 * 60 * 60 * 1000

// Activate or renew a store's plan: mark active, grant the tier's monthly credits
// (renewal → reset to tier; upgrade/new → ADD to the balance so nothing is lost),
// and set the chatbot daily limit. Basic has no expiry; others run 30 days.
export async function activateStorePlan(admin: SupabaseClient, storeId: string, plan: Plan) {
  const { data: store } = await admin
    .from('stores').select('plan, ai_credits').eq('id', storeId).single()

  const tierCredits = PLAN_CREDITS[plan]
  const isRenewal = store?.plan === plan
  const nextCredits = isRenewal ? tierCredits : ((store?.ai_credits as number | undefined) ?? 0) + tierCredits

  await admin.from('stores').update({
    plan,
    subscription_status: 'active',
    ai_credits: nextCredits,
    chatbot_daily_limit: PLAN_CHATBOT_LIMITS[plan],
  }).eq('id', storeId)
}

// Add a purchased top-up to the account's permanent balance.
export async function grantTopup(
  admin: SupabaseClient,
  storeId: string,
  kind: 'ai_credits' | 'chatbot_messages',
  quantity: number,
) {
  const column = kind === 'ai_credits' ? 'purchased_credits' : 'purchased_chatbot'
  const { data: store } = await admin.from('stores').select(column).eq('id', storeId).single()
  const current = (store?.[column as keyof typeof store] as number | undefined) ?? 0
  await admin.from('stores').update({ [column]: current + quantity }).eq('id', storeId)
}

// Confirm a pending fraud_shield_purchases row and grant the add-on for 30 days,
// auto-enabling the shield for that store. Idempotent: only a 'pending' row can
// become active, so concurrent webhook/return calls never double-grant.
export async function confirmFraudShieldPurchase(
  admin: SupabaseClient,
  recordId: string,
  storeId: string,
  confirmedBy?: string,
): Promise<boolean> {
  const now = new Date()
  const { data: row } = await admin
    .from('fraud_shield_purchases')
    .update({
      status: 'active',
      confirmed_at: now.toISOString(),
      confirmed_by: confirmedBy ?? null,
      started_at: now.toISOString(),
      expires_at: new Date(now.getTime() + FRAUD_SHIELD_PERIOD_MS).toISOString(),
    })
    .eq('id', recordId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle()
  if (!row) return false
  // Granting the add-on turns the shield on right away (merchant can switch it
  // off any time from the Fraud Shield page).
  await admin.from('stores').update({ fraud_shield_enabled: true }).eq('id', storeId)
  return true
}

// Confirm a pending payment record and grant its plan/top-up — idempotently.
// The UPDATE only matches a still-'pending' row, so webhook + return route (and
// webhook retries) can all call this without ever double-granting. Returns true
// if THIS call performed the grant, false if it was already confirmed / not found.
export async function confirmAndActivate(
  admin: SupabaseClient,
  recordType: 'subscription' | 'credit_purchase' | 'fraud_shield',
  recordId: string,
  storeId: string,
): Promise<boolean> {
  if (recordType === 'fraud_shield') {
    return confirmFraudShieldPurchase(admin, recordId, storeId)
  }
  if (recordType === 'subscription') {
    // We need the plan before the UPDATE so the row can be stamped with the
    // right expiry in the same write — without expires_at the plan would never
    // lapse and the subscription would effectively be free forever.
    const { data: pending } = await admin
      .from('subscriptions').select('plan').eq('id', recordId).eq('status', 'pending').maybeSingle()
    if (!pending) return false

    const now = new Date()
    const { data: sub } = await admin
      .from('subscriptions')
      .update({
        status: 'active',
        confirmed_at: now.toISOString(),
        started_at: now.toISOString(),
        expires_at: computePlanExpiry(pending.plan as Plan, now),
      })
      .eq('id', recordId).eq('status', 'pending')
      .select('plan')
      .maybeSingle()
    if (!sub) return false
    await activateStorePlan(admin, storeId, sub.plan as Plan)
    return true
  }
  const { data: cp } = await admin
    .from('credit_purchases')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', recordId).eq('status', 'pending')
    .select('kind, quantity')
    .maybeSingle()
  if (!cp) return false
  await grantTopup(admin, storeId, cp.kind as 'ai_credits' | 'chatbot_messages', cp.quantity as number)
  return true
}
