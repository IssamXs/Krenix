import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInvoiceStatus } from '@/lib/slickpay'
import { getCheckoutStatus } from '@/lib/chargily'
import { decryptToken } from '@/lib/crypto'
import type { PaymentProvider } from '@/types/database'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// The provider redirects the customer here after a store-level payment.
// Re-verify status server-side (covers localhost / delayed webhooks) before
// sending the customer on to the human-facing confirmation page. Idempotent —
// a repeat visit is harmless.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('order')
  const origin = originOf(request)

  if (!orderId) return NextResponse.redirect(new URL('/paiement/retour?failed=1', origin))

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, payment_provider, payment_ref, payment_status, status')
    .eq('id', orderId)
    .maybeSingle()

  if (!order?.payment_ref || !order.payment_provider) {
    return NextResponse.redirect(new URL('/paiement/retour?failed=1', origin))
  }
  if (order.payment_status === 'paid') {
    return NextResponse.redirect(new URL(`/paiement/retour?order=${order.id}&paid=1`, origin))
  }
  const provider = order.payment_provider as PaymentProvider

  const { data: integration } = await admin
    .from('payment_integrations')
    .select('public_key')
    .eq('store_id', order.store_id)
    .eq('provider', provider)
    .maybeSingle()
  if (!integration?.public_key) {
    return NextResponse.redirect(new URL('/paiement/retour?failed=1', origin))
  }

  try {
    const key = decryptToken(integration.public_key)
    const status = provider === 'slickpay'
      ? await getInvoiceStatus(order.payment_ref, key)
      : await getCheckoutStatus(order.payment_ref, key)
    if (status === 'paid') {
      await admin.from('orders').update({
        payment_status: 'paid',
        status: order.status === 'pending' ? 'confirmed' : order.status,
      }).eq('id', order.id)
      return NextResponse.redirect(new URL(`/paiement/retour?order=${order.id}&paid=1`, origin))
    }
  } catch (err) {
    console.error('[store payment return] error:', err)
  }
  return NextResponse.redirect(new URL(`/paiement/retour?order=${order.id}&failed=1`, origin))
}
