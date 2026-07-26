import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import type { Plan, Store } from '@/types/database'

// White-label was previously a direct client-side `stores.update()` call —
// the Enterprise-only lock only gated the form's rendering, not the save
// itself, so any authenticated owner could set white-label branding via a
// raw Supabase call from devtools. RLS on `stores` only checks ownership,
// not plan, so the check has to live here.
const WHITE_LABEL_PLANS: Plan[] = ['enterprise', 'sur_mesure']

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, settings') as Store | null
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  if (!WHITE_LABEL_PLANS.includes(store.plan as Plan)) {
    return NextResponse.json({ error: 'Réservé au plan Enterprise' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl : undefined
  const platformName = typeof body.platformName === 'string' ? body.platformName.slice(0, 60) : undefined
  const primaryColor = typeof body.primaryColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.primaryColor)
    ? body.primaryColor
    : undefined

  const admin = createAdminClient()
  const { error } = await admin.from('stores').update({
    settings: { ...store.settings, whiteLabel: { logoUrl, platformName, primaryColor } },
  }).eq('id', store.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
