import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signBackupSession, BACKUP_SESSION_COOKIE, BACKUP_SESSION_TTL_MS } from '@/lib/step-up'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST(request: Request) {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    // Backup codes have real entropy so brute force is impractical, but this
    // is the account-recovery path around 2FA — throttle guess attempts as
    // defense-in-depth, keyed by account (primary) and IP (secondary).
    const [byAccount, byIp] = await Promise.all([
      checkRateLimit(`verify-backup:user:${user.id}`, 10, 900),
      checkRateLimit(`verify-backup:ip:${requestIp(request)}`, 20, 900),
    ])
    if (!byAccount || !byIp) return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })

    const admin = createAdminClient()
    const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
    if (!sa) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

    const { code } = await request.json().catch(() => ({ code: '' }))
    if (!code) return NextResponse.json({ error: 'Code requis' }, { status: 400 })

    const hash = crypto.createHash('sha256').update(code.trim()).digest('hex')

    const { data: validCode } = await admin.from('super_admin_backup_codes')
      .select('id')
      .eq('user_id', user.id)
      .eq('code_hash', hash)
      .is('used_at', null)
      .maybeSingle()

    if (!validCode) {
      return NextResponse.json({ error: 'Code incorrect ou déjà utilisé' }, { status: 401 })
    }

    // Mark as used
    await admin.from('super_admin_backup_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', validCode.id)

    // Issue backup session cookie
    const res = NextResponse.json({ ok: true })
    res.cookies.set(BACKUP_SESSION_COOKIE, signBackupSession(user.id), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: Math.floor(BACKUP_SESSION_TTL_MS / 1000),
    })

    return res
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
