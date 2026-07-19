import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { postOrderToSheet } from '@/lib/sheets'

// POST { orderId } → fire the order to the store's Sheets webhook (if configured).
// Order-triggered, fire-and-forget: always returns ok so it never blocks checkout.
// Every early-return below is logged — this is the ONLY way to diagnose a
// silent Sheets failure, since the client calls this with .catch(() => {}).
export async function POST(request: Request) {
  try {
    const { orderId } = await request.json()
    if (!orderId) {
      console.error('[sheets/notify] missing orderId in request body')
      return NextResponse.json({ ok: false })
    }

    const admin = createAdminClient()

    // Two plain queries (no embedded relation) — simpler to reason about and
    // to log precisely which lookup failed.
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('order_number, customer_name, customer_phone, wilaya, commune, color, quantity, total_price, status, source, created_at, store_id, product_id')
      .eq('id', orderId)
      .single()
    if (orderErr || !order) {
      console.error('[sheets/notify] order lookup failed', orderId, orderErr?.message)
      return NextResponse.json({ ok: false })
    }

    const { data: store, error: storeErr } = await admin
      .from('stores')
      .select('settings')
      .eq('id', order.store_id)
      .single()
    if (storeErr || !store) {
      console.error('[sheets/notify] store lookup failed', order.store_id, storeErr?.message)
      return NextResponse.json({ ok: false })
    }

    const url: string | undefined = store.settings?.sheetsWebhookUrl
    if (!url) {
      // Not an error — the store simply hasn't connected Sheets.
      return NextResponse.json({ ok: false })
    }

    let productName: string | null = null
    if (order.product_id) {
      const { data: product } = await admin.from('products').select('name').eq('id', order.product_id).single()
      productName = product?.name ?? null
    }

    const sent = await postOrderToSheet(url, {
      order_number: order.order_number,
      name: order.customer_name,
      phone: order.customer_phone,
      wilaya: order.wilaya,
      commune: order.commune,
      product: productName ?? order.color ?? '—',
      quantity: order.quantity,
      total: Number(order.total_price),
      status: order.status,
      source: order.source,
      date: order.created_at,
    })
    if (!sent) console.error('[sheets/notify] postOrderToSheet failed for order', orderId)
    return NextResponse.json({ ok: sent })
  } catch (err) {
    console.error('[sheets/notify] unexpected error', err)
    return NextResponse.json({ ok: false })
  }
}
