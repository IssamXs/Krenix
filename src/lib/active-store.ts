// ============================================================
// Active store resolution for Agency multi-store accounts.
// A single account (owner_id) can own several stores; the "active" one is kept
// in localStorage. Single-store accounts are unaffected (first/only store).
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

const KEY = 'krenix_active_store_id'

export function getActiveStoreId(): string | null {
  if (typeof window === 'undefined') return null
  try { return window.localStorage.getItem(KEY) } catch { return null }
}

export function setActiveStoreId(id: string) {
  try { window.localStorage.setItem(KEY, id) } catch { /* ignore */ }
  // Mirror into a cookie so server-side API routes (resolveActiveStoreServer) act
  // on the same store. 1-year, same-site so it rides along on every same-origin fetch.
  try { document.cookie = `${KEY}=${id}; path=/; max-age=31536000; SameSite=Lax` } catch { /* ignore */ }
}

/**
 * Resolve the store the dashboard should show for a user:
 * the localStorage active store if it belongs to them, else their first store.
 * Returns null if the user owns no store.
 */
export async function resolveActiveStore(
  supabase: SupabaseClient,
  userId: string,
  columns = '*',
): Promise<Record<string, unknown> | null> {
  const { data: stores } = await supabase
    .from('stores')
    .select(columns)
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
  const list = (stores ?? []) as unknown as Array<Record<string, unknown>>
  if (list.length === 0) return null
  const activeId = getActiveStoreId()
  return list.find(s => s.id === activeId) ?? list[0]
}
