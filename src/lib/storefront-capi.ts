// ============================================================
// Meta Conversions API — PER-MERCHANT storefront events.
//
// Not to be confused with lib/meta-capi.ts, which is platform-level: that one
// reports Krenix's own subscription sales to Issam's pixel via env vars. This
// file reports a MERCHANT's storefront events to the merchant's own pixel,
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
import { createAdminClient } from '@/lib/supabase/admin'

const GRAPH = 'https://graph.facebook.com/v21.0'

// One retry beyond the first attempt. Only worth doing on failures that are
// plausibly transient (timeout, network error, 429, 5xx) — retrying a 4xx
// (bad token, malformed payload) just burns another timeout window for a
// response that will be identical. Timeouts shrink on retry so the worst
// case (both attempts fail) stays bounded at ~5.5s instead of doubling to 6s
// — this call is awaited inside the checkout request, so a customer-facing
// order confirmation is only ever delayed by that on the rare failure path.
const ATTEMPT_TIMEOUTS_MS = [3000, 2500]

// For non-Purchase events (ViewContent, InitiateCheckout, Lead) that arrive
// via the beacon endpoint, a single attempt with a shorter timeout is fine —
// these aren't order-critical and we don't want to slow down the response.
const BEACON_ATTEMPT_TIMEOUTS_MS = [2500]

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

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

// ============================================================
// Generic storefront event — used by ALL event types.
// ============================================================

export interface StorefrontEventInput {
  pixelId: string
  accessToken: string
  eventName: string
  eventId: string
  /** Needed only to attribute a logged delivery failure to the right store. */
  storeId: string
  phone?: string | null
  customerName?: string | null
  wilaya?: string | null
  valueDzd?: number | null
  productId?: string | null
  productName?: string | null
  /** For multi-item cart orders — takes precedence over `productId` when set. */
  productIds?: string[] | null
  quantity?: number
  /** Visitor's IP + UA + Meta click/browser cookies — the strongest match signals. */
  clientIp?: string | null
  clientUserAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  /**
   * Stable per-visitor UUID read from the `_krenix_vid` cookie (same value the
   * browser pixel passes as `external_id` at init). Hashed with SHA-256 on
   * send so Meta can stitch browser + server events to the same person.
   */
  externalId?: string | null
  eventSourceUrl?: string | null
}

/**
 * Build Meta-compliant `user_data` object from the input fields. Shared by
 * all event senders so hashing is consistent across Purchase / ViewContent /
 * InitiateCheckout / Lead.
 */
function buildUserData(input: StorefrontEventInput): Record<string, unknown> {
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
  // `external_id` IS hashed — same rule as em/ph. The browser pixel passes the
  // raw uuid at init and hashes internally; Meta compares the two hashes.
  if (input.externalId) userData.external_id = [sha256(input.externalId)]
  return userData
}

/**
 * Build event-specific `custom_data` object.
 */
function buildCustomData(input: StorefrontEventInput): Record<string, unknown> {
  const customData: Record<string, unknown> = {}
  if (input.valueDzd != null) {
    customData.value = input.valueDzd
    customData.currency = 'DZD'
  }
  // For Purchase events, include the order_id in custom_data too (Meta uses
  // it for revenue attribution and order-level dedup in the Ads dashboard).
  if (input.eventName === 'Purchase') {
    customData.order_id = input.eventId
  }
  // Cart orders supply productIds (multiple items); single-product orders use
  // productId. Either way, populate content_ids for catalog/DPA attribution.
  const ids = input.productIds?.length ? input.productIds : input.productId ? [input.productId] : null
  if (ids) {
    customData.content_ids = ids
    customData.content_type = 'product'
  }
  if (input.productName) customData.content_name = input.productName
  if (input.quantity) customData.num_items = input.quantity
  return customData
}

/**
 * Fire-and-forget. Logs failures, never throws, never rejects — a Meta outage
 * must never fail an order that is already committed to the database.
 */
