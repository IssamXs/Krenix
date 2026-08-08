import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedOrders: Record<string, unknown>[] = []
const insertedSignals: Record<string, unknown>[] = []
let storeRow: Record<string, unknown> = {
  id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false,
}
let previousOrders: Record<string, unknown>[] = []
let signalHistory: Record<string, unknown>[] = []
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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const builder = (resolveLimit: () => unknown) => {
        const b: Record<string, unknown> = {
          select: () => b,
          eq: () => b,
          order: () => b,
          gte: () => b,
          limit: async () => resolveLimit(),
          maybeSingle: async () => ({ data: storeRow }),
        }
        return b
      }
      if (table === 'stores') {
        return builder(() => ({ data: [] }))
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
          select: () => builder(() => ({ data: previousOrders })),
        }
      }
      if (table === 'fraud_order_signals') {
        return {
          insert: (payload: Record<string, unknown>) => { insertedSignals.push(payload); return Promise.resolve({ error: null }) },
          select: (cols: string) =>
            cols === 'id'
              ? builder(() => ({ data: fingerprintMatches }))
              : builder(() => ({ data: signalHistory })),
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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString()

beforeEach(() => {
  insertedOrders.length = 0
  insertedSignals.length = 0
  previousOrders = []
  signalHistory = []
  fingerprintMatches = []
  storeRow = { id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false }
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

  it('hard-flags a device fingerprint from the store’s confirmed-fake history (counter-attack)', async () => {
    storeRow.fraud_shield_enabled = true
    previousOrders = [
      { id: 'old-1', created_at: minutesAgo(60), customer_phone: '0555123456', customer_name: 'Bot X', fraud_label: 'confirmed_fake', fraud_risk_score: 90 },
    ]
    signalHistory = [
      { order_id: 'old-1', device_fingerprint: 'fp-bot', ip: '1.1.1.1', ip_country: null, created_at: minutesAgo(60) },
    ]
    const res = await POST(makeRequest({ ...VALID_BODY, turnstile_token: 'tok', device_fingerprint: 'fp-bot' }))
    expect(res.status).toBe(200)
    const signals = insertedOrders[0].fraud_signals as Record<string, { points: number }>
    expect(signals.bot_cluster.points).toBe(30)
    expect(Number(insertedOrders[0].fraud_risk_score)).toBeGreaterThanOrEqual(60)
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
