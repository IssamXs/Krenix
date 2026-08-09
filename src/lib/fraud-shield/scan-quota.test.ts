import { describe, it, expect, vi } from 'vitest'
import { quotaForAmountDzd, getScanQuotaStatus, logScanUsage } from './scan-quota'

describe('quotaForAmountDzd', () => {
  it('returns the known tier quotas', () => {
    expect(quotaForAmountDzd(2500)).toBe(300)
    expect(quotaForAmountDzd(5000)).toBe(700)
  })

  it('falls back to a proportional estimate for an unknown amount', () => {
    // 10000 DZD at the 700/5000 rate -> 1400
    expect(quotaForAmountDzd(10000)).toBe(1400)
  })

  it('never returns a negative quota', () => {
    expect(quotaForAmountDzd(0)).toBe(0)
  })
})

function fakeSupabase(purchases: unknown[], usageCount: number) {
  return {
    from(table: string) {
      if (table === 'fraud_shield_purchases') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: async () => ({ data: purchases }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'fraud_scan_usage') {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({ count: usageCount }),
            }),
          }),
          insert: vi.fn(async () => ({ error: null })),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }
}

describe('getScanQuotaStatus', () => {
  it('returns null when there is no active purchase', async () => {
    const supabase = fakeSupabase([], 0)
    const result = await getScanQuotaStatus(supabase as never, 'store-1')
    expect(result).toBeNull()
  })

  it('ignores an expired purchase row', async () => {
    const supabase = fakeSupabase(
      [{ amount_dzd: 2500, started_at: '2025-01-01T00:00:00Z', expires_at: '2025-01-31T00:00:00Z', created_at: '2025-01-01T00:00:00Z' }],
      0,
    )
    const result = await getScanQuotaStatus(supabase as never, 'store-1')
    expect(result).toBeNull()
  })

  it('computes remaining quota from the active purchase and usage count', async () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
    const supabase = fakeSupabase(
      [{ amount_dzd: 2500, started_at: '2026-01-01T00:00:00Z', expires_at: future, created_at: '2026-01-01T00:00:00Z' }],
      120,
    )
    const result = await getScanQuotaStatus(supabase as never, 'store-1')
    expect(result).toEqual({ limit: 300, used: 120, remaining: 180, periodStart: '2026-01-01T00:00:00Z' })
  })

  it('never returns a negative remaining count when usage exceeds the limit', async () => {
    const future = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString()
    const supabase = fakeSupabase(
      [{ amount_dzd: 2500, started_at: '2026-01-01T00:00:00Z', expires_at: future, created_at: '2026-01-01T00:00:00Z' }],
      500,
    )
    const result = await getScanQuotaStatus(supabase as never, 'store-1')
    expect(result?.remaining).toBe(0)
  })
})

describe('logScanUsage', () => {
  it('inserts one row per order id', async () => {
    const insert = vi.fn(async () => ({ error: null }))
    const supabase = { from: () => ({ insert }) }
    await logScanUsage(supabase as never, 'store-1', ['o1', 'o2'])
    expect(insert).toHaveBeenCalledWith([
      { store_id: 'store-1', order_id: 'o1' },
      { store_id: 'store-1', order_id: 'o2' },
    ])
  })

  it('does nothing for an empty order list', async () => {
    const insert = vi.fn()
    const supabase = { from: () => ({ insert }) }
    await logScanUsage(supabase as never, 'store-1', [])
    expect(insert).not.toHaveBeenCalled()
  })
})
