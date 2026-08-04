import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { checkVerificationStatus } from '@/lib/telegram-gateway'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const ip = requestIp(request)
  const [userOk, ipOk] = await Promise.all([
    checkRateLimit(`verify-phone:check:user:${user.id}`, 5, 600),
    checkRateLimit(`verify-phone:check:ip:${ip}`, 20, 600),
  ])
  if (!userOk || !ipOk) {
    return NextResponse.json({ error: 'Trop de tentatives. Veuillez patienter avant de réessayer.' }, { status: 429 })
  }

  const { code } = await request.json().catch(() => ({})) as { code?: string }
  if (!code) {
    return NextResponse.json({ error: 'Code manquant.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: verification } = await admin
    .from('phone_verifications')
    .select('telegram_request_id, phone_verified')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!verification?.telegram_request_id) {
    return NextResponse.json({ error: 'Aucune vérification en cours. Demandez un nouveau code.' }, { status: 400 })
  }

  if (verification.phone_verified) {
    return NextResponse.json({ status: 'code_valid' })
  }

  let status: Awaited<ReturnType<typeof checkVerificationStatus>>
  try {
    status = await checkVerificationStatus(verification.telegram_request_id as string, code)
  } catch (err) {
    console.error('verify-phone/check: checkVerificationStatus threw', err)
    return NextResponse.json({ error: 'Une erreur est survenue. Réessayez.' }, { status: 500 })
  }

  // 'error' means the check itself couldn't be performed (misconfigured token,
  // network failure, non-ok Gateway response) — NOT that the code was wrong.
  // Never flip phone_verified to true here, and surface 'error' distinctly so
  // the client can show a generic failure message instead of "wrong code".
  if (status === 'code_valid') {
    const { data: updated, error: updateError } = await admin
      .from('phone_verifications')
      .update({
        phone_verified: true,
        verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select('phone_verified')
      .single()

    if (updateError || !updated?.phone_verified) {
      console.error('verify-phone/check: failed to persist phone_verified', updateError)
      return NextResponse.json({ error: 'Une erreur est survenue. Réessayez.' }, { status: 500 })
    }
  }

  return NextResponse.json({ status })
}
