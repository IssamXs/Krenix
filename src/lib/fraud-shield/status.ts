// ============================================================
// KRENIX — Fraud Shield paid status resolver
// Shared by the orders page (gates the AI fake-orders detector button) and
// the /dashboard/fraud-shield management hub. Works with any supabase client
// (browser or server) since it only reads publicly-policy'd rows.
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'
import { getScanQuotaStatus } from './scan-quota'

// Monthly price of the paid Fraud Shield add-on.
export const FRAUD_SHIELD_PRICE_DZD = 2500

export interface FraudShieldStatus {
  // The merchant's activation toggle (stores.fraud_shield_enabled).
  enabled: boolean
  // A valid, non-expired paid subscription exists right now.
  active: boolean
  // Expiry of the current paid subscription (null when none/expired).
  paidUntil: string | null
  // A payment request is awaiting super-admin confirmation.
  pendingRequest: boolean
  // True when the AI scan button may be used: paid AND activated.
  canScan: boolean
  // Monthly AI-scan quota for the current active purchase (null when none).
  scansLimit: number | null
  scansUsed: number
  scansRemaining: number | null
}

export async function getFraudShieldStatus(
  supabase: SupabaseClient,
  storeId: string,
): Promise<FraudShieldStatus> {
  const [{ data: store }, { data: purchases }] = await Promise.all([
    supabase.from('stores').select('fraud_shield_enabled').eq('id', storeId).maybeSingle(),
    supabase
      .from('fraud_shield_purchases')
      .select('status, expires_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const now = new Date().toISOString()
  const list = (purchases ?? []) as Array<{ status: string; expires_at: string | null }>
  const activeRow = list.find(p => p.status === 'active' && p.expires_at && p.expires_at > now)

  const quota = activeRow ? await getScanQuotaStatus(supabase, storeId) : null

  return {
    enabled: !!store?.fraud_shield_enabled,
    active: !!activeRow,
    paidUntil: activeRow?.expires_at ?? null,
    pendingRequest: list.some(p => p.status === 'pending'),
    canScan: !!store?.fraud_shield_enabled && !!activeRow,
    scansLimit: quota?.limit ?? null,
    scansUsed: quota?.used ?? 0,
    scansRemaining: quota?.remaining ?? null,
  }
}
