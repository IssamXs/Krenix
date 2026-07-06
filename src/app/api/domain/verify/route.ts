import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'

// POST → check the domain's DNS CNAME via DNS-over-HTTPS (Google resolver).
// Verified when the CNAME chain points at stores.<root> or the root domain.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id, custom_domain')
  if (!store?.custom_domain) {
    return NextResponse.json({ error: 'Aucun domaine configuré' }, { status: 400 })
  }

  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'krenix.store'
  const expectedSuffixes = [rootDomain, `stores.${rootDomain}`]

  let verified = false
  try {
    const res = await fetch(
      `https://dns.google/resolve?name=${encodeURIComponent(store.custom_domain)}&type=CNAME`,
      { headers: { Accept: 'application/dns-json' } },
    )
    const json = (await res.json()) as { Answer?: Array<{ data?: string }> }
    const targets = (json.Answer ?? [])
      .map(a => (a.data ?? '').toLowerCase().replace(/\.$/, ''))
    verified = targets.some(t => expectedSuffixes.some(s => t === s || t.endsWith(`.${s}`)))
  } catch {
    return NextResponse.json({ error: 'Vérification DNS impossible pour le moment. Réessayez.' }, { status: 502 })
  }

  if (verified) {
    const admin = createAdminClient()
    await admin.from('stores').update({ custom_domain_verified: true }).eq('id', store.id)
  }

  return NextResponse.json({
    verified,
    ...(verified ? {} : {
      hint: `Aucun CNAME trouvé vers stores.${rootDomain}. La propagation DNS peut prendre jusqu'à 24 h.`,
    }),
  })
}
