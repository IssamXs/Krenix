// ============================================================
// TikTok Events API (server-side CAPI) — per-store BYO Access Token, mirrors
// the client-side pixel events in pixel-events.ts with matching event_id so
// TikTok deduplicates client+server firings. Growth+ plan only (CLAUDE.md).
//
// Unlike meta-capi.ts (a single platform-level pixel for Krenix's own ads),
// this is per-merchant: each store owner pastes their own TikTok Pixel Code +
// Access Token in /dashboard/integrations/gtm.
// ============================================================
import { createHash } from 'crypto'

const TIKTOK_EVENTS_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/'

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Algerian local (05/06/07 + 8 digits) → digits-only international
// (213XXXXXXXXX). Anything not matching returns null so we never feed garbage
// into TikTok's Advanced Matching hash. Duplicated from pixel-events.ts
// (client-side, hashes with window.crypto.subtle) rather than shared — same
// duplication pattern meta-capi.ts already uses for its own phone normalizer.
function normalizeAlgerianPhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (/^0[567]\d{8}$/.test(digits)) return `213${digits.slice(1)}`
  if (/^213[567]\d{8}$/.test(digits)) return digits
  return null
}

// Best-effort cookie value extraction from a raw `Cookie` request header.
export function readCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp(`(?:^|; )${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export type TikTokCapiEvent = 'ViewContent' | 'InitiateCheckout' | 'SubmitForm' | 'PlaceAnOrder' | 'CompletePayment'

export interface TikTokEventInput {
  pixelCode: string
  accessToken: string
  event: TikTokCapiEvent
  eventId: string
  ip: string
  userAgent: string
  ttclid?: string | null
  ttp?: string | null
  phone?: string | null
  email?: string | null
  contentId?: string | null
  contentName?: string | null
  value: number
  quantity?: number
  currency?: string
}

// Fire-and-forget: logs failures, never throws. A TikTok API hiccup must
// never block order creation or page rendering — the original bug this
// feature fixes was made worse by silent failures elsewhere in the auth
// flow, so every failure path here logs with enough context to grep for.
export async function sendTikTokEvent(input: TikTokEventInput): Promise<void> {
  const user: Record<string, unknown> = {
    ip: input.ip,
    user_agent: input.userAgent,
  }
  if (input.ttclid) user.ttclid = input.ttclid
  if (input.ttp) user.ttp = input.ttp
  const normalizedPhone = input.phone ? normalizeAlgerianPhone(input.phone) : null
  if (normalizedPhone) user.phone_number = [sha256(normalizedPhone)]
  const email = input.email?.trim().toLowerCase()
  if (email) user.email = [sha256(email)]

  const properties: Record<string, unknown> = {
    value: input.value,
    currency: input.currency ?? 'DZD',
  }
  if (input.contentId) {
    properties.contents = [{
      content_id: input.contentId,
      content_type: 'product',
      content_name: input.contentName ?? undefined,
      quantity: input.quantity ?? 1,
      price: input.value,
    }]
  }

  try {
    const res = await fetch(TIKTOK_EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Access-Token': input.accessToken },
      body: JSON.stringify({
        event_source: 'web',
        event_source_id: input.pixelCode,
        data: [{
          event: input.event,
          event_id: input.eventId,
          event_time: Math.floor(Date.now() / 1000),
          user,
          properties,
        }],
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[tiktok-capi] event rejected:', input.event, res.status, JSON.stringify(body))
    }
  } catch (err) {
    console.error('[tiktok-capi] event failed:', input.event, err)
  }
}
