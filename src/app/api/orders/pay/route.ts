import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { createInvoice } from '@/lib/slickpay'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// POST { orderId } → the store's OWN SlickPay invoice for an already-created
// order, so the customer can pay online (CIB/Edahabia) instead of on delivery.
export async function POST(request: Request) {
  if (!(await checkRateLimit(`orders-pay:${requestIp(request)}`, 10, 600))) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })
  }

  const { orderId } = await request.json().catch(() => ({}))
  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, customer_name, customer_phone, total_price, payment_status')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  if (order.payment_status === 'paid') {
    return NextResponse.json({ error: 'Cette commande est déjà payée.' }, { status: 400 })
  }

  const { data: store } = await admin.from('stores').select('slug, name, online_payment_enabled').eq('id', order.store_id).single()
  if (!store?.online_payment_enabled) {
    return NextResponse.json({ error: 'Le paiement en ligne n\'est pas activé sur cette boutique.' }, { status: 400 })
  }

  const { data: integration } = await admin
    .from('payment_integrations')
    .select('public_key, enabled')
    .eq('store_id', order.store_id)
    .eq('provider', 'slickpay')
    .maybeSingle()
  if (!integration?.enabled) {
    return NextResponse.json({ error: 'Paiement en ligne non configuré pour cette boutique.' }, { status: 400 })
  }

  let key: string
  try {
    key = decryptToken(integration.public_key)
  } catch {
    return NextResponse.json({ error: 'Identifiants de paiement illisibles.' }, { status: 500 })
  }

  const origin = originOf(request)
  const webhookUrl = origin.startsWith('https://') && !origin.includes('localhost')
    ? `${origin}/api/webhooks/store-payment` : undefined
  const returnUrl = `${origin}/api/payments/store/return?order=${order.id}`

  const nameParts = (order.customer_name as string).trim().split(/\s+/)

  try {
    const { paymentUrl, invoiceId } = await createInvoice({
      key,
      amountDzd: Number(order.total_price),
      itemName: `Commande ${store.name ?? store.slug}`,
      buyer: {
        firstname: nameParts[0] || order.customer_name,
        lastname: nameParts.slice(1).join(' ') || nameParts[0] || order.customer_name,
        email: 'client@krenix.store',
      },
      returnUrl,
      webhookUrl,
      metadata: { order_id: order.id, store_id: order.store_id },
    })

    await admin.from('orders').update({
      payment_provider: 'slickpay',
      payment_ref: String(invoiceId),
    }).eq('id', order.id)

    return NextResponse.json({ checkoutUrl: paymentUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur SlickPay'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
