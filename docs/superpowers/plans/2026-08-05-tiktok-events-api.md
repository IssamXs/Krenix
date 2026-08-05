# TikTok Events API (server-side CAPI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-store, Growth+-gated TikTok Events API (server-side conversions) that dual-fires alongside the existing client-side pixel, fixing the reported gap where TikTok Ads Manager shows 0 attributed orders despite real orders landing in Krenix.

**Architecture:** `PlaceAnOrder`/`CompletePayment` fire inline from `POST /api/orders` right after the order insert (guaranteed — no extra network hop the browser could drop). `ViewContent`/`InitiateCheckout`/`SubmitForm` fire from a new relay endpoint (`/api/storefront/event`, deliberately not named with "pixel"/"track"/"tiktok" to dodge URL-pattern-based ad blockers) called from the client alongside the existing `ttq.track()`. Both mechanisms share `event_id` with their client-side counterpart so TikTok deduplicates.

**Tech Stack:** Next.js App Router API routes, Supabase (admin client, no migration needed — new settings key in existing JSONB column), Vitest, TikTok Events API v1.3.

---

### Task 1: `StoreSettings` type — add `tiktokAccessToken`

**Files:**
- Modify: `src/types/database.ts:130`

- [ ] **Step 1: Add the field**

In `src/types/database.ts`, right after line 130 (`tiktokPixelId?: string`), add:

```ts
  // TikTok Events API (server-side CAPI) access token — Growth+ only. Never
  // pass this to a client component; see the redaction in store/layout.tsx.
  tiktokAccessToken?: string
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(tiktok-capi): add tiktokAccessToken to StoreSettings"
```

---

### Task 2: `lib/tiktok-capi.ts` — the TikTok Events API client

**Files:**
- Create: `src/lib/tiktok-capi.ts`
- Test: `src/lib/tiktok-capi.test.ts`

This follows the exact pattern already established by `src/lib/meta-capi.ts` (fire-and-forget, sha256 hashing, never throws, `vi.stubGlobal('fetch', ...)` test style) — read that file for reference before starting if anything below is unclear.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tiktok-capi.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'crypto'
import { sendTikTokEvent, readCookie } from './tiktok-capi'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('readCookie', () => {
  it('extracts a named cookie value from a cookie header', () => {
    expect(readCookie('a=1; ttclid=abc123; _ttp=xyz', 'ttclid')).toBe('abc123')
    expect(readCookie('a=1; ttclid=abc123; _ttp=xyz', '_ttp')).toBe('xyz')
  })
  it('returns null when the cookie is absent', () => {
    expect(readCookie('a=1; b=2', 'ttclid')).toBeNull()
    expect(readCookie('', 'ttclid')).toBeNull()
  })
  it('URL-decodes the value', () => {
    expect(readCookie('_ttp=a%2Fb', '_ttp')).toBe('a/b')
  })
})

