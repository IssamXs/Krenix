import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { verifyTurnstileToken } from '@/lib/fraud-shield/turnstile'
import { lookupIpIntel } from '@/lib/fraud-shield/ip-intel'
import { computeFraudRiskScore } from '@/lib/fraud-shield/score'

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
      turnstile_token, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms,
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
      .select('id, is_suspended, subscription_status, fraud_shield_enabled')
      .eq('id', store_id)
      .maybeSingle()
    if (!store || store.is_suspended || store.subscription_status !== 'active') {
      return NextResponse.json({ error: 'Boutique indisponible.' }, { status: 404 })
    }

    const ip = requestIp(request)
    let fraudRiskScore: number | null = null
    let fraudSignals: Record<string, { points: number; detail: string }> | null = null
    let ipIntel = { country: null as string | null, isProxyOrHosting: false }

    if (store.fraud_shield_enabled) {
      const turnstileOk = await verifyTurnstileToken(turnstile_token, ip)
      if (!turnstileOk) {
        return NextResponse.json({ error: 'Vérification anti-robot échouée. Réessayez.' }, { status: 400 })
      }

      const [intel, { data: previousOrders }, { data: fingerprintMatches }] = await Promise.all([
        lookupIpIntel(ip),
        admin
          .from('orders')
          .select('created_at')
          .eq('store_id', store_id)
          .order('created_at', { ascending: false })
          .limit(4),
        device_fingerprint
          ? admin
              .from('fraud_order_signals')
              .select('id')
              .eq('store_id', store_id)
              .eq('device_fingerprint', device_fingerprint)
              .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
              .limit(1)
          : Promise.resolve({ data: [] }),
      ])
      ipIntel = intel

      const result = computeFraudRiskScore({
        ipCountry: ipIntel.country,
        ipIsProxyOrHosting: ipIntel.isProxyOrHosting,
        fingerprintSeenRecently: (fingerprintMatches ?? []).length > 0,
        hadMovement: !!had_movement,
        formFillMs: form_fill_ms ?? null,
        currentOrderTimestamp: new Date().toISOString(),
        previousOrderTimestamps: (previousOrders ?? []).map((o: { created_at: string }) => o.created_at),
      })
      fraudRiskScore = result.score
      fraudSignals = result.signals
    }

    const insertPayload: Record<string, unknown> = {
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
    }
    if (store.fraud_shield_enabled) {
      insertPayload.fraud_risk_score = fraudRiskScore
      insertPayload.fraud_signals = fraudSignals
    }

    const { data: order, error } = await admin
      .from('orders')
      .insert(insertPayload)
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

    if (store.fraud_shield_enabled && order?.id) {
      await admin.from('fraud_order_signals').insert({
        store_id,
        order_id: order.id,
        ip,
        ip_country: ipIntel.country,
        ip_is_proxy_or_hosting: ipIntel.isProxyOrHosting,
        device_fingerprint: device_fingerprint ?? null,
        time_on_page_ms: time_on_page_ms ?? null,
        had_movement: !!had_movement,
        form_fill_ms: form_fill_ms ?? null,
      })
    }

    return NextResponse.json({ order })
  } catch (err) {
    console.error('[api/orders] unexpected error:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}
