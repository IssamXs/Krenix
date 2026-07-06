// ============================================================
// KRENIX — Credit Management
// Used in API routes for landing page generation
// ============================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PLAN_CREDITS, type Plan } from '@/types/database'

// ============================================================
// SPEND FROM THE ACCOUNT POOL (monthly allowance first, then purchased top-ups)
// Atomic via optimistic lock on BOTH balance columns. Returns false on a race or
// insufficient funds. `planCredits`/`purchasedCredits` are the values just read.
// ============================================================
export async function spendAccountCredits(
  client: SupabaseClient,
  accountId: string,
  planCredits: number,
  purchasedCredits: number,
  cost: number,
): Promise<boolean> {
  if (planCredits + purchasedCredits < cost) return false
  const fromPlan = Math.min(planCredits, cost)
  const fromPurchased = cost - fromPlan
  const { data } = await client
    .from('stores')
    .update({ ai_credits: planCredits - fromPlan, purchased_credits: purchasedCredits - fromPurchased })
    .eq('id', accountId)
    .eq('ai_credits', planCredits)              // optimistic lock
    .eq('purchased_credits', purchasedCredits)
    .select('id')
    .maybeSingle()
  return !!data
}

// Restore both balances to the pre-spend values (rollback on generation failure).
export async function refundAccountCredits(
  client: SupabaseClient,
  accountId: string,
  planCredits: number,
  purchasedCredits: number,
): Promise<void> {
  await client.from('stores')
    .update({ ai_credits: planCredits, purchased_credits: purchasedCredits })
    .eq('id', accountId)
}

// The canonical plan → monthly AI-credit allocation lives in types/database.ts.
// Re-exported here so callers importing it from this module keep working, and so
// the two copies can no longer drift apart.
export { PLAN_CREDITS }

// ============================================================
// CHECK AND DEDUCT CREDIT (Atomic)
// Returns: { success: true } or { success: false, reason: string }
// ============================================================
export async function deductCredit(
  storeId: string,
  productId?: string,
  landingPageId?: string
): Promise<{ success: boolean; remainingCredits?: number; reason?: string }> {

  const supabase = createAdminClient()

  // Get current credits
  const { data: store, error: storeError } = await supabase
    .from('stores')
    .select('ai_credits, plan')
    .eq('id', storeId)
    .single()

  if (storeError || !store) {
    return { success: false, reason: 'Store not found' }
  }

  if (store.ai_credits <= 0) {
    return { 
      success: false, 
      reason: 'NO_CREDITS',
    }
  }

  // Atomically deduct 1 credit
  const { data: updated, error: updateError } = await supabase
    .from('stores')
    .update({ ai_credits: store.ai_credits - 1 })
    .eq('id', storeId)
    .eq('ai_credits', store.ai_credits) // Optimistic lock
    .select('ai_credits')
    .single()

  if (updateError || !updated) {
    // Race condition — try again
    return { success: false, reason: 'CONCURRENT_UPDATE' }
  }

  // Log credit usage
  await supabase.from('credit_usage').insert({
    store_id: storeId,
    product_id: productId || null,
    landing_page_id: landingPageId || null,
    type: 'landing_page',
  })

  return { 
    success: true, 
    remainingCredits: updated.ai_credits 
  }
}

// ============================================================
// GET CREDIT SUMMARY
// ============================================================
export async function getCreditSummary(storeId: string) {
  const supabase = createAdminClient()

  const { data: store } = await supabase
    .from('stores')
    .select('ai_credits, plan')
    .eq('id', storeId)
    .single()

  if (!store) return null

  // Credits used this month
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const { count: usedThisMonth } = await supabase
    .from('credit_usage')
    .select('id', { count: 'exact' })
    .eq('store_id', storeId)
    .gte('created_at', startOfMonth.toISOString())

  const monthlyAllocation = PLAN_CREDITS[store.plan as Plan]

  return {
    current: store.ai_credits,
    usedThisMonth: usedThisMonth || 0,
    monthlyAllocation,
    plan: store.plan,
  }
}

// ============================================================
// RESET MONTHLY CREDITS
// Called by a Supabase cron job or Edge Function on the 1st of each month
// ============================================================
export async function resetMonthlyCredits(storeId: string) {
  const supabase = createAdminClient()

  const { data: store } = await supabase
    .from('stores')
    .select('plan')
    .eq('id', storeId)
    .single()

  if (!store) return false

  const newCredits = PLAN_CREDITS[store.plan as Plan]
  
  // Basic plan: don't reset (one-time credits only)
  if (store.plan === 'basic') return false

  await supabase
    .from('stores')
    .update({ ai_credits: newCredits })
    .eq('id', storeId)
    .eq('subscription_status', 'active')

  return true
}
