import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidateStoreCache, revalidateLandingPageCache } from '@/lib/cache/store-cache'

// `revalidateTag` only works server-side, but several storefront mutations
// (theme apply, settings save, landing-page editor save/publish) run as
// client components calling Supabase directly from the browser. Those call
// this route right after a successful save so the cached storefront reads
// don't go stale until their TTL. Auth-checked (not scoped to a caller-
// supplied store id) — a signed-in user can only ever trigger a bust of the
// shared cache tags, never target another store specifically, so there's
// nothing here to authorize beyond "is a logged-in dashboard user".
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { scope } = await request.json().catch(() => ({ scope: 'store' }))

    if (scope === 'landing-page') revalidateLandingPageCache()
    else revalidateStoreCache()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[revalidate-cache]', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
