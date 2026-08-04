// ============================================================
// Client-side pixel event helpers for Meta + TikTok.
//
// The base pixel snippet in PixelScripts.tsx only fires PageView. Meta ads
// cannot optimize for conversions without ViewContent / InitiateCheckout /
// Purchase events — running ads without these = paying for clicks that Meta
// can't attribute to any outcome, so campaigns can only optimize for traffic,
// not sales. Same story for TikTok.
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
  }
}

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

// Advanced Matching — feed the TikTok pixel a hashed identifier so it can
// stitch this browser to a TikTok user even if cookies are dropped (iOS/ITP,
// Brave, ad blockers). This is the mechanism that recovers attribution for
// visitors whose pixel cookie was killed by the browser — without it, roughly
// 30-50% of iOS purchases silently fail to attribute back to TikTok ads.
// Meta's post-init Advanced Matching would require re-`init` with the pixel
// id which isn't in scope here; leave Meta alone (the reporter said Meta is
// already working) and only fix the actually-broken pixel.
export async function identifyForPixels(input: { phone?: string | null; email?: string | null }) {
  if (typeof window === 'undefined' || !window.ttq || typeof window.ttq.identify !== 'function') return
  const normalisedPhone = input.phone ? normalizeAlgerianPhone(input.phone) : null
  const normalisedEmail = input.email?.trim().toLowerCase() || null
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

// Fired when a customer views a product / landing page — signals Meta and
// TikTok that this visitor is interested in a specific SKU. Used by Meta's
// "Warm audience" retargeting and Advantage+ product-set optimization.
export function trackViewContent(product: PixelProduct) {
  const currency = product.currency ?? 'DZD'
  fireMeta('ViewContent', {
    content_ids: [product.id],
    content_name: product.name,
    content_type: 'product',
    value: product.price,
    currency,
  })
  fireTikTok(
    'ViewContent',
    tiktokEcomPayload({
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity: 1,
      currency,
    }),
  )
}

// Fired when the order form is opened (before submission). Meta uses this as
// a mid-funnel signal — significantly stronger than PageView but weaker than
// Purchase. Campaigns often optimize on InitiateCheckout when Purchase volume
// is still too low for reliable learning (< ~50/week).
export function trackInitiateCheckout(product: PixelProduct, quantity = 1) {
  const currency = product.currency ?? 'DZD'
  const value = product.price * quantity
  fireMeta('InitiateCheckout', {
    content_ids: [product.id],
    content_name: product.name,
    content_type: 'product',
    num_items: quantity,
    value,
    currency,
  })
  fireTikTok(
    'InitiateCheckout',
    tiktokEcomPayload({
      productId: product.id,
      productName: product.name,
      price: product.price,
      quantity,
      currency,
    }),
  )
}

// Fired on the success screen after the order was persisted. THIS is the
// conversion event Meta/TikTok ad campaigns should optimize for once the
// store has enough volume. Includes the order id for cross-referencing.
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
export function trackLead(product?: PixelProduct) {
  const currency = product?.currency ?? 'DZD'
  fireMeta('Lead', product ? {
    content_ids: [product.id],
    content_name: product.name,
    value: product.price,
    currency,
  } : undefined)
  fireTikTok('SubmitForm', product ? {
    content_id: product.id,
    content_name: product.name,
    value: product.price,
    currency,
  } : undefined)
}
