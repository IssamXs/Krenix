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

  const admin = createAdminClient()
  
  const { data: sessions } = await admin
    .from('chatbot_sessions')
    .select('id, store_id')
    .in('id', ids)

  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const storeIds = [...new Set(sessions.map(s => s.store_id))]
  
  const { data: stores } = await admin
    .from('stores')
    .select('id, owner_id')
    .in('id', storeIds)
    .eq('owner_id', user.id)

  const ownedStoreIds = new Set(stores?.map(s => s.id) || [])

  // Only keep IDs that belong to stores owned by the user
  const idsToDelete = sessions
    .filter(s => ownedStoreIds.has(s.store_id))
    .map(s => s.id)

  if (idsToDelete.length === 0) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  const { error } = await admin
    .from('chatbot_sessions')
    .delete()
    .in('id', idsToDelete)

  if (error) {
    console.error('Erreur suppression chatbot sessions:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deletedCount: idsToDelete.length })
}
