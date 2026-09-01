// ============================================================
// Client-side pixel event helpers for Meta + TikTok.
//
// The base pixel snippet in PixelScripts.tsx only fires PageView. Meta ads
// cannot optimize for conversions without ViewContent / InitiateCheckout /
// Purchase events — running ads without these = paying for clicks that Meta
// can't attribute to any outcome, so campaigns can only optimize for traffic,
// not sales. Same story for TikTok.
//
// SERVER-SIDE DEDUPLICATION
// Every event now generates a unique `event_id` that is passed to BOTH the
// browser pixel AND a server-side beacon (via /api/storefront-events). Meta
// receives both and deduplicates them into one event, so the same conversion
// is never counted twice — but if either the browser or server event fails to
// arrive (ad blocker, ITP, network issue), the other still records it.
//
// TikTok specifics that bit us in production and drive the shape below:
//   * TikTok e-commerce campaigns can be optimized on EITHER `PlaceAnOrder`
//     OR `CompletePayment` — the merchant picks one when they build the
//     campaign. Only firing CompletePayment means merchants who chose
//     PlaceAnOrder record ZERO conversions even though orders land in Krenix.
//     So we fire BOTH on every completed order.
//   * TikTok Pixel v3 wants the ecom payload nested under a `contents` array;
//     the legacy flat format still ingests but is not fully used by the
//     Product-Sales optimizer.
//   * `identify()` with hashed phone must be called BEFORE `track` for
//     Advanced Matching — this is what recovers events from iOS/ITP visitors
//     whose pixel cookie is dropped. Without it, attribution silently rots.
//
// Every helper is safe to call whether or not the pixels are configured — if
// fbq/ttq aren't loaded, the call is a no-op. Both platforms auto-deduplicate
// their base PageView so calling ViewContent right after PageView is fine.
// ============================================================

interface Fbq { (...args: unknown[]): void }
interface Ttq {
  track: (event: string, data?: Record<string, unknown>, options?: { event_id?: string }) => void
  identify: (data: Record<string, unknown>) => void
  page: () => void
}
declare global {
  interface Window {
    fbq?: Fbq
    ttq?: Ttq
    // Set by PixelScripts when a Meta pixel is configured. Needed because
    // Meta's browser-side Advanced Matching can only be supplied by re-running
    // `fbq('init', <id>, userData)` — there is no post-init setter.
    __krenixMetaPixelId?: string
    // Stable per-visitor UUID (the `_krenix_vid` cookie) used as Meta's
    // `external_id` so the same browser is recognized across sessions and can
    // be matched against the server-side Conversions API event.
    __krenixVid?: string | null
  }
}

// Stable visitor identifier — set by the PixelScripts bootstrap as a cookie so
// the server-side Conversions API can read the same value out of the request
// and keep browser/server events linked by `external_id`. Returns null if the
// bootstrap hasn't run (e.g. pixel not configured for this store).
export function getVisitorId(): string | null {
  if (typeof window === 'undefined') return null
  return window.__krenixVid ?? null
}

// ============================================================
// Event ID generation — shared between browser pixel and server CAPI.
// ============================================================

/**
 * Generate a unique event_id for deduplication between browser and server.
 * Uses crypto.randomUUID() when available (all modern browsers), falls back
 * to a timestamp + random hex string.
 */
