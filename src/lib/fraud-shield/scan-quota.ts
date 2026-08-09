// ============================================================
// KRENIX — Fraud Shield paid-tier AI-scan quota
// Every fresh Claude scan (a cache miss in /api/orders/ai-scan) costs real
// money. The paid tiers include a monthly quota derived from the purchase
// amount: 2500 DZD -> 300 scans, 5000 DZD -> 700 scans. Re-served cached
// verdicts are free and must never be logged here.
//
// The quota period is NOT calendar-month — it follows the active purchase's
// own 30-day window (started_at), matching how fraud_shield_purchases itself
// already grants "30 days per confirmed purchase" (see migration 049).
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

// Known tiers first; anything else falls back to a proportional estimate
// using the more generous (higher) tier's per-DZD rate, so a future custom
// price still gets a sensible quota instead of 0.
const SCAN_QUOTA_BY_AMOUNT_DZD: Record<number, number> = {
  2500: 300,
  5000: 700,
}
const FALLBACK_SCANS_PER_DZD = 700 / 5000

export function quotaForAmountDzd(amountDzd: number): number {
  const known = SCAN_QUOTA_BY_AMOUNT_DZD[amountDzd]
  if (known !== undefined) return known
  return Math.max(0, Math.round(amountDzd * FALLBACK_SCANS_PER_DZD))
}

export interface ScanQuotaStatus {
  limit: number
  used: number
  remaining: number
  periodStart: string
}

/**
 * Reads the store's current active fraud_shield_purchases row and counts
 * fraud_scan_usage rows logged since it started. Returns null when there is
 * no active purchase (the caller should already have gated on canScan).
 */
export async function getScanQuotaStatus(
  supabase: SupabaseClient,
  storeId: string,
): Promise<ScanQuotaStatus | null> {
  const now = new Date().toISOString()
  const { data: purchases } = await supabase
    .from('fraud_shield_purchases')
    .select('amount_dzd, started_at, expires_at, created_at')
    .eq('store_id', storeId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(50)

  const active = (purchases ?? []).find(
    (p: { expires_at: string | null }) => p.expires_at && p.expires_at > now,
  ) as { amount_dzd: number; started_at: string | null; created_at: string } | undefined
  if (!active) return null

  const periodStart = active.started_at ?? active.created_at
  const limit = quotaForAmountDzd(active.amount_dzd)

  const { count } = await supabase
    .from('fraud_scan_usage')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
    .gte('created_at', periodStart)

  const used = count ?? 0
  return { limit, used, remaining: Math.max(0, limit - used), periodStart }
}

/** Logs one fresh-scan usage row per order actually sent to Claude. */
export async function logScanUsage(
  supabase: SupabaseClient,
  storeId: string,
  orderIds: string[],
): Promise<void> {
  if (orderIds.length === 0) return
  const { error } = await supabase
    .from('fraud_scan_usage')
    .insert(orderIds.map(orderId => ({ store_id: storeId, order_id: orderId })))
  if (error) console.error('[fraud-shield/scan-quota] usage log insert failed:', error)
}
