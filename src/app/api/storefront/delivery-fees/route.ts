import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { getYalidineFees } from '@/lib/yalidine'
import { wilayaId } from '@/lib/wilayas'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

export async function GET(request: Request) {
  // Public (unauthenticated, called from the storefront checkout) — without a
  // limit, a caller could hammer arbitrary storeIds and burn through that
  // store's own Yalidine API quota/cost.
  const allowed = await checkRateLimit(`delivery-fees:${requestIp(request)}`, 30, 60)
  if (!allowed) return NextResponse.json({ error: 'Trop de requêtes. Réessayez plus tard.' }, { status: 429 })

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
    return NextResponse.json({ homeFee: null, deskFee: null })
  }

  const fromId = wilayaId(integration.from_wilaya)
  const toId = wilayaId(toWilaya)

  if (!fromId || !toId) {
    return NextResponse.json({ homeFee: null, deskFee: null })
  }

  let creds
  try {
    creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
  } catch {
    return NextResponse.json({ homeFee: null, deskFee: null })
  }

  // Fetch the fee directly from Yalidine API
  const fees = await getYalidineFees(creds, fromId, toId)
  if (!fees || !fees.communes || fees.communes.length === 0) {
    return NextResponse.json({ homeFee: null, deskFee: null })
  }

  // The destination wilaya might have multiple communes; average across them
  // for a general "wilaya" selection (often they're all the same anyway).
  // Compute both home and stop-desk averages — the storefront now offers
  // both delivery types and needs a live price for whichever the customer
  // picks.
  const avgFee = (values: (number | null)[]): number | null => {
    const valid = values.filter((f): f is number => f !== null)
    return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
  }

  const homeFee = avgFee(fees.communes.map(c => c.home))
  const deskFee = avgFee(fees.communes.map(c => c.desk))

  return NextResponse.json({ homeFee, deskFee })
}
