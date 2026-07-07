import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const params = await context.params
  const storeId = params.id
  if (!storeId) return NextResponse.json({ error: 'ID requis' }, { status: 400 })

  const admin = createAdminClient()

  // Verify ownership
  const { data: store } = await admin
    .from('stores')
    .select('id, owner_id')
    .eq('id', storeId)
    .single()

  if (!store || store.owner_id !== user.id) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })
  }

  // Delete the store. Foreign key cascades in DB will delete orders, products, integrations, etc.
  const { error } = await admin
    .from('stores')
    .delete()
    .eq('id', storeId)

  if (error) {
    console.error('Erreur suppression boutique:', error)
    return NextResponse.json({ error: 'Erreur lors de la suppression' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
