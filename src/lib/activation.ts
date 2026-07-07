// ============================================================
// Server-side plan activation & top-up granting (service-role only).
// Shared by the super-admin manual confirm and the SlickPay webhook/return so both
// paths grant exactly the same thing. All writes touch protected store columns,
// so the caller MUST pass a service-role (admin) client.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_CREDITS, PLAN_CHATBOT_LIMITS, type Plan } from '@/types/database'

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

// Confirm a pending payment record and grant its plan/top-up — idempotently.
// The UPDATE only matches a still-'pending' row, so webhook + return route (and
// webhook retries) can all call this without ever double-granting. Returns true
// if THIS call performed the grant, false if it was already confirmed / not found.
export async function confirmAndActivate(
  admin: SupabaseClient,
  recordType: 'subscription' | 'credit_purchase',
  recordId: string,
  storeId: string,
): Promise<boolean> {
  if (recordType === 'subscription') {
    const { data: sub } = await admin
      .from('subscriptions')
      .update({ status: 'active', confirmed_at: new Date().toISOString(), started_at: new Date().toISOString() })
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
