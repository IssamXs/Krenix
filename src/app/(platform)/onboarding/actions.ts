'use server'

import { createClient } from '@supabase/supabase-js'

export async function grantTrialAccess(storeId: string, ownerId: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Check how many stores this user has
  const { count, error } = await admin
    .from('stores')
    .select('*', { count: 'exact', head: true })
    .eq('owner_id', ownerId)

  if (error || !count) return

  // If this is their first and only store, grant the 48h free trial
  if (count === 1) {
    // Force subscription status to active (bypasses the default DB trigger because we use service_role)
    // Also grant 5 AI credits for the trial
    await admin.from('stores').update({ subscription_status: 'active', ai_credits: 5 }).eq('id', storeId)

    // Ensure we don't insert duplicate subscriptions
    const { data: existing } = await admin
      .from('subscriptions')
      .select('id')
      .eq('store_id', storeId)
      .eq('status', 'active')
      .limit(1)

    if (!existing || existing.length === 0) {
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
      await admin.from('subscriptions').insert({
        store_id: storeId,
        plan: 'basic',
        status: 'active',
        amount_dzd: 0,
        expires_at: expiresAt,
      })
    }
  }
}
