// ============================================================
// Meta Conversions API — PER-MERCHANT storefront purchases.
//
// Not to be confused with lib/meta-capi.ts, which is platform-level: that one
// reports Krenix's own subscription sales to Issam's pixel via env vars. This
// file reports a MERCHANT's storefront orders to the merchant's own pixel,
// using credentials stored on their store row.
//
// WHY THIS EXISTS
// The storefront previously reported Purchase from the browser only. In the
// Algerian market that quietly loses a large share of conversions:
//   * iOS/Safari ITP and Brave drop the pixel cookie
//   * ad blockers block connect.facebook.net outright
//   * the Facebook in-app browser can terminate the page on redirect before
//     the beacon flushes
// Observed on a live store: 11 real orders in the DB, 6 Purchase events in
// Events Manager — ~45% of conversions never reached Meta. A campaign
// optimising for Purchase on half the data optimises badly.
//
// DEDUPLICATION
// The browser fires `fbq('track','Purchase', …, { eventID: order.id })`. We
// send the same `event_id` here. Meta keeps whichever arrives first and drops
// the duplicate, so enabling this never double-counts.
// ============================================================
import { createHash } from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Algerian local format → Meta's expected digits-only, country-code-prefixed
// form (213XXXXXXXXX). Returns null for anything that isn't a valid Algerian
// mobile, so garbage is never hashed into user_data.
export function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (/^0[567]\d{8}$/.test(digits)) return `213${digits.slice(1)}`
  if (/^213[567]\d{8}$/.test(digits)) return digits
  return null
}

export interface StorefrontPurchaseInput {
  pixelId: string
  accessToken: string
  eventId: string
  phone?: string | null
  customerName?: string | null
  wilaya?: string | null
  valueDzd: number
  productId?: string | null
  quantity?: number
  /** Visitor's IP + UA + Meta click/browser cookies — the strongest match signals. */
  clientIp?: string | null
  clientUserAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  eventSourceUrl?: string | null
}

/**
 * Fire-and-forget. Logs failures, never throws, never rejects — a Meta outage
 * must never fail an order that is already committed to the database.
 */
export async function sendStorefrontPurchase(input: StorefrontPurchaseInput): Promise<void> {
  if (!input.pixelId || !input.accessToken) return

  const userData: Record<string, unknown> = {}
  const phone = input.phone ? normalizePhone(input.phone) : null
  if (phone) userData.ph = [sha256(phone)]
  // First name only — Meta expects lowercased, trimmed, hashed.
  const firstName = input.customerName?.trim().split(/\s+/)[0]?.toLowerCase()
  if (firstName) userData.fn = [sha256(firstName)]
  if (input.wilaya) userData.st = [sha256(input.wilaya.trim().toLowerCase())]
  userData.country = [sha256('dz')]
  // These are NOT hashed — Meta wants them raw.
  if (input.clientIp) userData.client_ip_address = input.clientIp
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent
  if (input.fbp) userData.fbp = input.fbp
  if (input.fbc) userData.fbc = input.fbc

  const customData: Record<string, unknown> = {
    value: input.valueDzd,
    currency: 'DZD',
    order_id: input.eventId,
  }
  if (input.productId) {
    customData.content_ids = [input.productId]
    customData.content_type = 'product'
  }
  if (input.quantity) customData.num_items = input.quantity

  // This runs INSIDE the checkout request (serverless kills floating promises
  // on response), so it must never hold the customer's confirmation hostage to
  // Meta's latency. 3s is far more than the API's normal response time; on
  // timeout we drop the event rather than delay the order screen.
  const abort = AbortSignal.timeout(3000)

  try {
    const res = await fetch(`${GRAPH}/${input.pixelId}/events`, {
      method: 'POST',
      signal: abort,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          event_id: input.eventId,
          action_source: 'website',
          ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
          user_data: userData,
          custom_data: customData,
        }],
        access_token: input.accessToken,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[storefront-capi] Purchase rejected:', res.status, JSON.stringify(body))
    }
  } catch (err) {
    console.error('[storefront-capi] Purchase failed:', err)
  }
}
