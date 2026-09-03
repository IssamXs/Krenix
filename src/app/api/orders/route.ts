import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyStoreNewOrder } from '@/lib/telegram'
import { sendStorefrontPurchase } from '@/lib/storefront-capi'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { verifyTurnstileToken } from '@/lib/fraud-shield/turnstile'
import { lookupIpIntel } from '@/lib/fraud-shield/ip-intel'
import { computeFraudRiskScore } from '@/lib/fraud-shield/score'
import {
  buildAdaptiveContext,
  type OrderHistoryRow,
  type SignalHistoryRow,
} from '@/lib/fraud-shield/adaptive'
import {
  buildEngineContext,
  buildSharingAggregates,
  extractFeatures,
  type EngineOrderRow,
  type EngineSignalRow,
} from '@/lib/fraud-shield/engine'

// The extended behavioral columns arrive with migration 051. If they are not
// applied yet, selecting them makes the whole query fail — so we fall back to
// the base columns instead of 500ing every order.
const EXTENDED_SIGNAL_COLUMNS =
  'order_id, device_fingerprint, ip, ip_country, created_at, time_on_page_ms, had_movement, form_fill_ms, input_events, paste_events, avg_key_delay_ms, max_input_gap_ms, tab_hidden_ms, scroll_events, focus_events'
const BASE_SIGNAL_COLUMNS = 'order_id, device_fingerprint, ip, ip_country, created_at'

async function fetchStoreSignals(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  limit: number,
): Promise<SignalHistoryRow[]> {
  const fetchWith = async (columns: string) => {
    const { data } = await admin
      .from('fraud_order_signals')
      .select(columns)
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(limit)
    return (data ?? []) as unknown as SignalHistoryRow[]
  }
  try {
    return await fetchWith(EXTENDED_SIGNAL_COLUMNS)
  } catch {
    try {
      return await fetchWith(BASE_SIGNAL_COLUMNS)
    } catch {
      return []
    }
  }
}

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

// Records a POST that did NOT create an order — rate limit, validation, a
// suspended store, the DB trigger's own rejection, or an unexpected 500.
// Best-effort and fire-and-forget: a logging failure must never affect the
// response the customer actually sees, and the caller doesn't await this.
function logFailedAttempt(
  admin: ReturnType<typeof createAdminClient>,
  status: number,
  message: string,
  ctx: {
    store_id?: string | null
    customer_name?: string | null
    customer_phone?: string | null
    wilaya?: string | null
    commune?: string | null
    product_id?: string | null
    quantity?: number | null
    ip?: string | null
  },
) {
  try {
    admin
      .from('order_failed_attempts')
      .insert({
        store_id: ctx.store_id ?? null,
        http_status: status,
        error_message: message,
        customer_name: ctx.customer_name ?? null,
        customer_phone: ctx.customer_phone ?? null,
        wilaya: ctx.wilaya ?? null,
        commune: ctx.commune ?? null,
        product_id: ctx.product_id ?? null,
        quantity: ctx.quantity ?? null,
        ip: ctx.ip ?? null,
      })
      .then(({ error }: { error: unknown }) => {
        if (error) console.error('[api/orders] failed-attempt log insert failed:', error)
      })
  } catch (err) {
    console.error('[api/orders] failed-attempt log insert threw:', err)
  }
}

