import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { sendTikTokEvent, readCookie, type TikTokCapiEvent } from '@/lib/tiktok-capi'
import { GROWTH_PLANS, type Plan } from '@/types/database'

// Public relay for pre-order pixel events (ViewContent / InitiateCheckout /
// SubmitForm) that have no other server touchpoint. Deliberately NOT named
// with "pixel"/"track"/"tiktok" in the path — URL-pattern ad-blocker lists
// (EasyPrivacy etc.) block by path substring regardless of domain, which
// would silently defeat a same-origin relay named carelessly. Best-effort:
// every failure path returns `{ ok: false }` with a 200, never an error the
// client needs to branch on.
const ALLOWED_EVENTS = ['ViewContent', 'InitiateCheckout', 'SubmitForm'] as const

function isAllowedEvent(value: unknown): value is TikTokCapiEvent {
  return typeof value === 'string' && (ALLOWED_EVENTS as readonly string[]).includes(value)
}

export async function POST(request: Request) {
  const ip = requestIp(request)
  if (!(await checkRateLimit(`storefront-event:${ip}`, 60, 600))) {
    return NextResponse.json({ ok: false })
  }

  const body = (await request.json().catch(() => ({}))) as {
    store_id?: string
    event?: string
    event_id?: string
    data?: { productId?: string | null; productName?: string | null; price?: number; quantity?: number; currency?: string }
    phone?: string | null
    email?: string | null
  }

  if (!body.store_id || !body.event_id || !isAllowedEvent(body.event)) {
    return NextResponse.json({ ok: false })
  }

  const admin = createAdminClient()
  const { data: store } = await admin
    .from('stores')
    .select('plan, subscription_status, is_suspended, settings')
    .eq('id', body.store_id)
    .maybeSingle()

  if (!store || store.is_suspended || store.subscription_status !== 'active') {
    return NextResponse.json({ ok: false })
  }
  if (!GROWTH_PLANS.includes(store.plan as Plan)) {
    return NextResponse.json({ ok: false })
  }

  const settings = (store.settings ?? {}) as { tiktokPixelId?: string; tiktokAccessToken?: string }
  if (!settings.tiktokPixelId || !settings.tiktokAccessToken) {
    return NextResponse.json({ ok: false })
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  const price = Number(body.data?.price ?? 0)
  const quantity = Number(body.data?.quantity ?? 1)

  // Awaited (deviation from earlier plan drafts that showed a bare call) —
  // matches the convention established in src/app/api/orders/route.ts: an
  // unawaited promise risks the serverless function freezing before the
  // outbound fetch to TikTok completes, silently losing the event.
  // sendTikTokEvent never throws and has an internal 3s timeout, so this is
  // safe and bounded.
  await sendTikTokEvent({
    pixelCode: settings.tiktokPixelId,
    accessToken: settings.tiktokAccessToken,
    event: body.event,
    eventId: body.event_id,
    ip,
    userAgent: request.headers.get('user-agent') ?? '',
    ttclid: readCookie(cookieHeader, 'ttclid'),
    ttp: readCookie(cookieHeader, '_ttp'),
    phone: body.phone ?? null,
    email: body.email ?? null,
    contentId: body.data?.productId ?? null,
    contentName: body.data?.productName ?? null,
    value: price * quantity,
    quantity,
    currency: body.data?.currency ?? 'DZD',
  })

  return NextResponse.json({ ok: true })
}
