import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeLongLivedToken, listPages, subscribePage } from '@/lib/meta'
import { encryptToken } from '@/lib/crypto'

// Body: { userToken: string, pageId?: string }
// Step 1 (no pageId): return the caller's pages so the UI can present a picker.
// Step 2 (pageId): store + subscribe the chosen page.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, chatbot_daily_limit')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const hasChatbot = store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0
    if (!hasChatbot) return NextResponse.json({ error: 'Réservé au plan Ultimate' }, { status: 403 })

    const { userToken, pageId } = await request.json()
    if (!userToken) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

    const longToken = await exchangeLongLivedToken(userToken)
    const pages = await listPages(longToken)

    if (!pageId) {
      // Return a minimal picker list (no tokens leak to the client).
      return NextResponse.json({
        pages: pages.map(p => ({ id: p.id, name: p.name, hasInstagram: !!p.instagram_business_account })),
      })
    }

    const page = pages.find(p => p.id === pageId)
    if (!page) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

    await subscribePage(page.id, page.access_token)

    const admin = createAdminClient()
    const encToken = encryptToken(page.access_token)
    const igId = page.instagram_business_account?.id ?? null

    // Upsert a messenger row; if an IG account is linked, upsert an instagram row too.
    const rows = [
      { platform: 'messenger' as const, page_id: page.id, ig_id: null },
      ...(igId ? [{ platform: 'instagram' as const, page_id: page.id, ig_id: igId }] : []),
    ]

    for (const r of rows) {
      // Remove any stale rows for this platform then insert fresh (idempotent connect).
      await admin.from('channel_connections')
        .delete()
        .eq('store_id', store.id)
        .eq('platform', r.platform)
      await admin.from('channel_connections').insert({
        store_id: store.id,
        platform: r.platform,
        page_id: r.page_id,
        ig_id: r.ig_id,
        page_access_token: encToken,
        page_name: page.name,
        enabled: true,
      })
    }

    return NextResponse.json({
      connected: true,
      pageName: page.name,
      instagram: !!igId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur de connexion'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
