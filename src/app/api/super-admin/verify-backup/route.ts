import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signBackupSession, BACKUP_SESSION_COOKIE, BACKUP_SESSION_TTL_MS } from '@/lib/step-up'
import crypto from 'crypto'

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

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
}
