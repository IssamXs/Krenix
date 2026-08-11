import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { ULTIMATE_PLANS, type Plan, type TierRequired } from '@/types/database'

// Theme application was previously a direct client-side `stores.update()` call —
// the tier lock only gated the button's onClick handler in the UI, so any owner
// could apply a locked theme via devtools. RLS on `stores` only checks
// ownership, not plan, so the check has to live here.
//
// Plan rules:
//   • Basic-tier theme (generic/universal) → anyone.
//   • Niche theme (tier pro/ultimate — the 5 premium themes):
//       - Ultimate+ → any of the 5 (switch freely).
//       - Pro       → may pick ONE and keep it. pro_theme_slug records the
//                     locked choice; a different niche is refused until upgrade.
//       - Basic     → refused.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, pro_theme_slug')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const { slug } = await request.json().catch(() => ({}))
    if (typeof slug !== 'string' || !slug) {
      return NextResponse.json({ error: 'Thème invalide' }, { status: 400 })
    }

    const { data: theme } = await supabase
      .from('themes')
      .select('id, slug, tier_required')
      .eq('slug', slug)
      .single()
    if (!theme) return NextResponse.json({ error: 'Thème introuvable' }, { status: 404 })

    const plan = store.plan as Plan
    const tier = theme.tier_required as TierRequired
    const isNiche = tier === 'pro' || tier === 'ultimate'
    const patch: Record<string, unknown> = { theme_id: theme.id }

    if (isNiche) {
      const isUltimate = ULTIMATE_PLANS.includes(plan)
      const isPro = plan === 'pro'
      if (isUltimate) {
        // full access — no lock
      } else if (isPro) {
        const locked = (store as { pro_theme_slug?: string | null }).pro_theme_slug ?? null
        if (locked && locked !== theme.slug) {
          return NextResponse.json({
            error: 'Votre plan Pro est associé à un seul thème. Passez à Ultimate pour changer de thème.',
          }, { status: 403 })
        }
        if (!locked) patch.pro_theme_slug = theme.slug // lock in the first niche choice
      } else {
        return NextResponse.json({ error: 'Ce thème nécessite le plan Pro ou supérieur.' }, { status: 403 })
      }
    }

    const admin = createAdminClient()
    const { error } = await admin.from('stores').update(patch).eq('id', store.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, slug: theme.slug })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
