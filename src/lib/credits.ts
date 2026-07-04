// ============================================================
// NOVALUX — Credit Management
// Used in API routes for landing page generation
// ============================================================

import { createAdminClient } from '@/lib/supabase/admin'
import type { Plan } from '@/types/database'

export const PLAN_CREDITS: Record<Plan, number> = {
  basic: 5,
  pro: 20,
  ultimate: 100,
  growth: 200,
  business: 400,
  agency: 800,
  enterprise: 1500,
  sur_mesure: 0, // managed manually by super admin
}

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
