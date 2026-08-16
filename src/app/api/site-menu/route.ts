import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, settings')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    if (!Array.isArray(body.menu)) {
      return NextResponse.json({ error: 'Menu invalide.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('stores')
      .update({ settings: { ...store.settings, siteMenu: body.menu } })
      .eq('id', store.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
