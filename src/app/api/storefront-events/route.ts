import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendStorefrontEvent } from '@/lib/storefront-capi'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

// Valid Meta standard event names — reject anything else to prevent
// the endpoint from being used to fire arbitrary events.
const ALLOWED_EVENTS = new Set(['ViewContent', 'InitiateCheckout', 'Lead'])

/**
 * Lightweight beacon endpoint for client → server CAPI forwarding.
 *
 * The browser fires the pixel event first (fbq/ttq), then sends a beacon here
 * with the SAME event_id. This route looks up the store's CAPI credentials,
 * extracts cookies/IP/UA from the request, and forwards the event to Meta's
 * Conversions API — giving every event server-side coverage that the browser
 * pixel alone can't guarantee (iOS ITP, ad blockers, in-app browser drops).
 *
 * Purchase events are NOT handled here — they fire from /api/orders which
 * already calls sendStorefrontPurchase() with full order data.
 */
export async function POST(request: Request) {
  const ip = requestIp(request)
  // Generous limit: a single visitor might fire ViewContent + InitiateCheckout
  // + Lead within one session, but 30 events in 60 seconds is clearly abuse.
  if (!(await checkRateLimit(`sf-events:${ip}`, 30, 60))) {
    return NextResponse.json({ ok: true })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ ok: true })
  }

  const eventName = String(body.event_name ?? '')
  const eventId = String(body.event_id ?? '')
  const storeId = String(body.store_id ?? '')

  if (!eventName || !eventId || !storeId || !ALLOWED_EVENTS.has(eventName)) {
    return NextResponse.json({ ok: true })
  }

  // Look up the store's Meta CAPI credentials.
  const admin = createAdminClient()
  const { data: store } = await admin
    .from('stores')
    .select('settings')
    .eq('id', storeId)
    .eq('is_suspended', false)
    .maybeSingle()

  const metaPixelId = store?.settings?.metaPixelId
  const metaCapiToken = store?.settings?.metaCapiToken
  if (!metaPixelId || !metaCapiToken) {
    return NextResponse.json({ ok: true })
  }

  // Extract cookies and request metadata for Advanced Matching.
  const cookieHeader = request.headers.get('cookie') ?? ''
  const readCookie = (name: string) =>
    cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null

  // Fire-and-forget — we don't await this in the response to keep the beacon
  // fast, but since this is a serverless function we DO need to await it so
  // the runtime doesn't kill the process before the fetch completes.
  await sendStorefrontEvent({
    pixelId: metaPixelId,
    accessToken: metaCapiToken,
    eventName,
    eventId,
    storeId,
    phone: body.phone ? String(body.phone) : null,
    customerName: body.customer_name ? String(body.customer_name) : null,
    wilaya: body.wilaya ? String(body.wilaya) : null,
    valueDzd: body.value != null ? Number(body.value) : null,
    productId: body.product_id ? String(body.product_id) : null,
    productName: body.product_name ? String(body.product_name) : null,
    quantity: body.quantity ? Number(body.quantity) : undefined,
    clientIp: ip,
    clientUserAgent: request.headers.get('user-agent'),
    fbp: readCookie('_fbp'),
    fbc: readCookie('_fbc'),
    externalId: readCookie('_krenix_vid'),
    eventSourceUrl: request.headers.get('referer'),
  })

  return NextResponse.json({ ok: true })
}
