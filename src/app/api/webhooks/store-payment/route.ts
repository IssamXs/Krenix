import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { decryptToken } from '@/lib/crypto'

// SlickPay webhook for STORE-level (merchant-owned) invoices — mirrors
// /api/webhooks/slickpay's trust model exactly: the body is never trusted for
// paid-status. We only use it to learn which order to re-check, then look up
// that order's own stored payment_ref and ask SlickPay (with the STORE's own
// key, since the invoice lives on the store's own SlickPay account) whether
// THAT invoice is actually paid. Always 200 to avoid retry storms.
export async function POST(request: Request) {
  const raw = await request.text()
  const sig = request.headers.get('signature')
    ?? request.headers.get('x-signature')
    ?? request.headers.get('webhook-signature')
  if (sig && !verifyWebhookSignature(sig)) {
    console.warn('[store-payment webhook] signature mismatch — relying on status re-check')
  }

  let payload: { webhook_meta_data?: Record<string, string> }
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const orderId = payload.webhook_meta_data?.order_id
  if (!orderId) return NextResponse.json({ ok: true })

  try {
    const admin = createAdminClient()
    const { data: order } = await admin
      .from('orders')
      .select('id, store_id, payment_ref, payment_status, status')
      .eq('id', orderId)
      .maybeSingle()
    if (!order?.payment_ref || order.payment_status === 'paid') return NextResponse.json({ ok: true })

    const { data: integration } = await admin
      .from('payment_integrations')
      .select('public_key')
      .eq('store_id', order.store_id)
      .eq('provider', 'slickpay')
      .maybeSingle()
    if (!integration?.public_key) return NextResponse.json({ ok: true })

    const key = decryptToken(integration.public_key)
    const status = await getInvoiceStatus(order.payment_ref, key)
    if (status === 'paid') {
      await admin.from('orders').update({
        payment_status: 'paid',
        status: order.status === 'pending' ? 'confirmed' : order.status,
      }).eq('id', order.id)
    }
  } catch (err) {
    console.error('[store-payment webhook] error:', err)
  }
  return NextResponse.json({ ok: true })
}
