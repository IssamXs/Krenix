import { describe, it, expect } from 'vitest'
import {
  buildAdaptiveContext,
  EMPTY_ADAPTIVE_CONTEXT,
  reputationFor,
  normalizePhone,
  type OrderHistoryRow,
  type SignalHistoryRow,
} from './adaptive'

const T0 = '2026-08-05T12:00:00.000Z'
const minutesAgo = (m: number) => new Date(Date.parse(T0) - m * 60_000).toISOString()

function order(overrides: Partial<OrderHistoryRow>): OrderHistoryRow {
  return {
    id: 'o-' + Math.random().toString(36).slice(2),
    created_at: minutesAgo(60),
    customer_phone: null,
    customer_name: null,
    fraud_label: null,
    fraud_risk_score: null,
    ...overrides,
  }
}

function signal(overrides: Partial<SignalHistoryRow>): SignalHistoryRow {
  return {
    order_id: '',
    device_fingerprint: null,
    ip: null,
    ip_country: null,
    created_at: minutesAgo(60),
    ...overrides,
  }
}

describe('buildAdaptiveContext', () => {
  it('returns an empty context for no history', () => {
    const ctx = buildAdaptiveContext([], [])
    expect(ctx).toEqual(EMPTY_ADAPTIVE_CONTEXT)
    expect(ctx.botPressure).toBe(0)
  })

  it('learns confirmed-fake devices/phones/IPs into the bot cluster', () => {
    const orders: OrderHistoryRow[] = [
      order({ id: 'a', customer_phone: '0555123456', fraud_label: 'confirmed_fake' }),
      order({ id: 'b', customer_phone: '0666123456', fraud_label: 'confirmed_real' }),
      order({ id: 'c', customer_phone: '0770123456', fraud_label: 'confirmed_fake' }),
    ]
    const signals: SignalHistoryRow[] = [
      signal({ order_id: 'a', device_fingerprint: 'fp-bot-1', ip: '1.1.1.1' }),
      signal({ order_id: 'b', device_fingerprint: 'fp-real-1', ip: '1.1.1.1' }),
      signal({ order_id: 'c', device_fingerprint: 'fp-bot-2', ip: '2.2.2.2' }),
    ]
    const ctx = buildAdaptiveContext(orders, signals)
    expect(ctx.confirmedFake).toBe(2)
    expect(ctx.confirmedReal).toBe(1)
    expect(ctx.botFingerprints.has('fp-bot-1')).toBe(true)
    expect(ctx.botFingerprints.has('fp-real-1')).toBe(false)
    expect(ctx.botPhones.has('0555123456')).toBe(true)
    expect(ctx.botIps.has('1.1.1.1')).toBe(true)
    expect(ctx.botPressure).toBeCloseTo(2 / 3)
    // The shared IP on one real order does not taint it.
    expect(ctx.fingerprintReputation['fp-real-1'].real).toBe(1)
    expect(ctx.fingerprintReputation['fp-real-1'].fake).toBe(0)
  })

  it('never learns from unconfirmed high-risk orders (no self-reinforcement)', () => {
    const orders: OrderHistoryRow[] = [
      order({ id: 'a', customer_phone: '0555123456', fraud_label: 'pending', fraud_risk_score: 90 }),
      order({ id: 'b', customer_phone: '0666123456', fraud_label: 'pending', fraud_risk_score: 85 }),
      order({ id: 'c', customer_phone: '0770123456', fraud_label: 'pending', fraud_risk_score: 80 }),
    ]
    const signals: SignalHistoryRow[] = [
      signal({ order_id: 'a', device_fingerprint: 'fp-x', ip: '1.1.1.1' }),
      signal({ order_id: 'b', device_fingerprint: 'fp-x', ip: '1.1.1.1' }),
      signal({ order_id: 'c', device_fingerprint: 'fp-x', ip: '1.1.1.1' }),
    ]
    const ctx = buildAdaptiveContext(orders, signals)
    expect(ctx.botPressure).toBe(0)
    expect(ctx.botFingerprints.size).toBe(0)
    expect(ctx.highRiskRecent).toBe(3)
  })

  it('computes botPressure only once enough orders exist', () => {
    const single = buildAdaptiveContext(
      [order({ fraud_label: 'confirmed_fake' }), order({ fraud_label: 'confirmed_real' })],
      [],
    )
    expect(single.botPressure).toBe(0)
  })
})

describe('reputationFor', () => {
  const orders: OrderHistoryRow[] = [
    order({ id: 'a', customer_phone: '0555123456', fraud_label: 'confirmed_fake' }),
    order({ id: 'b', customer_phone: '0666123456', fraud_label: 'confirmed_real' }),
  ]
  const signals: SignalHistoryRow[] = [
    signal({ order_id: 'a', device_fingerprint: 'fp-bot' }),
    signal({ order_id: 'b', device_fingerprint: 'fp-real' }),
  ]
  const ctx = buildAdaptiveContext(orders, signals)

  it('recognizes a known bot phone across +213 formatting', () => {
    const rep = reputationFor(ctx, 'fp-new', '+213 555 12 34 56')
    expect(rep.isKnownBotDevice).toBe(true)
    expect(rep.phone?.fake).toBe(1)
  })

  it('recognizes a known bot fingerprint', () => {
    const rep = reputationFor(ctx, 'fp-bot', null)
    expect(rep.isKnownBotDevice).toBe(true)
  })

  it('does not flag a clean device/phone', () => {
    const rep = reputationFor(ctx, 'fp-new', '0770123456')
    expect(rep.isKnownBotDevice).toBe(false)
    expect(rep.fingerprint).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('normalizes +213, spaced, and 9-digit Algerian formats', () => {
    expect(normalizePhone('+213 770 12 34 56')).toBe('0770123456')
    expect(normalizePhone('0555123456')).toBe('0555123456')
    expect(normalizePhone('77123456')).toBe(null) // missing leading 0 is invalid here
    expect(normalizePhone('')).toBe(null)
    expect(normalizePhone(null)).toBe(null)
  })
})