export async function sendStorefrontEvent(input: StorefrontEventInput): Promise<void> {
  if (!input.pixelId || !input.accessToken) return

  const userData = buildUserData(input)
  const customData = buildCustomData(input)

  const body = JSON.stringify({
    data: [{
      event_name: input.eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: 'website',
      ...(input.eventSourceUrl ? { event_source_url: input.eventSourceUrl } : {}),
      user_data: userData,
      custom_data: customData,
    }],
    access_token: input.accessToken,
  })

  // Purchase events get retries; lighter events (ViewContent, InitiateCheckout,
  // Lead) get a single attempt to avoid holding up the beacon response.
  const timeouts = input.eventName === 'Purchase' ? ATTEMPT_TIMEOUTS_MS : BEACON_ATTEMPT_TIMEOUTS_MS

  let lastError = ''
  let attempts = 0
  for (const timeoutMs of timeouts) {
    attempts++
    try {
      const res = await fetch(`${GRAPH}/${input.pixelId}/events`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) return
      const responseBody = await res.json().catch(() => ({}))
      lastError = `${res.status} ${JSON.stringify(responseBody)}`
      console.error(`[storefront-capi] ${input.eventName} rejected (attempt ${attempts}):`, lastError)
      if (!isRetryableStatus(res.status)) break
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      console.error(`[storefront-capi] ${input.eventName} failed (attempt ${attempts}):`, lastError)
      // Timeout/network errors are always worth the one retry.
    }
  }

  // Only log persistent failures for Purchase events — ViewContent/IC/Lead
  // failures aren't worth a DB write per occurrence.
  if (input.eventName === 'Purchase') {
    await logDeliveryFailure(input.storeId, input.eventId, attempts, lastError)
  }
}

// ============================================================
// Legacy wrapper — existing callers (api/orders/route.ts) pass
// StorefrontPurchaseInput. This adapts it to the generic sender.
// ============================================================

export interface StorefrontPurchaseInput {
  pixelId: string
  accessToken: string
  eventId: string
  /** Needed only to attribute a logged delivery failure to the right store. */
  storeId: string
  phone?: string | null
  customerName?: string | null
  wilaya?: string | null
  valueDzd: number
  productId?: string | null
  /** For multi-item cart orders — takes precedence over `productId` when set. */
  productIds?: string[] | null
  quantity?: number
  /** Visitor's IP + UA + Meta click/browser cookies — the strongest match signals. */
  clientIp?: string | null
  clientUserAgent?: string | null
  fbp?: string | null
  fbc?: string | null
  /**
   * Stable per-visitor UUID read from the `_krenix_vid` cookie (same value the
   * browser pixel passes as `external_id` at init). Hashed with SHA-256 on
   * send so Meta can stitch browser + server events to the same person.
   */
  externalId?: string | null
  eventSourceUrl?: string | null
}

export async function sendStorefrontPurchase(input: StorefrontPurchaseInput): Promise<void> {
  return sendStorefrontEvent({
    ...input,
    eventName: 'Purchase',
    valueDzd: input.valueDzd,
  })
}

// Best-effort persistent trace for an event that never reached Meta after
// exhausting retries. Vercel's own log retention is too short-lived to ever
// diagnose these after the fact (see migration 069) — a failure here must
// never throw, same contract as the send itself.
async function logDeliveryFailure(
  storeId: string,
  orderId: string,
  attempts: number,
  errorMessage: string,
): Promise<void> {
  try {
    const admin = createAdminClient()
    const { error } = await admin.from('capi_delivery_failures').insert({
      store_id: storeId,
      order_id: orderId,
      event_name: 'Purchase',
      attempts,
      error_message: errorMessage.slice(0, 2000),
    })
    if (error) console.error('[storefront-capi] failed to log delivery failure:', error)
  } catch (err) {
    console.error('[storefront-capi] failed to log delivery failure:', err)
  }
}
