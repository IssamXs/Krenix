import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Payload invalide' }, { status: 400 })
  }

  const { ids } = body
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'Aucun ID fourni' }, { status: 400 })
  }

  // To ensure the user only deletes their own orders, we need to enforce that
  // the user is the owner of the store that owns these orders.
  // We can do this efficiently by looking up the store_ids for these orders,
  // and ensuring the store owner_id matches the user.id.
  const admin = createAdminClient()
  
  const { data: orders } = await admin
    .from('orders')
    .select('id, store_id, order_number, customer_name, customer_phone, wilaya, total_price, status, created_at')
    .in('id', ids)

  if (!orders || orders.length === 0) {
    return NextResponse.json({ ok: true }) // Nothing to delete
  }

  const storeIds = [...new Set(orders.map(o => o.store_id))]
  
  const { data: stores } = await admin
    .from('stores')
    .select('id, owner_id')
    .in('id', storeIds)
    .eq('owner_id', user.id)

  const ownedStoreIds = new Set(stores?.map(s => s.id) || [])

  // Only keep IDs that belong to stores owned by the user
  const idsToDelete = orders
    .filter(o => ownedStoreIds.has(o.store_id))
    .map(o => o.id)

  if (idsToDelete.length === 0) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Snapshot before the hard delete — this is the only place `orders` rows
  // are ever deleted, and a bare DELETE otherwise leaves no trace at all
  // (order_number gaps with nothing to explain them). Best-effort: a logging
  // failure must never block the delete the merchant actually asked for.
  const toDelete = orders.filter(o => idsToDelete.includes(o.id))
  try {
    await admin.from('order_deletions').insert(
      toDelete.map(o => ({
        store_id: o.store_id,
        order_id: o.id,
        order_number: o.order_number,
        customer_name: o.customer_name,
        customer_phone: o.customer_phone,
        wilaya: o.wilaya,
        total_price: o.total_price,
        status: o.status,
        order_created_at: o.created_at,
        deleted_by: user.id,
      })),
    )
  } catch (err) {
    console.error('[orders/delete] deletion log insert failed:', err)
  }

  const { error } = await admin
    .from('orders')
    .delete()
    .in('id', idsToDelete)

  if (error) {
    console.error('Erreur suppression commandes:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deletedCount: idsToDelete.length })
}
