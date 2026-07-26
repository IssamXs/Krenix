import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { PRO_PLANS, ULTIMATE_PLANS, type Plan, type TierRequired } from '@/types/database'

// Theme application was previously a direct client-side `stores.update()` call —
// the Pro/Ultimate tier lock only gated the button's onClick handler in the UI,
// so any authenticated owner could apply a locked theme by calling the same
// Supabase update from devtools. RLS on `stores` only checks ownership, not plan,
// so the check has to live here.
function tierAllowed(tier: TierRequired, plan: Plan): boolean {
  if (tier === 'basic') return true
  if (tier === 'pro') return PRO_PLANS.includes(plan)
  return ULTIMATE_PLANS.includes(plan)
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
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

  if (!tierAllowed(theme.tier_required as TierRequired, store.plan as Plan)) {
    return NextResponse.json({ error: 'Ce thème nécessite un plan supérieur.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('stores').update({ theme_id: theme.id }).eq('id', store.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, slug: theme.slug })
}
