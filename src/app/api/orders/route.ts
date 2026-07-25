import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

// Storefront order creation.
//
// This MUST be server-side. The browser previously inserted into `orders`
// directly with the anon key and asked for the row back
// (`.insert(...).select(...)`), which PostgREST turns into
// INSERT ... RETURNING. RETURNING requires a SELECT policy on the new row, and
// `orders` deliberately has no anon SELECT policy (a customer must never be
// able to read other customers' orders/phone numbers). So every real order
// failed with a 42501 RLS violation — the insert itself was fine, reading the
// row back was not. Going through the admin client here fixes that without
// opening up any anon read access.
//
// Price fields are intentionally NOT trusted from the client: the
// validate_order_insert trigger (migration 033) recomputes unit_price/
// total_price from the products table. They are still sent so manual/no-product
// orders keep a sane value.

function validAlgerianPhone(phone: string) {
  return /^(05|06|07)\d{8}$/.test(phone.replace(/\s/g, ''))
}

export async function POST(request: Request) {
  try {
    if (!(await checkRateLimit(`orders:${requestIp(request)}`, 10, 600))) {
      return NextResponse.json({ error: 'Trop de commandes. Réessayez plus tard.' }, { status: 429 })
    }

    const body = await request.json()
    const {
      store_id, product_id, landing_page_id, variant,
      customer_name, customer_phone, wilaya, commune,
      color, size, quantity, unit_price, delivery_price, total_price,
      source, notes,
    } = body

    if (!store_id || !customer_name?.trim()) {
      return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    if (!validAlgerianPhone(String(customer_phone ?? ''))) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }
    if (!wilaya || !commune?.trim()) {
      return NextResponse.json({ error: 'Wilaya et commune requises.' }, { status: 400 })
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return NextResponse.json({ error: 'Quantité invalide.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // The store must exist, be live, and be paid — never accept orders for a
    // suspended or unactivated boutique.
    const { data: store } = await admin
      .from('stores')
      .select('id, is_suspended, subscription_status')
      .eq('id', store_id)
      .maybeSingle()
    if (!store || store.is_suspended || store.subscription_status !== 'active') {
      return NextResponse.json({ error: 'Boutique indisponible.' }, { status: 404 })
    }

    const { data: order, error } = await admin
      .from('orders')
      .insert({
        store_id,
        product_id: product_id ?? null,
        landing_page_id: landing_page_id ?? null,
        variant: variant ?? null,
        customer_name: String(customer_name).trim().slice(0, 100),
        customer_phone: String(customer_phone).replace(/\s/g, ''),
        wilaya,
        commune: String(commune).trim().slice(0, 100),
        color: color || null,
        size: size || null,
        quantity: qty,
        unit_price: Number(unit_price) || 0,
        delivery_price: Number(delivery_price) || 0,
        total_price: Number(total_price) || 0,
        status: 'pending',
        source: source || 'form',
        notes: notes || null,
      })
      .select('id, order_number, total_price, wilaya, commune, color, quantity, customer_name')
      .single()

    if (error) {
      // The DB triggers (validation + same-phone spam guard) raise P0001 with a
      // ready-to-show French message; surface that, hide anything else.
      console.error('[api/orders] insert failed:', error)
      const isTriggerMessage = error.code === 'P0001'
      return NextResponse.json(
        { error: isTriggerMessage ? error.message : 'Erreur lors de la commande. Réessayez.' },
        { status: isTriggerMessage ? 400 : 500 },
      )
    }

    return NextResponse.json({ order })
  } catch (err) {
    console.error('[api/orders] unexpected error:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}
