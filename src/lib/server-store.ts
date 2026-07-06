import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Store } from '@/types/database'

// Server-side counterpart of resolveActiveStore (lib/active-store.ts).
// Agency accounts own several stores and switch the "active" one in the browser;
// setActiveStoreId mirrors that choice into a cookie so authenticated API routes
// act on the SAME store the dashboard is showing. When no valid cookie is present
// (the common single-store case) it falls back to the owner's earliest store.
//
// `columns` mirrors the old inline select so each route only fetches what it needs;
// the result is cast to Store for ergonomic typing (unselected fields stay absent
// at runtime but no route reads them).
const ACTIVE_STORE_COOKIE = 'krenix_active_store_id'

export async function resolveActiveStoreServer(
  supabase: SupabaseClient,
  userId: string,
  columns = 'id',
): Promise<Store | null> {
  const { data } = await supabase
    .from('stores')
    .select(columns)
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
  const list = (data ?? []) as unknown as Store[]
  if (list.length === 0) return null
  let wanted: string | undefined
  try { wanted = (await cookies()).get(ACTIVE_STORE_COOKIE)?.value } catch { /* outside request scope */ }
  return (wanted ? list.find(s => s.id === wanted) : undefined) ?? list[0]
}

// The account's resource holder = the owner's EARLIEST store. AI credits and the
// chatbot daily allowance are a single pool shared across all of an owner's stores;
// that pool lives on this store, so every store draws from (and displays) the same
// balance regardless of which one triggered the usage. Cookie-independent, so it
// works from webhooks (chatbot) and any client. Single-store owners: this IS their
// only store, so behaviour is unchanged.
export async function resolveAccountStore(
  supabase: SupabaseClient,
  ownerId: string,
  columns = 'id',
): Promise<Store | null> {
  const { data } = await supabase
    .from('stores')
    .select(columns)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as unknown as Store) ?? null
}
