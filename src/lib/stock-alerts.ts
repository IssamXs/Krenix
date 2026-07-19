import type { SupabaseClient } from '@supabase/supabase-js'

// Matches the "Stock limité" / "Épuisé" threshold already used across the app
// (dashboard/products list badges, all 5 storefront theme renderers).
const LOW_STOCK_THRESHOLD = 5

/**
 * Upserts one notification per low-stock/out-of-stock active product, and
 * resolves (deletes) stock-alert notifications for products that recovered,
 * went inactive, or were deleted. Idempotent — safe to call on every GET
 * /api/notifications request. Uses dedupe_key so an already-seen alert never
 * resets is_read or its created_at on repeat calls.
 */
export async function syncStockAlerts(supabase: SupabaseClient, storeId: string): Promise<void> {
  const { data: products } = await supabase
    .from('products')
    .select('id, name, stock')
    .eq('store_id', storeId)
    .eq('is_active', true)

  const lowStock = (products ?? []).filter(p => p.stock <= LOW_STOCK_THRESHOLD)

  const alerts = lowStock.map(p => {
    const outOfStock = p.stock === 0
    return {
      store_id: storeId,
      title: outOfStock ? 'Rupture de stock' : 'Stock limité',
      message: outOfStock
        ? `${p.name} est en rupture de stock.`
        : `${p.name} — plus que ${p.stock} en stock.`,
      type: 'alert',
      action_url: `/dashboard/products/${p.id}`,
      dedupe_key: `stock-${outOfStock ? 'out' : 'low'}-${p.id}`,
    }
  })

  // Resolve alerts whose product recovered stock, went inactive, or was deleted.
  const validKeys = new Set(alerts.map(a => a.dedupe_key))
  const { data: existing } = await supabase
    .from('notifications')
    .select('id, dedupe_key')
    .eq('store_id', storeId)
    .like('dedupe_key', 'stock-%')
  const staleIds = (existing ?? [])
    .filter(n => n.dedupe_key && !validKeys.has(n.dedupe_key))
    .map(n => n.id)
  if (staleIds.length) {
    await supabase.from('notifications').delete().in('id', staleIds)
  }

  if (alerts.length) {
    await supabase
      .from('notifications')
      .upsert(alerts, { onConflict: 'store_id,dedupe_key', ignoreDuplicates: true })
  }
}
