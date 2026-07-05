import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { unsubscribePage } from '@/lib/meta'

async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { storeId: store.id as string }
}

// GET → redacted connection list (no tokens)
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data } = await admin
    .from('channel_connections')
    .select('id, platform, page_name, enabled')
    .eq('store_id', s.storeId)
    .order('platform')
  return NextResponse.json({ connections: data ?? [] })
}

// PATCH { id, enabled } → toggle
export async function PATCH(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const { id, enabled } = await request.json()
  const admin = createAdminClient()
  await admin.from('channel_connections')
    .update({ enabled: !!enabled })
    .eq('id', id)
    .eq('store_id', s.storeId)
  return NextResponse.json({ ok: true })
}

// DELETE { pageId? } → unsubscribe at Meta then delete the store's connection(s).
// The connect flow stores one page per store, so 'ALL' or an omitted pageId removes
// every connection; a specific pageId removes just that page's rows.
export async function DELETE(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const { pageId } = await request.json().catch(() => ({ pageId: undefined as string | undefined }))
  const admin = createAdminClient()

  let selectQuery = admin
    .from('channel_connections')
    .select('page_id, page_access_token')
    .eq('store_id', s.storeId)
  if (pageId && pageId !== 'ALL') selectQuery = selectQuery.eq('page_id', pageId)
  const { data: rows } = await selectQuery

  // Unsubscribe each distinct page once (best-effort).
  const seen = new Set<string>()
  for (const r of rows ?? []) {
    if (!r.page_id || seen.has(r.page_id)) continue
    seen.add(r.page_id)
    try { await unsubscribePage(r.page_id, decryptToken(r.page_access_token)) } catch { /* best effort */ }
  }

  let delQuery = admin.from('channel_connections').delete().eq('store_id', s.storeId)
  if (pageId && pageId !== 'ALL') delQuery = delQuery.eq('page_id', pageId)
  await delQuery
  return NextResponse.json({ ok: true })
}
