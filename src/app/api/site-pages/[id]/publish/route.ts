import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { revalidateSitePageCache } from '@/lib/cache/store-cache'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'
import { SITE_BUILDER_ENABLED } from '@/lib/site-builder/feature-flag'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!SITE_BUILDER_ENABLED) {
      return NextResponse.json({ error: 'Le constructeur de site sera bientôt disponible.' }, { status: 403 })
    }

    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
      return NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 })
    }

    const admin = createAdminClient()
    const { data: page } = await admin.from('site_pages').select('id, store_id, blocks').eq('id', id).single()
    if (!page) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })
    if (page.store_id !== store.id) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const { data, error } = await admin
      .from('site_pages')
      .update({ published_blocks: page.blocks, status: 'published' })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    revalidateSitePageCache()
    return NextResponse.json({ page: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
