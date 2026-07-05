import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function validateAlgerianPhone(phone: string) {
  const digits = phone.replace(/\s/g, '')
  return /^(05|06|07)\d{8}$/.test(digits)
}

export async function POST(req: NextRequest) {
  try {
    const { store_id, landing_page_id, name, phone, wilaya, abandoned } = await req.json()

    if (!store_id || !name?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }

    if (!validateAlgerianPhone(phone)) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
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