export function generateEventId(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID()
  }
  return `e-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

// ============================================================
// Server-side beacon — sends the event to /api/storefront-events so the
// server can forward it to Meta CAPI with the same event_id.
// ============================================================

export interface BeaconData {
  storeId: string
  phone?: string | null
  customerName?: string | null
  wilaya?: string | null
}

/**
 * Send an event to the server-side CAPI endpoint via `navigator.sendBeacon`
 * (fire-and-forget, never blocks UI) or `fetch` with keepalive as fallback.
 */
function beaconToServer(
  eventName: string,
  eventId: string,
  beacon: BeaconData,
  extra?: Record<string, unknown>,
) {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({
    event_name: eventName,
    event_id: eventId,
    store_id: beacon.storeId,
    phone: beacon.phone ?? null,
    customer_name: beacon.customerName ?? null,
    wilaya: beacon.wilaya ?? null,
    ...extra,
  })
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/storefront-events',
        new Blob([payload], { type: 'application/json' }),
      )
    } else {
      fetch('/api/storefront-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {})
    }
  } catch { /* beacon failures must never break the UI */ }
}

// ============================================================
// Pixel firing helpers
// ============================================================

function fireMeta(event: string, data?: Record<string, unknown>, eventId?: string) {
  if (typeof window === 'undefined') return
  if (typeof window.fbq !== 'function') return
  try {
    if (eventId) {
      window.fbq('track', event, data ?? {}, { eventID: eventId })
    } else if (data) {
      window.fbq('track', event, data)
    } else {
      window.fbq('track', event)
    }
  } catch { /* pixel failures must never break the UI */ }
}

function fireTikTok(event: string, data?: Record<string, unknown>, eventId?: string) {
  if (typeof window === 'undefined') return
  if (!window.ttq || typeof window.ttq.track !== 'function') return
  try {
    if (eventId) window.ttq.track(event, data ?? {}, { event_id: eventId })
    else if (data) window.ttq.track(event, data)
    else window.ttq.track(event)
  } catch { /* pixel failures must never break the UI */ }
}

// Algerian local (05/06/07 + 8 digits) → digits-only international
// (213XXXXXXXXX). Anything not matching returns null so we never feed garbage
// into the pixel's Advanced Matching hash.
function normalizeAlgerianPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (/^0[567]\d{8}$/.test(digits)) return `213${digits.slice(1)}`
  if (/^213[567]\d{8}$/.test(digits)) return digits
  return null
}

async function sha256Hex(value: string): Promise<string | null> {
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null
  try {
    const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return null
  }
}

// Advanced Matching — feed the pixels an identifier so they can stitch this
// browser to a real user even if cookies are dropped (iOS/ITP, Brave, ad
// blockers, the Facebook in-app browser). This is the mechanism that recovers
// attribution for visitors whose pixel cookie was killed by the browser —
// without it, roughly 30-50% of purchases silently fail to attribute back.
//
// The two platforms want DIFFERENT things and getting this backwards silently
// destroys match rate:
//   * TikTok wants SHA-256 hashes supplied to `ttq.identify`.
//   * Meta's browser pixel wants the RAW value passed to `fbq('init', id, {...})`
//     — it hashes client-side itself. Passing an already-hashed value makes
//     Meta hash the hash, and every match fails.
export async function identifyForPixels(input: { phone?: string | null; email?: string | null }) {
  if (typeof window === 'undefined') return
  const normalisedPhone = input.phone ? normalizeAlgerianPhone(input.phone) : null
  const normalisedEmail = input.email?.trim().toLowerCase() || null
  if (!normalisedPhone && !normalisedEmail) return

  // --- Meta: raw values, re-init to attach Advanced Matching ---
  const metaPixelId = window.__krenixMetaPixelId
  if (metaPixelId && typeof window.fbq === 'function') {
    try {
      const userData: Record<string, string> = {}
      if (normalisedPhone) userData.ph = normalisedPhone
      if (normalisedEmail) userData.em = normalisedEmail
      // Meta wants `external_id` raw here — it hashes internally for matching,
      // and the server-side event must hash the SAME value with SHA-256 for
      // the two to stitch together.
      const visitorId = getVisitorId()
      if (visitorId) userData.external_id = visitorId
      window.fbq('init', metaPixelId, userData)
    } catch { /* never break the UI */ }
  }

  // --- TikTok: SHA-256 hashes ---
  if (window.ttq && typeof window.ttq.identify === 'function') {
    const [phoneHash, emailHash] = await Promise.all([
      normalisedPhone ? sha256Hex(normalisedPhone) : Promise.resolve(null),
      normalisedEmail ? sha256Hex(normalisedEmail) : Promise.resolve(null),
    ])
    if (!phoneHash && !emailHash) return
    try {
      const user: Record<string, string> = {}
      if (phoneHash) user.phone_number = phoneHash
      if (emailHash) user.email = emailHash
      window.ttq.identify(user)
    } catch { /* never break the UI */ }
  }
}

export interface PixelProduct {
  id: string
  name: string
  price: number
  currency?: string // defaults to DZD
}

// TikTok Pixel v3 ecom payload. Both the nested `contents` array and the
// legacy top-level fields are populated — the optimizer prefers the nested
// form but some older TikTok reports still read the flat one, so we keep both.
function tiktokEcomPayload(input: {
  productId?: string | null
  productName?: string | null
  price: number
  quantity: number
  currency: string
}) {
  const hasProduct = !!input.productId
  return {
    ...(hasProduct
      ? {
          contents: [
            {
              content_id: input.productId,
              content_type: 'product',
              content_name: input.productName ?? undefined,
              quantity: input.quantity,
              price: input.price,
            },
          ],
          content_id: input.productId,
          content_name: input.productName ?? undefined,
        }
      : {}),
    content_type: 'product',
    quantity: input.quantity,
    value: input.price * input.quantity,
    currency: input.currency,
  }
}

// ============================================================
// Event functions — all now generate event_id and optionally beacon to server
// ============================================================

// Fired when a customer views a product / landing page — signals Meta and
// TikTok that this visitor is interested in a specific SKU. Used by Meta's
// "Warm audience" retargeting and Advantage+ product-set optimization.
export function trackViewContent(product: PixelProduct, beacon?: BeaconData) {
  const eventId = generateEventId()
  const currency = product.currency ?? 'DZD'
  fireMeta('ViewContent', {
    content_ids: [product.id],
    content_name: product.name,
    content_type: 'product',
    value: product.price,
    currency,
  }, eventId)
  fireTikTok(
    'ViewContent',
    tiktokEcomPayload({
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: 1,
      currency,
    }),
    eventId,
  )
  if (beacon) {
    beaconToServer('ViewContent', eventId, beacon, {
      product_id: product.id,
      product_name: product.name,
      value: product.price,
    })
  }
}

// Fired when the order form is opened (before submission). Meta uses this as
// a mid-funnel signal — significantly stronger than PageView but weaker than
// Purchase. Campaigns often optimize on InitiateCheckout when Purchase volume
// is still too low for reliable learning (< ~50/week).
export function trackInitiateCheckout(product: PixelProduct, quantity = 1, beacon?: BeaconData) {
  const eventId = generateEventId()
  const currency = product.currency ?? 'DZD'
  const value = product.price * quantity
  fireMeta('InitiateCheckout', {
    content_ids: [product.id],
    content_name: product.name,
    content_type: 'product',
    num_items: quantity,
    value,
    currency,
  }, eventId)
  fireTikTok(
    'InitiateCheckout',
    tiktokEcomPayload({
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity,
      currency,
    }),
    eventId,
  )
  if (beacon) {
    beaconToServer('InitiateCheckout', eventId, beacon, {
      product_id: product.id,
      product_name: product.name,
      value,
      quantity,
    })
  }
}

// Fired on the success screen after the order was persisted. THIS is the
// conversion event Meta/TikTok ad campaigns should optimize for once the
// store has enough volume. Includes the order id for cross-referencing.
//
// Purchase does NOT beacon to /api/storefront-events — the server-side CAPI
// event is already fired from /api/orders (which has full order data). The
// browser pixel and the server CAPI are deduplicated via event_id = order.id.
//
// TikTok gets BOTH PlaceAnOrder and CompletePayment because merchants pick
// one or the other as the campaign optimization event — sending both covers
// every configuration and TikTok's Events Manager dedups on `event_id`.
export function trackPurchase(order: {
  id: string
  totalPrice: number
  productId?: string | null
  productName?: string | null
  quantity?: number
  currency?: string
}) {
  const currency = order.currency ?? 'DZD'
  const quantity = order.quantity ?? 1
  const unitPrice = quantity > 0 ? order.totalPrice / quantity : order.totalPrice

  fireMeta(
    'Purchase',
    {
      value: order.totalPrice,
      currency,
      content_ids: order.productId ? [order.productId] : undefined,
      content_name: order.productName ?? undefined,
      content_type: 'product',
      num_items: quantity,
      order_id: order.id,
    },
    order.id,
  )

  const tiktokPayload = tiktokEcomPayload({
    productId: order.productId ?? null,
    productName: order.productName ?? null,
    price: unitPrice,
    quantity,
    currency,
  })
  // `PlaceAnOrder` is the primary e-commerce conversion event on TikTok for
  // COD-heavy markets (order placed = purchase intent locked in). Fire it
  // FIRST so the beacon leaves before the success screen animates in.
  fireTikTok('PlaceAnOrder', tiktokPayload, `${order.id}-place`)
  fireTikTok('CompletePayment', tiktokPayload, `${order.id}-pay`)
}

// Fired when a visitor submits contact info without completing an order —
// currently only wired from the abandoned-cart auto-capture. Useful for
// building lead-based Custom Audiences for retargeting.
export function trackLead(product?: PixelProduct, beacon?: BeaconData) {
  const eventId = generateEventId()
  const currency = product?.currency ?? 'DZD'
  fireMeta('Lead', product ? {
    content_ids: [product.id],
    content_name: product.name,
    value: product.price,
    currency,
  } : undefined, eventId)
  fireTikTok('SubmitForm', product ? {
    content_id: product.id,
    content_name: product.name,
    value: product.price,
    currency,
  } : undefined, eventId)
  if (beacon) {
    beaconToServer('Lead', eventId, beacon, product ? {
      product_id: product.id,
      product_name: product.name,
      value: product.price,
    } : undefined)
  }
}
