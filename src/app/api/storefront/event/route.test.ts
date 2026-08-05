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
