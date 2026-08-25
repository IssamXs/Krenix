import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan, type SiteBlockNode } from '@/types/database'
import { isReservedSlug, slugify } from '@/lib/site-builder/reserved-slugs'
import { SITE_BUILDER_ENABLED } from '@/lib/site-builder/feature-flag'

export async function POST(request: Request) {
  try {
    if (!SITE_BUILDER_ENABLED) {
      return NextResponse.json({ error: 'Le constructeur de site sera bientôt disponible.' }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const rawSlug = typeof body.slug === 'string' ? body.slug : ''
    const slug = slugify(rawSlug || title)
    const blocks: SiteBlockNode[] = Array.isArray(body.blocks) ? body.blocks : []

    if (!title) return NextResponse.json({ error: 'Titre requis.' }, { status: 400 })
    if (!slug) return NextResponse.json({ error: 'Slug invalide.' }, { status: 400 })
    if (isReservedSlug(slug)) return NextResponse.json({ error: 'Ce slug est réservé, choisissez-en un autre.' }, { status: 400 })

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('site_pages')
      .insert({ store_id: store.id, title, slug, blocks })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Une page avec ce slug existe déjà.' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ page: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
