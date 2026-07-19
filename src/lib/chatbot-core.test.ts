import { describe, it, expect } from 'vitest'
import { hasChatbotAccess } from '@/lib/chatbot-core'

describe('hasChatbotAccess', () => {
  it('blocks an Ultimate+ plan whose subscription is no longer active', () => {
    // This is the exact regression: stores.plan stays 'ultimate' after a
    // cancellation or cron expiry (the /activate page relies on that to offer
    // "renew your previous plan"), so checking plan membership alone would
    // leave the chatbot live forever once the subscription lapses.
    expect(hasChatbotAccess({ subscriptionActive: false, plan: 'ultimate', dailyLimit: 150 })).toBe(false)
  })

  it('allows an Ultimate+ plan with an active subscription', () => {
    expect(hasChatbotAccess({ subscriptionActive: true, plan: 'ultimate', dailyLimit: 150 })).toBe(true)
  })

  it('blocks Pro (no chatbot allowance) even when active', () => {
    expect(hasChatbotAccess({ subscriptionActive: true, plan: 'pro', dailyLimit: 0 })).toBe(false)
  })

  it('allows a sub-Ultimate plan when a purchased message top-up is active', () => {
    expect(hasChatbotAccess({ subscriptionActive: true, plan: 'pro', dailyLimit: 50 })).toBe(true)
  })

  it('freezes a purchased top-up while the subscription is inactive', () => {
    expect(hasChatbotAccess({ subscriptionActive: false, plan: 'pro', dailyLimit: 50 })).toBe(false)
  })
})
