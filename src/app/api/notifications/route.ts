import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStore } from '@/lib/active-store'
import { syncStockAlerts } from '@/lib/stock-alerts'
import type { Store } from '@/types/database'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const store = await resolveActiveStore(supabase, user.id, 'id, settings') as Pick<Store, 'id' | 'settings'> | null
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  // Absent = enabled: merchants want to know about stock issues by default.
  if (store.settings?.notifyStockAlerts !== false) {
    await syncStockAlerts(supabase, store.id)
  }

  const { data: notifications, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('store_id', store.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(notifications)
}

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const store = await resolveActiveStore(supabase, user.id)
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  try {
    const body = await request.json()
    const { id, markAllRead } = body

    if (markAllRead) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('store_id', store.id)
        .eq('is_read', false)
      if (error) throw error
    } else if (id) {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id)
        .eq('store_id', store.id)
      if (error) throw error
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur inconnue'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
