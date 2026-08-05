import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedOrders: Record<string, unknown>[] = []
const insertedSignals: Record<string, unknown>[] = []
let storeRow: Record<string, unknown> = {
  id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false,
  plan: 'basic', settings: {},
}
let previousOrders: { created_at: string }[] = []
let fingerprintMatches: { id: string }[] = []

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => true,
  requestIp: () => '1.2.3.4',
}))

vi.mock('@/lib/fraud-shield/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/fraud-shield/ip-intel', () => ({
  lookupIpIntel: vi.fn().mockResolvedValue({ country: 'FR', isProxyOrHosting: true }),
}))

const tiktokEvents: Record<string, unknown>[] = []
vi.mock('@/lib/tiktok-capi', () => ({
  sendTikTokEvent: vi.fn(async (input: Record<string, unknown>) => { tiktokEvents.push(input) }),
  readCookie: () => null,
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'stores') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: storeRow }) }) }) }
      }
      if (table === 'orders') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedOrders.push(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'order-1', order_number: 'K-1', total_price: 1000, wilaya: 'Alger', commune: 'Alger', color: null, quantity: 1, customer_name: 'Amira' },
                  error: null,
                }),
              }),
            }
          },
          select: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: previousOrders }) }),
            }),
          }),
        }
      }
      if (table === 'fraud_order_signals') {
        return {
          insert: (payload: Record<string, unknown>) => { insertedSignals.push(payload); return Promise.resolve({ error: null }) },
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({ limit: async () => ({ data: fingerprintMatches }) }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/orders', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = {
  store_id: 'store-1',
  customer_name: 'Amira Benali',
  customer_phone: '0555123456',
  wilaya: 'Alger',
  commune: 'Alger Centre',
  quantity: 1,
}

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

describe('POST /api/orders — fraud shield gating', () => {
  it('does not score or record signals when fraud_shield_enabled is false', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].fraud_risk_score).toBeUndefined()
    expect(insertedSignals).toHaveLength(0)
  })

  it('scores the order and records signals when fraud_shield_enabled is true', async () => {
    storeRow.fraud_shield_enabled = true
    const res = await POST(makeRequest({ ...VALID_BODY, turnstile_token: 'tok', device_fingerprint: 'fp-1', had_movement: false, form_fill_ms: 400 }))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].fraud_risk_score).toBeGreaterThan(0)
    expect(insertedSignals).toHaveLength(1)
    expect(insertedSignals[0].device_fingerprint).toBe('fp-1')
  })

  it('rejects the order when Turnstile verification fails and fraud_shield_enabled is true', async () => {
    storeRow.fraud_shield_enabled = true
    const { verifyTurnstileToken } = await import('@/lib/fraud-shield/turnstile')
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false)
    const res = await POST(makeRequest({ ...VALID_BODY, turnstile_token: 'bad' }))
    expect(res.status).toBe(400)
    expect(insertedOrders).toHaveLength(0)
  })
})

describe('POST /api/orders — delivery_type normalization', () => {
  it('defaults to home when delivery_type is omitted', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].delivery_type).toBe('home')
  })

  it('stores desk when delivery_type is "desk"', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, delivery_type: 'desk' }))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].delivery_type).toBe('desk')
  })

  it('normalizes garbage delivery_type values to home', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, delivery_type: 'stopdesk' }))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].delivery_type).toBe('home')
  })
})

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
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(tiktokEvents).toHaveLength(2)
    const events = tiktokEvents.map(e => e.event)
    expect(events).toContain('PlaceAnOrder')
    expect(events).toContain('CompletePayment')
    for (const e of tiktokEvents) {
      expect(e.pixelCode).toBe('PIXEL1')
      expect(e.accessToken).toBe('token-1')
      expect(e.phone).toBe('0555123456')
      // The DB-authoritative order.total_price (1000, from the mocked insert
      // response) — NOT VALID_BODY's total_price (which is absent/untrusted).
      expect(e.value).toBe(1000)
    }
    const place = tiktokEvents.find(e => e.event === 'PlaceAnOrder')
    const pay = tiktokEvents.find(e => e.event === 'CompletePayment')
    expect(place?.eventId).toBe('order-1-place')
    expect(pay?.eventId).toBe('order-1-pay')
  })

  it('uses the DB-authoritative order total, ignoring a spoofed client total_price', async () => {
    storeRow.plan = 'growth'
    storeRow.settings = { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' }
    await POST(makeRequest({ ...VALID_BODY, total_price: 999999 }))
    for (const e of tiktokEvents) {
      expect(e.value).toBe(1000)
    }
  })

  it('fires for higher tiers too (business/agency/enterprise/sur_mesure all qualify)', async () => {
    storeRow.plan = 'business'
    storeRow.settings = { tiktokPixelId: 'PIXEL1', tiktokAccessToken: 'token-1' }
    await POST(makeRequest(VALID_BODY))
    expect(tiktokEvents).toHaveLength(2)
  })

  it('does not crash and does not fire when settings is malformed', async () => {
    storeRow.plan = 'growth'
    storeRow.settings = 'not-an-object' as unknown as Record<string, unknown>
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(tiktokEvents).toHaveLength(0)
  })
})