describe('sendTikTokEvent', () => {
  const BASE = {
    pixelCode: 'PIXEL123',
    accessToken: 'token-abc',
    ip: '41.200.1.1',
    userAgent: 'Mozilla/5.0',
  }

  it('posts to the TikTok Events API v1.3 endpoint with the access token header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({
      ...BASE,
      event: 'CompletePayment',
      eventId: 'order-1-pay',
      value: 5000,
      currency: 'DZD',
    })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/event/track/')
    expect(opts.headers['Access-Token']).toBe('token-abc')
    const body = JSON.parse(opts.body)
    expect(body.event_source).toBe('web')
    expect(body.event_source_id).toBe('PIXEL123')
    expect(body.data[0].event).toBe('CompletePayment')
    expect(body.data[0].event_id).toBe('order-1-pay')
    expect(body.data[0].user.ip).toBe('41.200.1.1')
    expect(body.data[0].user.user_agent).toBe('Mozilla/5.0')
    expect(body.data[0].properties.value).toBe(5000)
    expect(body.data[0].properties.currency).toBe('DZD')
  })

  it('hashes a normalized Algerian phone number', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({ ...BASE, event: 'PlaceAnOrder', eventId: 'e1', value: 100, phone: '0549494949' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user.phone_number).toEqual([
      createHash('sha256').update('213549494949').digest('hex'),
    ])
  })

  it('omits phone_number when the phone does not match Algerian format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({ ...BASE, event: 'PlaceAnOrder', eventId: 'e1', value: 100, phone: 'garbage' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user.phone_number).toBeUndefined()
  })

  it('includes ttclid and ttp when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({ ...BASE, event: 'ViewContent', eventId: 'e1', value: 0, ttclid: 'tt-1', ttp: 'tp-1' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user.ttclid).toBe('tt-1')
    expect(body.data[0].user.ttp).toBe('tp-1')
  })

  it('includes contents when contentId is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({
      ...BASE, event: 'InitiateCheckout', eventId: 'e1', value: 2000,
      contentId: 'prod-1', contentName: 'T-Shirt', quantity: 2,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].properties.contents).toEqual([{
      content_id: 'prod-1', content_type: 'product', content_name: 'T-Shirt', quantity: 2, price: 2000,
    }])
  })

  it('never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(sendTikTokEvent({ ...BASE, event: 'ViewContent', eventId: 'e1', value: 0 })).resolves.toBeUndefined()
  })

  it('never throws and logs when TikTok returns a non-ok response', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: 'bad token' }),
    }))
    await expect(sendTikTokEvent({ ...BASE, event: 'ViewContent', eventId: 'e1', value: 0 })).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/tiktok-capi.test.ts`
Expected: FAIL — `Cannot find module './tiktok-capi'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/tiktok-capi.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/tiktok-capi.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tiktok-capi.ts src/lib/tiktok-capi.test.ts
git commit -m "feat(tiktok-capi): add TikTok Events API client with cookie helper"
```

---

### Task 3: Fire `PlaceAnOrder`/`CompletePayment` server-side from order creation

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Test: `src/app/api/orders/route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/app/api/orders/route.test.ts`, add this mock near the top (after the existing `vi.mock('@/lib/fraud-shield/ip-intel', ...)` block, before `vi.mock('@/lib/supabase/admin', ...)`):

```ts
const tiktokEvents: Record<string, unknown>[] = []
vi.mock('@/lib/tiktok-capi', () => ({
  sendTikTokEvent: vi.fn(async (input: Record<string, unknown>) => { tiktokEvents.push(input) }),
  readCookie: () => null,
}))
```

Update the default `storeRow` (both the top-level `let storeRow = {...}` and the `beforeEach` reset) to include `plan` and `settings`:

```ts
let storeRow: Record<string, unknown> = {
  id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false,
  plan: 'basic', settings: {},
}
```

```ts
beforeEach(() => {
  insertedOrders.length = 0
  insertedSignals.length = 0
  tiktokEvents.length = 0
  previousOrders = []
  fingerprintMatches = []
  storeRow = {
    id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false,
    plan: 'basic', settings: {},
  }
})
```

Add a new describe block at the end of the file:

```ts
describe('POST /api/orders — TikTok Events API firing', () => {
  it('does not fire when the store plan is below Growth', async () => {
    storeRow.plan = 'ultimate'
    storeRow.settings = { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' }
    await POST(makeRequest(VALID_BODY))
    expect(tiktokEvents).toHaveLength(0)
  })

  it('does not fire when Growth+ but missing the access token', async () => {
    storeRow.plan = 'growth'
    storeRow.settings = { tiktokPixelId: 'PIXEL1' }
    await POST(makeRequest(VALID_BODY))
    expect(tiktokEvents).toHaveLength(0)
  })

  it('does not fire when Growth+ but missing the pixel id', async () => {
    storeRow.plan = 'growth'
    storeRow.settings = { tiktokAccessToken: 'token-1' }
    await POST(makeRequest(VALID_BODY))
    expect(tiktokEvents).toHaveLength(0)
  })

  it('fires both PlaceAnOrder and CompletePayment when Growth+ with both credentials', async () => {
    storeRow.plan = 'growth'
    storeRow.settings = { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' }
    await POST(makeRequest(VALID_BODY))
    expect(tiktokEvents).toHaveLength(2)
    const events = tiktokEvents.map(e => e.event)
    expect(events).toContain('PlaceAnOrder')
    expect(events).toContain('CompletePayment')
    for (const e of tiktokEvents) {
      expect(e.pixelCode).toBe('PIXEL1')
      expect(e.accessToken).toBe('token-1')
      expect(e.phone).toBe('0555123456')
    }
    const place = tiktokEvents.find(e => e.event === 'PlaceAnOrder')
    const pay = tiktokEvents.find(e => e.event === 'CompletePayment')
    expect(place?.eventId).toBe('order-1-place')
    expect(pay?.eventId).toBe('order-1-pay')
  })

  it('fires for higher tiers too (business/agency/enterprise/sur_mesure all qualify)', async () => {
    storeRow.plan = 'business'
    storeRow.settings = { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' }
    await POST(makeRequest(VALID_BODY))
    expect(tiktokEvents).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: FAIL — the new "TikTok Events API firing" tests fail because nothing calls `sendTikTokEvent` yet (`tiktokEvents` stays empty in the "fires both..." tests).

- [ ] **Step 3: Implement**

In `src/app/api/orders/route.ts`:

Add imports at the top (after the existing imports):

```ts
import { sendTikTokEvent, readCookie } from '@/lib/tiktok-capi'
import { GROWTH_PLANS, type Plan } from '@/types/database'
```

Change the store select (around line 62-66) to also fetch `plan` and `settings`:

```ts
    const { data: store } = await admin
      .from('stores')
      .select('id, is_suspended, subscription_status, fraud_shield_enabled, plan, settings')
      .eq('id', store_id)
      .maybeSingle()
```

Right before `return NextResponse.json({ order })` at the end of the handler (after the `fraud_order_signals` insert block), add:

```ts
    if (order?.id && GROWTH_PLANS.includes(store.plan as Plan)) {
      const settings = (store.settings ?? {}) as { tiktokPixelId?: string; tiktokAccessToken?: string }
      if (settings.tiktokPixelId && settings.tiktokAccessToken) {
        const cookieHeader = request.headers.get('cookie') ?? ''
        const tiktokBase = {
          pixelCode: settings.tiktokPixelId,
          accessToken: settings.tiktokAccessToken,
          ip,
          userAgent: request.headers.get('user-agent') ?? '',
          ttclid: readCookie(cookieHeader, 'ttclid'),
          ttp: readCookie(cookieHeader, '_ttp'),
          phone: String(customer_phone).replace(/\s/g, ''),
          contentId: product_id ?? null,
          value: Number(total_price) || 0,
          quantity: qty,
          currency: 'DZD',
        } as const
        sendTikTokEvent({ ...tiktokBase, event: 'PlaceAnOrder', eventId: `${order.id}-place` })
        sendTikTokEvent({ ...tiktokBase, event: 'CompletePayment', eventId: `${order.id}-pay` })
      }
    }

    return NextResponse.json({ order })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: PASS (all cases, including the pre-existing fraud-shield tests — verify nothing broke).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/orders/route.ts src/app/api/orders/route.test.ts
git commit -m "feat(tiktok-capi): fire PlaceAnOrder/CompletePayment server-side on order creation"
```

---

### Task 4: `/api/storefront/event` relay endpoint

**Files:**
- Create: `src/app/api/storefront/event/route.ts`
- Test: `src/app/api/storefront/event/route.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/api/storefront/event/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

let storeRow: Record<string, unknown> | null = {
  id: 'store-1', is_suspended: false, subscription_status: 'active',
  plan: 'growth', settings: { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' },
}

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => true,
  requestIp: () => '41.200.1.1',
}))

const sentEvents: Record<string, unknown>[] = []
vi.mock('@/lib/tiktok-capi', () => ({
  sendTikTokEvent: vi.fn(async (input: Record<string, unknown>) => { sentEvents.push(input) }),
  readCookie: (header: string, name: string) => (header.includes(`${name}=`) ? 'cookie-value' : null),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: storeRow }) }) }) }),
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>, cookie = '') {
  return new Request('http://test/api/storefront/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify(body),
  })
}

const VALID_BODY = {
  store_id: 'store-1',
  event: 'ViewContent',
  event_id: 'evt-1',
  data: { productId: 'prod-1', productName: 'T-Shirt', price: 2000, quantity: 1, currency: 'DZD' },
}

beforeEach(() => {
  sentEvents.length = 0
  storeRow = {
    id: 'store-1', is_suspended: false, subscription_status: 'active',
    plan: 'growth', settings: { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' },
  }
})

describe('POST /api/storefront/event', () => {
  it('sends the event when the store is Growth+ with both credentials configured', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(sentEvents).toHaveLength(1)
    expect(sentEvents[0].event).toBe('ViewContent')
    expect(sentEvents[0].eventId).toBe('evt-1')
    expect(sentEvents[0].pixelCode).toBe('PIXEL1')
    expect(sentEvents[0].contentId).toBe('prod-1')
  })

  it('no-ops (ok:false) when store_id is missing', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, store_id: undefined }))
    expect((await res.json()).ok).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })

  it('no-ops when the event name is not in the allowed list', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, event: 'Purchase' }))
    expect((await res.json()).ok).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })

  it('no-ops when the store does not exist', async () => {
    storeRow = null
    const res = await POST(makeRequest(VALID_BODY))
    expect((await res.json()).ok).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })

  it('no-ops when the store is suspended', async () => {
    storeRow!.is_suspended = true
    const res = await POST(makeRequest(VALID_BODY))
    expect((await res.json()).ok).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })

  it('no-ops when the store is below Growth', async () => {
    storeRow!.plan = 'ultimate'
    const res = await POST(makeRequest(VALID_BODY))
    expect((await res.json()).ok).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })

  it('no-ops when the access token is missing', async () => {
    storeRow!.settings = { tiktokPixelId: 'PIXEL1' }
    const res = await POST(makeRequest(VALID_BODY))
    expect((await res.json()).ok).toBe(false)
    expect(sentEvents).toHaveLength(0)
  })

  it('reads ttclid/ttp from the cookie header', async () => {
    await POST(makeRequest(VALID_BODY, 'ttclid=abc; _ttp=xyz'))
    expect(sentEvents[0].ttclid).toBe('cookie-value')
    expect(sentEvents[0].ttp).toBe('cookie-value')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/storefront/event/route.test.ts`
Expected: FAIL — `Cannot find module './route'`.

- [ ] **Step 3: Implement**

Create `src/app/api/storefront/event/route.ts`:

```ts
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

  sendTikTokEvent({
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/app/api/storefront/event/route.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/storefront/event/route.ts src/app/api/storefront/event/route.test.ts
git commit -m "feat(tiktok-capi): add /api/storefront/event relay for pre-order pixel events"
```

---

### Task 5: `lib/pixel-events.ts` — dual-fire client events to the relay

**Files:**
- Modify: `src/lib/pixel-events.ts`

No test file — this module is browser-only (reads `window`); its existing test coverage is zero and it stays that way (matches the current file, which also has no `.test.ts`). Verification is manual (Task 8).

- [ ] **Step 1: Add an event-id generator and relay helper**

In `src/lib/pixel-events.ts`, after the `fireTikTok` function (after line 63), add:

```ts
function generateEventId(): string {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

// Best-effort relay to the server-side TikTok Events API (Growth+ stores
// only — the endpoint itself no-ops for everyone else, so it's always safe
// to call). `keepalive: true` lets the request survive page navigation.
// Fire-and-forget: never awaited, never throws into the caller.
function relayToServer(input: {
  storeId: string
  event: string
  eventId: string
  productId?: string | null
  productName?: string | null
  price: number
  quantity?: number
  currency: string
  phone?: string | null
  email?: string | null
}) {
  if (typeof window === 'undefined') return
  try {
    fetch('/api/storefront/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        store_id: input.storeId,
        event: input.event,
        event_id: input.eventId,
        data: {
          productId: input.productId ?? null,
          productName: input.productName ?? null,
          price: input.price,
          quantity: input.quantity ?? 1,
          currency: input.currency,
        },
        phone: input.phone ?? null,
        email: input.email ?? null,
      }),
    }).catch(() => {})
  } catch { /* pixel failures must never break the UI */ }
}
```

- [ ] **Step 2: Update `trackViewContent` to generate + share an event_id**

Replace the existing `trackViewContent` function (lines 154-173) with:

```ts
export function trackViewContent(product: PixelProduct, storeId: string) {
  const currency = product.currency ?? 'DZD'
  const eventId = generateEventId()
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
    eventId,
  )
  relayToServer({
    storeId, event: 'ViewContent', eventId,
    productId: product.id, productName: product.name, price: product.price, currency,
  })
}
```

- [ ] **Step 3: Update `trackInitiateCheckout` the same way**

Replace the existing `trackInitiateCheckout` function (lines 179-200) with:

```ts
export function trackInitiateCheckout(product: PixelProduct, quantity: number, storeId: string) {
  const currency = product.currency ?? 'DZD'
  const value = product.price * quantity
  const eventId = generateEventId()
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
    eventId,
  )
  relayToServer({
    storeId, event: 'InitiateCheckout', eventId,
    productId: product.id, productName: product.name, price: product.price, quantity, currency,
  })
}
```

- [ ] **Step 4: Update `trackLead` the same way**

Replace the existing `trackLead` function (lines 252-266) with:

```ts
export function trackLead(storeId: string, product?: PixelProduct) {
  const currency = product?.currency ?? 'DZD'
  const eventId = generateEventId()
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
  } : undefined, eventId)
  relayToServer({
    storeId, event: 'SubmitForm', eventId,
    productId: product?.id ?? null, productName: product?.name ?? null,
    price: product?.price ?? 0, currency,
  })
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: errors at the 3 call sites (Task 6 fixes them) — confirm the errors are ONLY in `ViewContentTracker.tsx` and `OrderFormFields.tsx` ("expected 2 arguments, got 1" / similar), nothing else.

- [ ] **Step 6: Commit**

```bash
git add src/lib/pixel-events.ts
git commit -m "feat(tiktok-capi): dual-fire ViewContent/InitiateCheckout/Lead to the server relay"
```

---

### Task 6: Thread `storeId` through the 3 call sites

**Files:**
- Modify: `src/components/store/ViewContentTracker.tsx`
- Modify: `src/app/store/p/[slug]/page.tsx:85`
- Modify: `src/components/store/OrderFormFields.tsx:135,167,169`

- [ ] **Step 1: `ViewContentTracker.tsx` — accept and pass through `storeId`**

In `src/components/store/ViewContentTracker.tsx`, change the props and the `trackViewContent` call:

```tsx
export default function ViewContentTracker({
  productId,
  productName,
  price,
  storeId,
}: {
  productId: string
  productName: string
  price: number
  storeId: string
}) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    trackViewContent({ id: productId, name: productName, price }, storeId)
  }, [productId, productName, price, storeId])
  return null
}
```

- [ ] **Step 2: `p/[slug]/page.tsx` — pass `store.id` down**

In `src/app/store/p/[slug]/page.tsx:85`, change:

```tsx
      <ViewContentTracker productId={pixelId} productName={pixelName} price={pixelPrice} />
```

to:

```tsx
      <ViewContentTracker productId={pixelId} productName={pixelName} price={pixelPrice} storeId={store.id} />
```

- [ ] **Step 3: `OrderFormFields.tsx` — thread `store.id` into all 3 calls**

At line 135 (`trackInitiateCheckout` call), change:

```ts
    trackInitiateCheckout(
      { id: product.id, name: product.name, price: unitPrice },
      form.quantity,
    )
```

to:

```ts
    trackInitiateCheckout(
      { id: product.id, name: product.name, price: unitPrice },
      form.quantity,
      store.id,
    )
```

At lines 167/169 (`trackLead` calls), change:

```ts
      if (product) {
        trackLead({ id: product.id, name: product.name, price: unitPrice })
      } else {
        trackLead()
```

to:

```ts
      if (product) {
        trackLead(store.id, { id: product.id, name: product.name, price: unitPrice })
      } else {
        trackLead(store.id)
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors anywhere.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS (no regressions).

- [ ] **Step 6: Commit**

```bash
git add src/components/store/ViewContentTracker.tsx src/app/store/p/[slug]/page.tsx src/components/store/OrderFormFields.tsx
git commit -m "feat(tiktok-capi): thread storeId through pixel event call sites"
```

---

### Task 7: Security — redact `tiktokAccessToken` before it reaches a client component

**Files:**
- Modify: `src/app/store/layout.tsx`

**Why this matters:** `src/app/store/layout.tsx` is a Server Component that fetches the full `store` row (`select('*, theme:themes(*)')`) and passes it whole into `<ChatbotWidget store={store as Store} />`, which is a Client Component (`LazyChatbotWidget.tsx` is `'use client'`). Every prop passed from a Server Component to a Client Component gets serialized into the page's RSC payload and shipped to the browser. Before this feature, `store.settings` only held public values (pixel IDs, GTM container id — all meant to be client-visible already). Task 1 adds `tiktokAccessToken`, a genuine secret, to that same `settings` object — without this redaction, any storefront visitor could read the merchant's TikTok API token straight out of the page source.

- [ ] **Step 1: Redact the secret before the `ChatbotWidget` render**

In `src/app/store/layout.tsx`, replace:

```tsx
        {isChatbotEnabled && store && (
          <ChatbotWidget store={store as Store} />
        )}
```

with:

```tsx
        {isChatbotEnabled && store && (
          <ChatbotWidget store={{ ...store, settings: { ...store.settings, tiktokAccessToken: undefined } } as Store} />
        )}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/store/layout.tsx
git commit -m "fix(security): redact tiktokAccessToken before passing store to ChatbotWidget client component"
```

---

### Task 8: Settings UI — Access Token field on the GTM/pixels page

**Files:**
- Modify: `src/app/(platform)/dashboard/integrations/gtm/page.tsx`
- Modify: `src/lib/i18n/dictionaries/types.ts`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`

- [ ] **Step 1: Add the new i18n keys to the type definition**

In `src/lib/i18n/dictionaries/types.ts`, inside the `gtm: { ... }` block, right after `tiktokHint: string` (line 780), add:

```ts
    tiktokCapiTitle: string
    tiktokCapiHint: string
```

- [ ] **Step 2: Add French translations**

In `src/lib/i18n/dictionaries/fr.ts`, inside the `gtm: { ... }` block, right after `tiktokHint: "Trouvez votre ID dans TikTok Ads Manager → Bibliothèque d'événements → votre pixel."` (line 779), add:

```ts
    tiktokCapiTitle: 'Suivi serveur TikTok (Events API)',
    tiktokCapiHint: "Complète le pixel avec un envoi direct depuis nos serveurs — récupère les commandes que les bloqueurs de pub empêchent le pixel de voir. Générez le jeton dans TikTok Ads Manager → Ressources → Événements → Site web → votre pixel → Générer un jeton d'accès.",
```

- [ ] **Step 3: Add Arabic translations**

In `src/lib/i18n/dictionaries/ar.ts`, inside the `gtm: { ... }` block, right after `tiktokHint: 'ستجد معرّفك في TikTok Ads Manager ← مكتبة الأحداث ← بيكسلك.'` (line 779), add:

```ts
    tiktokCapiTitle: 'التتبع من الخادم لـ TikTok (Events API)',
    tiktokCapiHint: 'يكمّل البيكسل بإرسال مباشر من خوادمنا — يسترجع الطلبات التي تمنع أدوات حظر الإعلانات البيكسل من رؤيتها. أنشئ الرمز من TikTok Ads Manager ← الموارد ← الأحداث ← الموقع ← بيكسلك ← إنشاء رمز وصول.',
```

- [ ] **Step 4: Extend the settings page component**

In `src/app/(platform)/dashboard/integrations/gtm/page.tsx`:

Add imports (after the existing `Card` import):

```ts
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
import { GROWTH_PLANS, type Plan } from '@/types/database'
```

Change the field union type in 3 places — the `saving`/`saved` state types and the `error` state type, and the `save`/`renderCard` function signatures — from `'gtm' | 'meta' | 'tiktok'` to `'gtm' | 'meta' | 'tiktok' | 'tiktokToken'`:

```ts
  const [saving, setSaving] = useState<'gtm' | 'meta' | 'tiktok' | 'tiktokToken' | null>(null)
  const [saved, setSaved] = useState<'gtm' | 'meta' | 'tiktok' | 'tiktokToken' | null>(null)
  const [error, setError] = useState<{ field: 'gtm' | 'meta' | 'tiktok' | 'tiktokToken'; message: string } | null>(null)
```

Add a new state variable near `tiktokPixelId`:

```ts
  const [tiktokAccessToken, setTiktokAccessToken] = useState('')
```

In the `useEffect` that loads initial values, add a line next to `setTiktokPixelId(...)`:

```ts
        setTiktokAccessToken((data as Store).settings?.tiktokAccessToken ?? '')
```

In `save()`, change the `field` parameter type and add the new entry to the `config` map:

```ts
  const save = async (field: 'gtm' | 'meta' | 'tiktok' | 'tiktokToken', value: string) => {
    if (!store) return
    const trimmed = value.trim()
    const config = {
      gtm: { key: 'gtmId' as const, format: GTM_FORMAT, normalize: (v: string) => v.toUpperCase(), example: 'GTM-A1B2C3D' },
      meta: { key: 'metaPixelId' as const, format: META_PIXEL_FORMAT, normalize: (v: string) => v, example: '1234567890123456' },
      tiktok: { key: 'tiktokPixelId' as const, format: TIKTOK_PIXEL_FORMAT, normalize: (v: string) => v.toUpperCase(), example: 'C4A1B2C3D4E5F6G7' },
      tiktokToken: { key: 'tiktokAccessToken' as const, format: /^.{10,200}$/, normalize: (v: string) => v, example: 'un jeton de 10 caractères ou plus' },
    }[field]
```

And in the same function's success branch, add the new case next to the existing `if (field === 'tiktok') ...`:

```ts
      if (field === 'tiktokToken') setTiktokAccessToken(normalized)
```

Update `renderCard`'s `opts.field` type to match:

```ts
  const renderCard = (opts: {
    field: 'gtm' | 'meta' | 'tiktok' | 'tiktokToken'
```

Finally, right after the existing TikTok pixel `renderCard({...})` call (the block ending at `active: !!store?.settings?.tiktokPixelId,\n          })}` around line 169), add the Growth+-gated Access Token card:

```tsx
          {GROWTH_PLANS.includes((store?.plan ?? 'basic') as Plan) ? (
            renderCard({
              field: 'tiktokToken',
              title: t('gtm.tiktokCapiTitle'),
              hint: t('gtm.tiktokCapiHint'),
              placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
              value: tiktokAccessToken,
              setValue: setTiktokAccessToken,
              active: !!store?.settings?.tiktokAccessToken,
            })
          ) : (
            <LockedFeatureCard title={t('gtm.tiktokCapiTitle')} requiredPlan="Growth" />
          )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 6: Manual verification in the browser**

Start the dev server (`preview_start` with the `krenix` launch config) and navigate to `/dashboard/integrations/gtm` while logged in as a test account:
- On a below-Growth store: confirm the new card renders as a `LockedFeatureCard` (lock icon, "Disponible à partir du plan Growth", no input field).
- If a Growth+ test account is available: confirm the Access Token field renders, accepts input, saves, and reloads with the saved value pre-filled (mirroring the existing Pixel ID field's behavior).

- [ ] **Step 7: Commit**

```bash
git add "src/app/(platform)/dashboard/integrations/gtm/page.tsx" src/lib/i18n/dictionaries/types.ts src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts
git commit -m "feat(tiktok-capi): add Growth+-gated Access Token field to the pixels settings page"
```

---

### Task 9: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, zero failures.

- [ ] **Step 2: Full type-check**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors.

- [ ] **Step 3: Manual browser smoke test of the storefront**

Start the dev server and open a demo store landing page (`/store/p/<slug>?store=<demo-slug>` in local dev, per CLAUDE.md's subdomain simulation). Confirm via `read_console_messages`/`read_network_requests`:
- The page loads with no console errors.
- A request to `/api/storefront/event` fires on page load (ViewContent) — for a non-Growth demo store this should return `{ ok: false }` (expected no-op), confirming the relay doesn't break anything even when TikTok CAPI isn't configured.
- Submitting the order form still successfully creates an order (existing flow unaffected).

- [ ] **Step 4: No commit needed** — this task is verification-only.
