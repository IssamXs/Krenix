import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { GROWTH_PLANS, type Plan } from '@/types/database'

// Hostname like www.maboutique.dz — no protocol, no path.
const DOMAIN_FORMAT = /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,}$/

function cleanDomain(input: string): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
}

async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, custom_domain, custom_domain_verified')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { store }
}

// GET → current domain + status
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  return NextResponse.json({
    domain: s.store.custom_domain,
    verified: s.store.custom_domain_verified,
    allowed: GROWTH_PLANS.includes(s.store.plan as Plan),
  })
}

// POST { domain } → save (resets verification)
export async function POST(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  if (!GROWTH_PLANS.includes(s.store.plan as Plan)) {
    return NextResponse.json({ error: 'Réservé aux plans Growth et plus' }, { status: 403 })
  }

  const { domain } = await request.json()
  const clean = cleanDomain(domain)
  if (!DOMAIN_FORMAT.test(clean)) {
    return NextResponse.json({ error: 'Domaine invalide. Exemple : www.maboutique.dz' }, { status: 400 })
  }
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'krenix.com'
  if (clean === rootDomain || clean.endsWith(`.${rootDomain}`)) {
    return NextResponse.json({ error: `Utilisez votre propre domaine (pas ${rootDomain}).` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('stores')
    .update({ custom_domain: clean, custom_domain_verified: false })
    .eq('id', s.store.id)
  if (error) {
    const msg = error.code === '23505' ? 'Ce domaine est déjà utilisé par une autre boutique.' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  return NextResponse.json({ domain: clean, verified: false })
}

// DELETE → detach the domain
export async function DELETE() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  await admin
    .from('stores')
    .update({ custom_domain: null, custom_domain_verified: false })
    .eq('id', s.store.id)
  return NextResponse.json({ ok: true })
}
