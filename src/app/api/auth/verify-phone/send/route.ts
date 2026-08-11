import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { isValidAlgerianPhone, toE164Algeria } from '@/lib/phone'
import { checkSendAbility, sendVerificationMessage } from '@/lib/telegram-gateway'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const ip = requestIp(request)
    const [userOk, ipOk] = await Promise.all([
      checkRateLimit(`verify-phone:send:user:${user.id}`, 3, 600),
      checkRateLimit(`verify-phone:send:ip:${ip}`, 10, 600),
    ])
    if (!userOk || !ipOk) {
      return NextResponse.json({ error: 'Trop de tentatives. Veuillez patienter avant de réessayer.' }, { status: 429 })
    }

    const { phone: bodyPhone } = await request.json().catch(() => ({})) as { phone?: string }
    const admin = createAdminClient()

    let e164: string
    if (bodyPhone?.trim()) {
      const phone = bodyPhone.trim()
      if (!isValidAlgerianPhone(phone)) {
        return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
      }
      e164 = toE164Algeria(phone)
    } else {
      const { data: existing } = await admin
        .from('phone_verifications')
        .select('phone')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!existing?.phone) {
        return NextResponse.json({ error: 'Numéro de téléphone manquant.' }, { status: 400 })
      }
      e164 = existing.phone as string
    }

    const { error: upsertError } = await admin.from('phone_verifications').upsert({
      user_id: user.id,
      phone: e164,
      phone_verified: false,
      updated_at: new Date().toISOString(),
    })
    if (upsertError) {
      return NextResponse.json({ error: "Une erreur est survenue. Réessayez." }, { status: 500 })
    }

    const ability = await checkSendAbility(e164)
    if (!ability.deliverable) {
      return NextResponse.json({ deliverable: false, phone: e164 })
    }

    const sent = await sendVerificationMessage(e164, ability.requestId)
    if (!sent) {
      return NextResponse.json({ error: "Impossible d'envoyer le code pour le moment. Réessayez." }, { status: 502 })
    }

    const { error: updateError } = await admin.from('phone_verifications').update({
      telegram_request_id: sent.requestId,
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id)
    if (updateError) {
      console.error('verify-phone/send: failed to persist telegram_request_id', updateError)
    }

    return NextResponse.json({ deliverable: true, codeLength: sent.codeLength, phone: e164 })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