export async function POST(request: Request) {
  try {
    const admin = createAdminClient()
    const ip = requestIp(request)
    if (!(await checkRateLimit(`orders:${ip}`, 10, 600))) {
      logFailedAttempt(admin, 429, 'Trop de commandes.', { ip })
      return NextResponse.json({ error: 'Trop de commandes. Réessayez plus tard.' }, { status: 429 })
    }
    const body = await request.json()
    const {
      store_id, product_id, landing_page_id, variant,
      customer_name, customer_phone, wilaya, commune,
      color, size, quantity, unit_price, delivery_price, total_price,
      source, notes, delivery_type, items,
      turnstile_token, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms,
      input_events, paste_events, avg_key_delay_ms, max_input_gap_ms, tab_hidden_ms, scroll_events, focus_events,
    } = body
    // Shared context for logFailedAttempt — every early-return below reuses this.
    const attemptCtx = {
      store_id: store_id ?? null,
      customer_name: customer_name ?? null,
      customer_phone: customer_phone ?? null,
      wilaya: wilaya ?? null,
      commune: commune ?? null,
      product_id: product_id ?? null,
      quantity: quantity != null ? Number(quantity) : null,
      ip,
    }

    if (!store_id || !customer_name?.trim()) {
      logFailedAttempt(admin, 400, 'Champs requis manquants.', attemptCtx)
      return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    if (!validAlgerianPhone(String(customer_phone ?? ''))) {
      logFailedAttempt(admin, 400, 'Numéro de téléphone invalide.', attemptCtx)
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }
    if (!wilaya || !commune?.trim()) {
      logFailedAttempt(admin, 400, 'Wilaya et commune requises.', attemptCtx)
      return NextResponse.json({ error: 'Wilaya et commune requises.' }, { status: 400 })
    }
    const hasItems = Array.isArray(items) && items.length > 0
    let qty = 0
    if (!hasItems) {
      qty = Number(quantity)
      if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
        logFailedAttempt(admin, 400, 'Quantité invalide.', attemptCtx)
        return NextResponse.json({ error: 'Quantité invalide.' }, { status: 400 })
      }
    }

    // The store must exist, be live, and be paid — never accept orders for a
    // suspended or unactivated boutique.
    const { data: store } = await admin
      .from('stores')
      .select('id, is_suspended, subscription_status, fraud_shield_enabled, settings')
      .eq('id', store_id)
      .maybeSingle()
    if (!store || store.is_suspended || store.subscription_status !== 'active') {
      logFailedAttempt(admin, 404, 'Boutique indisponible.', attemptCtx)
      return NextResponse.json({ error: 'Boutique indisponible.' }, { status: 404 })
    }
    let fraudRiskScore: number | null = null
    let fraudSignals: Record<string, { points: number; detail: string }> | null = null
    let ipIntel = { country: null as string | null, isProxyOrHosting: false }

    if (store.fraud_shield_enabled) {
      const turnstileOk = await verifyTurnstileToken(turnstile_token, ip)
      if (!turnstileOk) {
        logFailedAttempt(admin, 400, 'Vérification anti-robot échouée.', attemptCtx)
        return NextResponse.json({ error: 'Vérification anti-robot échouée. Réessayez.' }, { status: 400 })
      }

      const [intel, { data: previousOrders }, signalHistory, { data: fingerprintMatches }] = await Promise.all([
        lookupIpIntel(ip),
        admin
          .from('orders')
          .select('id, created_at, customer_phone, customer_name, notes, fraud_label, fraud_risk_score')
          .eq('store_id', store_id)
          .order('created_at', { ascending: false })
          .limit(30),
        fetchStoreSignals(admin, store_id, 30),
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

      // Adaptive threat profile from the store's own confirmed history: once the
      // merchant confirms orders as fake/real, future orders reusing those bot
      // devices/phones get hard-flagged, while proven-real returning customers
      // stop being penalized. Learned only from merchant ground truth.
      const adaptive = buildAdaptiveContext(
        (previousOrders ?? []) as OrderHistoryRow[],
        (signalHistory ?? []) as SignalHistoryRow[],
      )

      // The evolving Engine: turns the store's confirmed history into a
      // statistical model of the bot's STRATEGY (behavior, prefixes, hours),
      // then matches the current order against the learned attack profiles —
      // so a bot wave with brand-new phones/fingerprints still gets flagged.
      const engine = buildEngineContext(
        (previousOrders ?? []) as EngineOrderRow[],
        (signalHistory ?? []) as EngineSignalRow[],
      )
      const currentFeatures = extractFeatures(
        {
          id: 'current',
          created_at: new Date().toISOString(),
          customer_phone: customer_phone ? String(customer_phone) : null,
          customer_name: customer_name ? String(customer_name) : null,
          notes: notes ? String(notes) : null,
          fraud_label: null,
          fraud_risk_score: null,
        } satisfies EngineOrderRow,
        {
          order_id: 'current',
          device_fingerprint: device_fingerprint ? String(device_fingerprint) : null,
          ip,
          ip_country: ipIntel.country,
          time_on_page_ms: time_on_page_ms ?? null,
          had_movement: !!had_movement,
          form_fill_ms: form_fill_ms ?? null,
          input_events: input_events ?? null,
          paste_events: paste_events ?? null,
          avg_key_delay_ms: avg_key_delay_ms ?? null,
          max_input_gap_ms: max_input_gap_ms ?? null,
          tab_hidden_ms: tab_hidden_ms ?? null,
          scroll_events: scroll_events ?? null,
          focus_events: focus_events ?? null,
        } satisfies EngineSignalRow,
        buildSharingAggregates(
          (previousOrders ?? []) as EngineOrderRow[],
          (signalHistory ?? []) as EngineSignalRow[],
        ),
        (previousOrders ?? []) as EngineOrderRow[],
      )

      const result = computeFraudRiskScore({
        ipCountry: ipIntel.country,
        ipIsProxyOrHosting: ipIntel.isProxyOrHosting,
        fingerprintSeenRecently: (fingerprintMatches ?? []).length > 0,
        deviceFingerprint: device_fingerprint ? String(device_fingerprint) : null,
        ip,
        hadMovement: !!had_movement,
        formFillMs: form_fill_ms ?? null,
        currentOrderTimestamp: new Date().toISOString(),
        previousOrderTimestamps: (previousOrders ?? []).map((o: { created_at: string }) => o.created_at),
        customerPhone: customer_phone ? String(customer_phone) : null,
        customerName: customer_name ? String(customer_name) : null,
        wilaya: wilaya ?? null,
        commune: commune ?? null,
        previousOrderPhones: (previousOrders ?? []).map(
          (o: { customer_phone?: string | null }) => o.customer_phone ?? null,
        ),
        previousOrderNames: (previousOrders ?? []).map(
          (o: { customer_name?: string | null }) => o.customer_name ?? null,
        ),
        adaptive,
        engine,
        features: currentFeatures,
        behavioral: {
          inputEvents: input_events ?? null,
          pasteEvents: paste_events ?? null,
          avgKeyDelayMs: avg_key_delay_ms ?? null,
          tabHiddenMs: tab_hidden_ms ?? null,
          scrollEvents: scroll_events ?? null,
          focusEvents: focus_events ?? null,
        },
      })
      fraudRiskScore = result.score
      fraudSignals = result.signals
    }

    let order: { id: string; order_number: string; total_price: number; unit_price: number; delivery_price: number; delivery_type: string; wilaya: string; commune: string; color: string | null; quantity: number; customer_name: string; customer_phone: string } | null = null
    let orderError: { code?: string; message: string } | null = null
    let cartProductIds: string[] | null = null

    if (hasItems) {
      if ((items as unknown[]).some(it => !it || typeof it !== 'object')) {
        logFailedAttempt(admin, 400, 'Panier invalide.', attemptCtx)
        return NextResponse.json({ error: 'Panier invalide.' }, { status: 400 })
      }
      const cleanItems = (items as Array<Record<string, unknown>>).map(it => ({
        product_id: String(it.product_id ?? ''),
        color: it.color ? String(it.color) : null,
        size: it.size ? String(it.size) : null,
        quantity: Number(it.quantity) || 0,
      }))
      if (cleanItems.some(it => !it.product_id || !Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 100)) {
        logFailedAttempt(admin, 400, 'Panier invalide.', attemptCtx)
        return NextResponse.json({ error: 'Panier invalide.' }, { status: 400 })
      }
      const { data, error } = await admin.rpc('create_cart_order', {
        p_store_id: store_id,
        p_customer_name: String(customer_name).trim().slice(0, 100),
        p_customer_phone: String(customer_phone).replace(/\s/g, ''),
        p_wilaya: wilaya,
        p_commune: String(commune).trim().slice(0, 100),
        p_delivery_type: delivery_type === 'desk' ? 'desk' : 'home',
        p_delivery_price: Number(delivery_price) || 0,
        p_notes: notes || null,
        p_source: source || 'form',
        p_fraud_risk_score: store.fraud_shield_enabled ? fraudRiskScore : null,
        p_fraud_signals: store.fraud_shield_enabled ? fraudSignals : null,
        p_items: cleanItems,
      })
      order = data
      orderError = error
      // Capture product ids from the cart for the CAPI event (content_ids).
      cartProductIds = [...new Set(cleanItems.map(it => it.product_id))]
    } else {
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
        // Never trust an arbitrary client string for a column with a DB CHECK
        // constraint — normalize anything that isn't exactly 'desk' to 'home'.
        delivery_type: delivery_type === 'desk' ? 'desk' : 'home',
        status: 'pending',
        source: source || 'form',
        notes: notes || null,
      }
      if (store.fraud_shield_enabled) {
        insertPayload.fraud_risk_score = fraudRiskScore
        insertPayload.fraud_signals = fraudSignals
      }
      const { data, error } = await admin
        .from('orders')
        .insert(insertPayload)
        .select('id, order_number, total_price, unit_price, delivery_price, delivery_type, wilaya, commune, color, quantity, customer_name, customer_phone')
        .single()
      order = data
      orderError = error
    }

    if (orderError) {
      // The DB triggers (validation + same-phone spam guard) raise P0001 with a
      // ready-to-show French message; surface that, hide anything else.
      console.error('[api/orders] insert failed:', orderError)
      const isTriggerMessage = orderError.code === 'P0001'
      logFailedAttempt(
        admin,
        isTriggerMessage ? 400 : 500,
        isTriggerMessage ? orderError.message : `DB error (${orderError.code ?? 'unknown'}): ${orderError.message}`,
        attemptCtx,
      )
      return NextResponse.json(
        { error: isTriggerMessage ? orderError.message : 'Erreur lors de la commande. Réessayez.' },
        { status: isTriggerMessage ? 400 : 500 },
      )
    }

    if (order?.id) {
      // Bugfix Task 4: Convert abandoned lead
      // If the customer previously abandoned checkout, convert the lead now
      await admin.from('leads')
        .update({ status: 'converted' })
        .eq('store_id', store_id)
        .eq('phone', customer_phone)
        .eq('status', 'abandoned')
    }

    if (store.fraud_shield_enabled && order?.id) {
      // Signal storage is best-effort: a failure here must never fail or 500 an
      // order that was already created successfully. Extended columns (migration
      // 051) are tried first, then the base set — so a not-yet-migrated DB still
      // records everything it can.
      const baseSignals = {
        store_id,
        order_id: order.id,
        ip,
        ip_country: ipIntel.country,
        ip_is_proxy_or_hosting: ipIntel.isProxyOrHosting,
        device_fingerprint: device_fingerprint ?? null,
        time_on_page_ms: time_on_page_ms ?? null,
        had_movement: !!had_movement,
        form_fill_ms: form_fill_ms ?? null,
      }
      const extendedSignals = {
        ...baseSignals,
        input_events: input_events ?? null,
        paste_events: paste_events ?? null,
        avg_key_delay_ms: avg_key_delay_ms ?? null,
        max_input_gap_ms: max_input_gap_ms ?? null,
        tab_hidden_ms: tab_hidden_ms ?? null,
        scroll_events: scroll_events ?? null,
        focus_events: focus_events ?? null,
      }
      try {
        const { error: sigError } = await admin.from('fraud_order_signals').insert(extendedSignals)
        if (sigError) {
          console.error('[api/orders] extended signal insert failed, retrying base:', sigError)
          await admin.from('fraud_order_signals').insert(baseSignals)
        }
      } catch (err) {
        console.error('[api/orders] signal insert failed:', err)
      }
    }

    // Server-side Purchase to the merchant's own Meta pixel (Conversions API).
    // Deduplicated against the browser pixel by `event_id` = order.id, which is
    // exactly what OrderFormFields passes as `eventID`. Awaited (never allowed
    // to throw) because serverless kills the process on response — a floating
    // promise here would frequently never be sent.
    const metaPixelId = store.settings?.metaPixelId
    const metaCapiToken = store.settings?.metaCapiToken
    if (metaPixelId && metaCapiToken && order?.id) {
      const cookieHeader = request.headers.get('cookie') ?? ''
      const readCookie = (name: string) =>
        cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null
      await sendStorefrontPurchase({
        pixelId: metaPixelId,
        accessToken: metaCapiToken,
        eventId: order.id,
        storeId: store_id,
        phone: order.customer_phone ?? null,
        customerName: order.customer_name ?? null,
        wilaya: order.wilaya ?? null,
        valueDzd: Number(order.total_price) || 0,
        productId: product_id ?? null,
        productIds: cartProductIds,
        quantity: order.quantity ?? undefined,
        clientIp: ip,
        clientUserAgent: request.headers.get('user-agent'),
        fbp: readCookie('_fbp'),
        fbc: readCookie('_fbc'),
        externalId: readCookie('_krenix_vid'),
        eventSourceUrl: request.headers.get('referer'),
      })
    }

    // Telegram new-order alert (Ultimate+). Deliberately awaited but never
    // allowed to throw: notifyStoreNewOrder swallows its own failures, and the
    // order row is already committed either way. Serverless kills the process
    // on response, so a floating promise here would often never be sent.
    await notifyStoreNewOrder(admin, store_id, {
      order_number: order?.order_number ?? null,
      customer_name: order?.customer_name ?? null,
      customer_phone: order?.customer_phone ?? null,
      wilaya: order?.wilaya ?? null,
      commune: order?.commune ?? null,
      quantity: order?.quantity ?? null,
      total_price: order?.total_price ?? null,
    })

    return NextResponse.json({ order })
  } catch (err) {
    console.error('[api/orders] unexpected error:', err)
    // `admin`/`attemptCtx` are block-scoped to the try above — unreachable here
    // if the crash happened before they were assigned (e.g. malformed JSON), so
    // this makes its own minimal, best-effort log rather than skipping it.
    try {
      logFailedAttempt(createAdminClient(), 500, err instanceof Error ? err.message : 'Unexpected error', {
        ip: requestIp(request),
      })
    } catch { /* logging must never mask the real error */ }
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}
