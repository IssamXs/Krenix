import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'
import { revalidateSitePageCache } from '@/lib/cache/store-cache'
import { SITE_BUILDER_ENABLED } from '@/lib/site-builder/feature-flag'

async function authorizeOwnedPage(pageId: string) {
  if (!SITE_BUILDER_ENABLED) {
    return { error: NextResponse.json({ error: 'Le constructeur de site sera bientôt disponible.' }, { status: 403 }) } as const
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) } as const

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
  if (!store) return { error: NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 }) } as const
  if (!ULTIMATE_PLANS.includes(store.plan as Plan)) {
    return { error: NextResponse.json({ error: 'Le constructeur de site nécessite le plan Ultimate ou supérieur.' }, { status: 403 }) } as const
  }

  const admin = createAdminClient()
  const { data: page } = await admin.from('site_pages').select('id, store_id').eq('id', pageId).single()
  if (!page) return { error: NextResponse.json({ error: 'Page introuvable' }, { status: 404 }) } as const
  if (page.store_id !== store.id) return { error: NextResponse.json({ error: 'Accès refusé' }, { status: 403 }) } as const

  return { admin } as const
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authorizeOwnedPage(id)
    if (auth.error) return auth.error

    const body = await request.json().catch(() => ({}))
    const patch: Record<string, unknown> = {}
    if (typeof body.title === 'string' && body.title.trim()) patch.title = body.title.trim()
    if (Array.isArray(body.blocks)) patch.blocks = body.blocks
    if (typeof body.meta_title === 'string') patch.meta_title = body.meta_title
    if (typeof body.meta_description === 'string') patch.meta_description = body.meta_description

    const { data, error } = await auth.admin.from('site_pages').update(patch).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ page: data })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const auth = await authorizeOwnedPage(id)
    if (auth.error) return auth.error

    const { error } = await auth.admin.from('site_pages').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    revalidateSitePageCache()
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
