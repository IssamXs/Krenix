import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { sendStorefrontEvent } from '@/lib/storefront-capi'
import { randomUUID } from 'crypto'
import { normalizePhone, isValidAlgerianPhone } from '@/lib/phone'

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

    if (!isValidAlgerianPhone(phone)) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }

    if (name.trim().length > 100 || (wilaya && String(wilaya).length > 100)) {
      return NextResponse.json({ error: 'Champ trop long.' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const cleanPhone = normalizePhone(phone)

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

    const { data: leadRow, error } = await supabase.from('leads').insert({
      store_id,
      landing_page_id: landing_page_id ?? null,
      name: name.trim(),
      phone: cleanPhone,
      wilaya: wilaya ?? null,
      status: abandoned ? 'abandoned' : 'new',
    }).select('id').single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Server-side CAPI Lead event — fires at the moment the lead record is
    // actually created in the database. Uses the lead row ID as event_id
    // (or a browser-provided event_id for deduplication with the client pixel).
    const { data: storeRow } = await createAdminClient()
      .from('stores')
      .select('settings')
      .eq('id', store_id)
      .maybeSingle()
    const metaPixelId = storeRow?.settings?.metaPixelId
    const metaCapiToken = storeRow?.settings?.metaCapiToken
    if (metaPixelId && metaCapiToken && leadRow?.id) {
      const eventId = (req.headers.get('x-event-id') as string) || leadRow.id
      sendStorefrontEvent({
        pixelId: metaPixelId,
        accessToken: metaCapiToken,
        eventName: 'Lead',
        eventId,
        storeId: store_id,
        phone: cleanPhone,
        customerName: name.trim(),
        wilaya: wilaya ?? null,
        clientIp: requestIp(req),
        clientUserAgent: req.headers.get('user-agent'),
        fbp: req.cookies.get('_fbp')?.value ?? null,
        fbc: req.cookies.get('_fbc')?.value ?? null,
        externalId: req.cookies.get('_krenix_vid')?.value ?? null,
        eventSourceUrl: req.headers.get('referer'),
      }).catch(() => {}) // fire-and-forget, never block the lead response
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
