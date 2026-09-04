import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getStoreId() {
  const { data, error } = await supabase
    .from('domains')
    .select('store_id, stores(fraud_shield_enabled)')
    .eq('domain', 'moda.krenix.store')
    .single()

  if (error) {
    console.error('Error fetching domain:', error)
    return
  }
  console.log('Store ID:', data.store_id)
  console.log('Fraud Shield Enabled:', data.stores.fraud_shield_enabled)
}

getStoreId()
