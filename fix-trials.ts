import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const admin = createClient(supabaseUrl, supabaseKey)

async function fix() {
  console.log('Fetching stores...')
  // Find all basic stores that are active
  const { data: stores, error } = await admin
    .from('stores')
    .select('id, created_at, subscriptions(id)')
    .eq('plan', 'basic')
    .eq('subscription_status', 'active')

  if (error) {
    console.error(error)
    return
  }

  let fixedCount = 0
  for (const store of stores) {
    // If they have NO subscriptions, they are a bugged free trial
    if (!store.subscriptions || store.subscriptions.length === 0) {
      // Create a trial subscription that expires 48h after their store was created
      const expiresAt = new Date(new Date(store.created_at).getTime() + 48 * 60 * 60 * 1000).toISOString()
      
      console.log(`Fixing store ${store.id}, setting expiry to ${expiresAt}`)
      
      await admin.from('subscriptions').insert({
        store_id: store.id,
        plan: 'basic',
        status: 'active',
        expires_at: expiresAt,
      })

      await admin.from('stores').update({ ai_credits: 5 }).eq('id', store.id)
      fixedCount++
    }
  }

  console.log(`Fixed ${fixedCount} stores!`)
}

fix()
