import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

function validateAlgerianPhone(phone: string) {
  const digits = phone.replace(/\s/g, '')
  return /^(05|06|07)\d{8}$/.test(digits)
}

export async function POST(req: NextRequest) {
  try {
    const allowed = await checkRateLimit(`leads:${requestIp(req)}`, 20, 300)
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez plus tard.' }, { status: 429 })
    }

    const { store_id, landing_page_id, name, phone, wilaya, abandoned } = await req.json()

    if (!store_id || !name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    if (!validateAlgerianPhone(phone)) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }

    if (name.trim().length > 100 || (wilaya && String(wilaya).length > 100)) {
      return NextResponse.json({ error: 'Champ trop long.' }, { status: 400 })
    }

    const supabase = await createClient()
    const cleanPhone = phone.trim()

    // Abandoned-cart capture: de-dupe so a visitor re-typing doesn't spawn rows.
    // Only one open abandoned lead per (store, phone) at a time.
    if (abandoned) {
      const { data: existing } = await supabase
        .from('leads')
        .select('id')
        .eq('store_id', store_id)
        .eq('phone', cleanPhone)
        .eq('status', 'abandoned')
        .limit(1)
      if (existing && existing.length > 0) {
        return NextResponse.json({ success: true, deduped: true })
      }
    }

    const { error } = await supabase.from('leads').insert({
      store_id,
      landing_page_id: landing_page_id ?? null,
      name: name.trim(),
      phone: cleanPhone,
      wilaya: wilaya ?? null,
      status: abandoned ? 'abandoned' : 'new',
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, notes } = await req.json()
    if (!id) return NextResponse.json({ error: 'ID requis.' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })

    // Ownership check — without this, any authenticated user (from ANY store)
    // could PATCH any lead row platform-wide by id, since the update below has
    // no store scoping of its own.
    const admin = createAdminClient()
    const { data: lead } = await admin
      .from('leads')
      .select('store_id')
      .eq('id', id)
      .maybeSingle()
    if (!lead) return NextResponse.json({ error: 'Introuvable.' }, { status: 404 })

    const { data: store } = await supabase
      .from('stores')
      .select('id')
      .eq('id', lead.store_id)
      .eq('owner_id', user.id)
      .maybeSingle()
    if (!store) return NextResponse.json({ error: 'Non autorisé.' }, { status: 403 })

    const { error } = await supabase
      .from('leads')
      .update({ ...(status && { status }), ...(notes !== undefined && { notes }) })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
