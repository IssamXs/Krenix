import { describe, it, expect } from 'vitest'
import { computePlanExpiry, isExpired, isStoreAccessExpired, bestPlan, PLAN_PERIOD_DAYS } from './plan-expiry'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-07-16T12:00:00.000Z')

describe('computePlanExpiry', () => {
  it('gives basic no expiry — it is a one-time purchase', () => {
    expect(computePlanExpiry('basic', NOW)).toBeNull()
  })

  it('puts every recurring plan 30 days out', () => {
    for (const plan of ['pro', 'ultimate', 'growth', 'business', 'agency', 'enterprise'] as const) {
      const iso = computePlanExpiry(plan, NOW)
      expect(iso).not.toBeNull()
      expect(new Date(iso!).getTime()).toBe(NOW.getTime() + PLAN_PERIOD_DAYS * DAY)
    }
  })
})

describe('isExpired', () => {
  it('treats a null expiry as never-expires, not as expired', () => {
    expect(isExpired(null)).toBe(false)
    expect(isExpired(undefined)).toBe(false)
  })

  it('is true once the date has passed', () => {
    expect(isExpired(new Date(NOW.getTime() - 1).toISOString(), NOW.getTime())).toBe(true)
  })

  it('is true exactly at the boundary', () => {
    expect(isExpired(NOW.toISOString(), NOW.getTime())).toBe(true)
  })

  it('is false while still inside the period', () => {
    expect(isExpired(new Date(NOW.getTime() + DAY).toISOString(), NOW.getTime())).toBe(false)
  })

  it('does not treat an unparseable date as expired', () => {
    expect(isExpired('not-a-date', NOW.getTime())).toBe(false)
  })
})

describe('bestPlan', () => {
  it('returns null when nothing covers the store', () => {
    expect(bestPlan([])).toBeNull()
  })

  it('picks the strongest plan regardless of order', () => {
    expect(bestPlan(['basic', 'ultimate'])).toBe('ultimate')
    expect(bestPlan(['ultimate', 'basic'])).toBe('ultimate')
    expect(bestPlan(['pro', 'enterprise', 'basic'])).toBe('enterprise')
  })

  // The modalist case: a permanent one-time Basic sitting under a monthly
  // Ultimate. When the Ultimate lapses the store must fall to Basic — leaving it
  // on Ultimate would hand out paid features forever off a one-time purchase.
  it('falls back to basic when only the one-time basic survives', () => {
    expect(bestPlan(['basic'])).toBe('basic')
  })
})

describe('isStoreAccessExpired', () => {
  const active = { subscription_status: 'active' }
  const past = new Date(NOW.getTime() - DAY).toISOString()
  const future = new Date(NOW.getTime() + DAY).toISOString()

  it('expires a store whose only active subscription has lapsed', () => {
    expect(isStoreAccessExpired(active, [{ status: 'active', expires_at: past }], NOW.getTime())).toBe(true)
  })

  it('keeps a store alive while its subscription is in period', () => {
    expect(isStoreAccessExpired(active, [{ status: 'active', expires_at: future }], NOW.getTime())).toBe(false)
  })

  // The real-world case that makes this non-trivial: stores legitimately hold
  // several active subs at once (one-time Basic + monthly Ultimate).
  it('keeps a store alive if ANY active subscription still covers it', () => {
    const subs = [
      { status: 'active', expires_at: past },
      { status: 'active', expires_at: future },
    ]
    expect(isStoreAccessExpired(active, subs, NOW.getTime())).toBe(false)
  })

  it('keeps a store alive on a permanent (null-expiry) subscription', () => {
    expect(isStoreAccessExpired(active, [{ status: 'active', expires_at: null }], NOW.getTime())).toBe(false)
  })

  it('ignores non-active subscriptions when judging cover', () => {
    const subs = [
      { status: 'active', expires_at: past },
      { status: 'pending', expires_at: future },  // not paid — must not grant cover
    ]
    expect(isStoreAccessExpired(active, subs, NOW.getTime())).toBe(true)
  })

  it('leaves a store with no subscription rows alone rather than guessing', () => {
    expect(isStoreAccessExpired(active, [], NOW.getTime())).toBe(false)
    expect(isStoreAccessExpired(active, null, NOW.getTime())).toBe(false)
  })

  it('does not re-judge a store that is already not active', () => {
    const inactive = { subscription_status: 'expired' }
    expect(isStoreAccessExpired(inactive, [{ status: 'active', expires_at: past }], NOW.getTime())).toBe(false)
  })
})
