import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST { ids: string[], archived: boolean } — hide (archive) or restore orders.
// The AI detector lets a merchant archive flagged fake orders instead of hard
// deleting them; archived orders leave the live list but stay in the archive
// view. Ownership is enforced the same way as the delete route.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body: { ids?: unknown; archived?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalide' }, { status: 400 })
  }

  const { ids, archived } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Aucun ID fourni' }, { status: 400 })
  }
  const archivedValue = !!archived

  const admin = createAdminClient()
  const { data: orders } = await admin
    .from('orders')
    .select('id, store_id')
    .in('id', ids)

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true, archivedCount: 0 })
  }

  const storeIds = [...new Set(orders.map(o => o.store_id as string))]
  const { data: stores } = await admin
    .from('stores')
    .select('id, owner_id')
    .in('id', storeIds)
    .eq('owner_id', user.id)
  const ownedStoreIds = new Set((stores ?? []).map(s => s.id as string))

  const idsToUpdate = orders
    .filter(o => ownedStoreIds.has(o.store_id as string))
    .map(o => o.id as string)

  if (idsToUpdate.length === 0) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { error } = await admin
    .from('orders')
    .update({ is_archived: archivedValue })
    .in('id', idsToUpdate)

  if (error) {
    console.error('Erreur archivage commandes:', error)
    return NextResponse.json({ error: 'Erreur lors de l’archivage' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, archivedCount: idsToUpdate.length })
}
