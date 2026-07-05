import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postOrderToSheet } from '@/lib/sheets'

// POST { orderId } → fire the order to the store's Sheets webhook (if configured).
// Order-triggered, fire-and-forget: always returns ok so it never blocks checkout.
export async function POST(request: Request) {
  try {
    const { orderId } = await request.json()
    if (!orderId) return NextResponse.json({ ok: false })

    const admin = createAdminClient()
    const { data: order } = await admin
      .from('orders')
      .select('*, product:products(name), store:stores(settings)')
      .eq('id', orderId)
      .single()

    const url: string | undefined = order?.store?.settings?.sheetsWebhookUrl
    if (!order || !url) return NextResponse.json({ ok: false })

    await postOrderToSheet(url, {
      order_number: order.order_number,
      name: order.customer_name,
      phone: order.customer_phone,
      wilaya: order.wilaya,
      commune: order.commune,
      product: order.product?.name ?? order.color ?? '—',
      quantity: order.quantity,
      total: Number(order.total_price),
      status: order.status,
      source: order.source,
      date: order.created_at,
    })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
