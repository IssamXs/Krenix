import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyVariantDelta, type VariantStock } from '@/lib/variants'
import { STOCK_DEDUCTED_STATUSES } from '@/lib/orders'
import type { OrderStatus } from '@/types/database'

type EditItem = { product_id: string; color: string | null; size: string | null; quantity: number }
type StockLine = { productId: string; color: string | null; size: string | null; quantity: number }

type OrderForEdit = {
  id: string
  store_id: string
  status: OrderStatus
  customer_name: string
  customer_phone: string
  wilaya: string
  commune: string
  address: string | null
  delivery_type: 'home' | 'desk'
  delivery_price: number
  free_delivery: boolean
  discount_type: 'amount' | 'percent' | null
  discount_value: number
  discount_amount: number
  quantity: number
  total_price: number
  product_id: string | null
  color: string | null
  size: string | null
  product: { name: string } | null
  order_items: { product_id: string | null; product_name: string; color: string | null; size: string | null; quantity: number }[]
}

// Mirrors adjustProductStock in dashboard/orders/page.tsx (kept separate —
// that one runs client-side off the browser Supabase client for status
// changes, this one runs server-side with the admin client since editing
// order_items requires the same elevated privilege as create_cart_order).
async function adjustStock(admin: ReturnType<typeof createAdminClient>, storeId: string, line: StockLine, delta: number) {
  const { data: product } = await admin
    .from('products').select('stock, variant_stock').eq('id', line.productId).eq('store_id', storeId).single()
  if (!product) return
  const nextVariant = applyVariantDelta(product.variant_stock as VariantStock | null, line.color, line.size, delta)
  await admin.from('products').update({
    stock: Math.max(0, product.stock + delta),
    variant_stock: nextVariant,
  }).eq('id', line.productId).eq('store_id', storeId)
}

// Edit an existing order: customer/delivery fields + product line items.
// Pricing is always recomputed server-side from the current catalog price
// (never trusted from the client) by the update_order() RPC — see
// Database/067_order_edit.sql for why this can't be a plain client-side
// .update() the way order status changes are.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    let body: Record<string, unknown>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 })
    }

    const items = body.items
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'La commande doit contenir au moins un produit' }, { status: 400 })
    }
    const cleanItems: EditItem[] = (items as Array<Record<string, unknown>>).map(it => ({
      product_id: String(it.product_id ?? ''),
      color: it.color ? String(it.color) : null,
      size: it.size ? String(it.size) : null,
      quantity: Number(it.quantity) || 0,
    }))
    if (cleanItems.some(it => !it.product_id || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 100)) {
      return NextResponse.json({ error: 'Article(s) invalide(s)' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: orderRaw } = await admin
      .from('orders')
      .select(`
        id, store_id, status, customer_name, customer_phone, wilaya, commune, address,
        delivery_type, delivery_price, free_delivery, discount_type, discount_value, discount_amount,
        quantity, total_price, product_id, color, size,
        product:products(name),
        order_items(product_id, product_name, color, size, quantity)
      `)
      .eq('id', id)
      .single()
    if (!orderRaw) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
    const order = orderRaw as unknown as OrderForEdit

    const { data: store } = await admin.from('stores').select('id, owner_id').eq('id', order.store_id).single()
    if (!store || store.owner_id !== user.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    // Remise: only 'amount' | 'percent' are accepted; anything else = no remise.
    const discountType = body.discount_type === 'amount' || body.discount_type === 'percent'
      ? body.discount_type
      : null
    const discountValue = discountType ? Math.max(0, Number(body.discount_value) || 0) : 0

    const { error } = await admin.rpc('update_order', {
      p_order_id: id,
      p_store_id: order.store_id,
      p_customer_name: String(body.customer_name ?? '').trim().slice(0, 100),
      p_customer_phone: String(body.customer_phone ?? '').replace(/\s/g, ''),
      p_wilaya: String(body.wilaya ?? ''),
      p_commune: String(body.commune ?? '').trim().slice(0, 100),
      p_address: body.address ? String(body.address) : null,
      p_delivery_type: body.delivery_type === 'desk' ? 'desk' : 'home',
      p_delivery_price: Number(body.delivery_price) || 0,
      p_items: cleanItems,
      p_free_delivery: body.free_delivery === true,
      p_discount_type: discountType,
      p_discount_value: discountValue,
    })

    if (error) {
      console.error('[api/orders/[id]] update_order failed:', error)
      const isTriggerMessage = error.code === 'P0001'
      return NextResponse.json(
        { error: isTriggerMessage ? error.message : 'Erreur lors de la modification.' },
        { status: isTriggerMessage ? 400 : 500 },
      )
    }

    // total_price is computed authoritatively by update_order() from the goods
    // subtotal, the remise, and (unless free_delivery) the delivery fee — the
    // client never sends a final total.

    // Stock reconciliation: only if this order's current status has already
    // deducted stock (edits never change status). Restock everything the
    // order used to contain, then deduct what it now contains — simpler and
    // just as correct as diffing per line, at the cost of a couple of extra
    // round trips for lines untouched by the edit.
    if (STOCK_DEDUCTED_STATUSES.has(order.status as OrderStatus)) {
      const oldLines: StockLine[] = order.order_items && order.order_items.length > 0
        ? order.order_items
            .filter((i): i is typeof i & { product_id: string } => !!i.product_id)
            .map(i => ({ productId: i.product_id, color: i.color, size: i.size, quantity: i.quantity }))
        : order.product_id
          ? [{ productId: order.product_id, color: order.color, size: order.size, quantity: order.quantity }]
          : []

      for (const line of oldLines) {
        await adjustStock(admin, order.store_id, line, line.quantity)
      }
      for (const item of cleanItems) {
        await adjustStock(admin, order.store_id, { productId: item.product_id, color: item.color, size: item.size, quantity: item.quantity }, -item.quantity)
      }
    }

    const { data: full } = await admin
      .from('orders')
      .select('*, product:products(name, preferred_delivery_provider, images, image_colors), landing_page:landing_pages(title, generated_images), order_items(id, product_id, product_name, color, size, quantity, unit_price, subtotal)')
      .eq('id', id)
      .single()

    // Edit log: a plain diff between the order as it was and as it is now,
    // for the "Historique des modifications" panel in the detail modal.
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    const scalarFields = ['customer_name', 'customer_phone', 'wilaya', 'commune', 'address', 'delivery_type', 'delivery_price', 'free_delivery', 'discount_amount', 'quantity', 'total_price'] as const
    for (const f of scalarFields) {
      const before = (order as Record<string, unknown>)[f]
      const after = (full as Record<string, unknown> | null)?.[f]
      if (after !== undefined && String(before ?? '') !== String(after ?? '')) changes[f] = { from: before, to: after }
    }
    const oldItemsList = order.order_items && order.order_items.length > 0
      ? order.order_items.map(i => `${i.product_name} x${i.quantity}`)
      : order.product_id ? [`${order.product?.name ?? 'Produit'} x${order.quantity}`] : []
    const newItemsList = (full?.order_items ?? []).map((i: { product_name: string; quantity: number }) => `${i.product_name} x${i.quantity}`)
    if ([...oldItemsList].sort().join('|') !== [...newItemsList].sort().join('|')) {
      changes.items = { from: oldItemsList, to: newItemsList }
    }

    if (Object.keys(changes).length > 0) {
      await admin.from('order_edits').insert({ order_id: id, store_id: order.store_id, changes })
    }

    return NextResponse.json({ order: full })
  } catch (err) {
    console.error('[api/orders/[id]] unexpected error:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}
