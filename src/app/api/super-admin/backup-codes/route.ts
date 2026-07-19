import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/super-admin'
import crypto from 'crypto'

// 10 codes, 10 chars each drawn from a 32-char alphabet (no ambiguous chars
// like 0/O/1/I). ~50 bits entropy per code, matches industry norms for backup
// codes and is well outside brute-force range against verify-backup.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function randomCode(): string {
  const bytes = crypto.randomBytes(10)
  let s = ''
  for (let i = 0; i < 10; i++) s += ALPHABET[bytes[i] % ALPHABET.length]
  return s
}

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  // If a verified TOTP factor already exists, regenerating backup codes must
  // be done at AAL2 — otherwise a stolen password alone could mint 10 fresh
  // codes and bypass the 2FA gate entirely.
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const hasVerifiedFactor = !!factors?.totp?.find(f => f.status === 'verified')
  if (hasVerifiedFactor) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'Authentification à deux facteurs requise', code: 'MFA_REQUIRED' }, { status: 403 })
    }
  }

  await admin.from('super_admin_backup_codes')
    .delete()
    .eq('user_id', user.id)
    .is('used_at', null)

  const codes: string[] = []
  const inserts: { user_id: string; code_hash: string }[] = []
  for (let i = 0; i < 10; i++) {
    const code = randomCode()
    codes.push(code)
    const hash = crypto.createHash('sha256').update(code).digest('hex')
    inserts.push({ user_id: user.id, code_hash: hash })
  }

  const { error } = await admin.from('super_admin_backup_codes').insert(inserts)
  if (error) {
    console.error('Error saving backup codes:', error)
    return NextResponse.json({ error: 'Erreur lors de la création des codes.' }, { status: 500 })
  }

  await logAdminAction(admin, user.id, 'backup_codes.regenerate', 'super_admin', sa.id, { count: codes.length })

  return NextResponse.json({ codes })
}
