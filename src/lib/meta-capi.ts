// ============================================================
// Meta Conversions API — reports confirmed Krenix subscription sales as
// "Purchase" events so the owner's own ad account (Click-to-WhatsApp ads
// selling Krenix itself) can be optimized for Sales instead of Conversations.
// Not the same system as the per-merchant storefront pixels (MarketingPixel /
// pixel-events.ts) — this is platform-level, one pixel, the owner's own ads.
//
// No click-ID attribution is available (plain wa.me links, not the paid
// WhatsApp Business Platform), so matching relies on hashed email/phone
// ("Advanced Matching") — Meta associates the purchase with whichever of its
// users share that contact info. Weaker than click-ID matching, but still a
// real conversion signal for Sales-objective optimization.
// ============================================================
import { createHash } from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

export function isMetaCapiConfigured(): boolean {
  return !!process.env.META_CAPI_ACCESS_TOKEN && !!process.env.META_CAPI_PIXEL_ID
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Algerian local format (0X XX XX XX XX, with or without spaces) → Meta's
// expected digits-only, country-code-prefixed form (213XXXXXXXXX). Returns
// null for anything that doesn't look like a valid Algerian mobile number, so
// a garbage user_metadata.phone value is never sent to Meta.
export function normalizePhoneForMeta(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (/^0[567]\d{8}$/.test(digits)) return `213${digits.slice(1)}`
  if (/^213[567]\d{8}$/.test(digits)) return digits
  return null
}

export interface PurchaseEventInput {
  email: string
  phone?: string | null
  valueDzd: number
  /** Unique identifier for deduplication — both the SlickPay return route and
   *  the webhook may fire for the same payment; passing the subscription /
   *  credit-purchase record id as `event_id` lets Meta drop the duplicate. */
  eventId?: string | null
}

// Fire-and-forget: logs errors, never throws. A Meta API hiccup must never
// block or fail the actual payment confirmation this reports on.
export async function sendPurchaseEvent(input: PurchaseEventInput): Promise<void> {
  if (!isMetaCapiConfigured()) return

  const userData: Record<string, string[]> = {}
  const email = input.email?.trim().toLowerCase()
  if (email) userData.em = [sha256(email)]
  const normalizedPhone = input.phone ? normalizePhoneForMeta(input.phone) : null
  if (normalizedPhone) userData.ph = [sha256(normalizedPhone)]
  if (!userData.em && !userData.ph) return

  const customData: Record<string, unknown> = { value: input.valueDzd, currency: 'DZD' }
  if (input.eventId) customData.order_id = input.eventId

  try {
    const res = await fetch(`${GRAPH}/${process.env.META_CAPI_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'other',
          ...(input.eventId ? { event_id: input.eventId } : {}),
          user_data: userData,
          custom_data: customData,
        }],
        access_token: process.env.META_CAPI_ACCESS_TOKEN,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[meta-capi] Purchase event rejected:', res.status, JSON.stringify(body))
    }
  } catch (err) {
    console.error('[meta-capi] Purchase event failed:', err)
  }
}
