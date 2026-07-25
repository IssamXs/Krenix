// ============================================================
// Client-side pixel event helpers for Meta + TikTok.
//
// The base pixel snippet in PixelScripts.tsx only fires PageView. Meta ads
// cannot optimize for conversions without ViewContent / InitiateCheckout /
// Purchase events — running ads without these = paying for clicks that Meta
// can't attribute to any outcome, so campaigns can only optimize for traffic,
// not sales. Same story for TikTok.
//
// Every helper is safe to call whether or not the pixels are configured — if
// fbq/ttq aren't loaded, the call is a no-op. Both platforms auto-deduplicate
// their base PageView so calling ViewContent right after PageView is fine.
// ============================================================

interface Fbq { (...args: unknown[]): void }
interface Ttq {
  track: (event: string, data?: Record<string, unknown>) => void
  page: () => void
}
declare global {
  interface Window {
    fbq?: Fbq
    ttq?: Ttq
  }
}

function fireMeta(event: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (typeof window.fbq !== 'function') return
  try {
    if (data) window.fbq('track', event, data)
    else window.fbq('track', event)
  } catch { /* pixel failures must never break the UI */ }
}

function fireTikTok(event: string, data?: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  if (!window.ttq || typeof window.ttq.track !== 'function') return
  try {
    if (data) window.ttq.track(event, data)
    else window.ttq.track(event)
  } catch { /* pixel failures must never break the UI */ }
}

export interface PixelProduct {
  id: string
  name: string
  price: number
  currency?: string // defaults to DZD
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
  fireTikTok('ViewContent', {
    content_id: product.id,
    content_name: product.name,
    content_type: 'product',
    value: product.price,
    currency,
    quantity: 1,
  })
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
  fireTikTok('InitiateCheckout', {
    content_id: product.id,
    content_name: product.name,
    content_type: 'product',
    quantity,
    value,
    currency,
  })
}

// Fired on the success screen after the order was persisted. THIS is the
// conversion event Meta/TikTok ad campaigns should optimize for once the
// store has enough volume. Includes the order id for cross-referencing.
export function trackPurchase(order: {
  id: string
  totalPrice: number
  productId?: string | null
  productName?: string | null
  quantity?: number
  currency?: string
}) {
  const currency = order.currency ?? 'DZD'
  fireMeta('Purchase', {
    value: order.totalPrice,
    currency,
    content_ids: order.productId ? [order.productId] : undefined,
    content_name: order.productName ?? undefined,
    content_type: 'product',
    num_items: order.quantity ?? 1,
    order_id: order.id,
  })
  fireTikTok('CompletePayment', {
    content_id: order.productId ?? undefined,
    content_name: order.productName ?? undefined,
    content_type: 'product',
    quantity: order.quantity ?? 1,
    value: order.totalPrice,
    currency,
  })
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
