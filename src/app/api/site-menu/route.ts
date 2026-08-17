import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'
import { SITE_BUILDER_ENABLED } from '@/lib/site-builder/feature-flag'

const VALID_MENU_ITEM_TYPES = ['page', 'builtin', 'url']

function isValidMenuItem(item: unknown): boolean {
  if (typeof item !== 'object' || item === null) return false
  const i = item as Record<string, unknown>
  return (
    typeof i.id === 'string' && i.id.length > 0 &&
    typeof i.label === 'string' && i.label.trim().length > 0 &&
    typeof i.type === 'string' && VALID_MENU_ITEM_TYPES.includes(i.type) &&
    typeof i.target === 'string' && i.target.length > 0 &&
    typeof i.order === 'number'
  )
}

export async function PATCH(request: Request) {
  try {
    if (!SITE_BUILDER_ENABLED) {
      return NextResponse.json({ error: 'Le constructeur de site sera bientôt disponible.' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, settings')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const menu = body.menu
    if (!Array.isArray(menu)) {
      return NextResponse.json({ error: 'Menu invalide.' }, { status: 400 })
    }
    if (!menu.every(isValidMenuItem)) {
      return NextResponse.json({ error: 'Un ou plusieurs éléments du menu sont invalides.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { error } = await admin
      .from('stores')
      .update({ settings: { ...store.settings, siteMenu: menu } })
      .eq('id', store.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
