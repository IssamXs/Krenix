// ============================================================
// Active store resolution for Agency multi-store accounts.
// A single account (owner_id) can own several stores; the "active" one is kept
// in localStorage. Single-store accounts are unaffected (first/only store).
// ============================================================
import type { SupabaseClient } from '@supabase/supabase-js'

const KEY = 'krenix_active_store_id'

// Every dashboard page resolves its store on mount, each historically asking
// for a different column subset — which meant near-zero cache reuse across
// pages even with memoization, and a fresh query on every navigation. Since
// this is a single small row, the fix is to always fetch every column
// (`columns` is now purely a caller-side narrowing hint, ignored for the
// fetch itself) and share ONE short-TTL cache entry per user across every
// page that calls this, instead of one differently-shaped query each.
const STORE_LIST_CACHE_TTL_MS = 15_000
let storeListCache: { userId: string; at: number; promise: Promise<Array<Record<string, unknown>>> } | null = null

function fetchStoreList(supabase: SupabaseClient, userId: string) {
  const now = Date.now()
  if (storeListCache && storeListCache.userId === userId && now - storeListCache.at < STORE_LIST_CACHE_TTL_MS) {
    return storeListCache.promise
  }
  const promise = (async () => {
    const { data } = await supabase
      .from('stores')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
    return (data ?? []) as Array<Record<string, unknown>>
  })()
  storeListCache = { userId, at: now, promise }
  promise.catch(() => { storeListCache = null })
  return promise
}

/** Call after any mutation that changes the current user's own store list/fields (create, plan change, settings save) so the next read isn't served stale. */
export function invalidateActiveStoreCache() {
  storeListCache = null
}

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
  _columns = '*',
): Promise<Record<string, unknown> | null> {
  const list = await fetchStoreList(supabase, userId)
  if (list.length === 0) return null
  const activeId = getActiveStoreId()
  return list.find(s => s.id === activeId) ?? list[0]
}
