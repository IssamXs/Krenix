import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { getYalidineFees } from '@/lib/yalidine'
import { wilayaId } from '@/lib/wilayas'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = url.searchParams.get('storeId')
  const toWilaya = url.searchParams.get('toWilaya')

  if (!storeId || !toWilaya) {
    return NextResponse.json({ error: 'storeId and toWilaya are required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Find if this store has Yalidine connected and enabled
  const { data: integration } = await admin
    .from('delivery_integrations')
    .select('api_id, api_token, from_wilaya, enabled')
    .eq('store_id', storeId)
    .eq('provider', 'yalidine')
    .maybeSingle()

  if (!integration || !integration.enabled || !integration.from_wilaya) {
    return NextResponse.json({ fee: null })
  }

  const fromId = wilayaId(integration.from_wilaya)
  const toId = wilayaId(toWilaya)

  if (!fromId || !toId) {
    return NextResponse.json({ fee: null })
  }

  let creds
  try {
    creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
  } catch {
    return NextResponse.json({ fee: null })
  }

  // Fetch the fee directly from Yalidine API
  const fees = await getYalidineFees(creds, fromId, toId)
  if (!fees || !fees.communes || fees.communes.length === 0) {
    return NextResponse.json({ fee: null })
  }

  // The destination wilaya might have multiple communes, but for a general "wilaya" selection
  // we take the first commune's home delivery price, or an average/default if we can.
  // Yalidine usually has standard prices per wilaya.
  const validFees = fees.communes.map(c => c.home).filter(f => f !== null) as number[]
  if (validFees.length === 0) {
    return NextResponse.json({ fee: null })
  }

  // Average or just the most common fee for the wilaya (often they are all the same).
  const avg = Math.round(validFees.reduce((a, b) => a + b, 0) / validFees.length)
  
  return NextResponse.json({ fee: avg })
}
