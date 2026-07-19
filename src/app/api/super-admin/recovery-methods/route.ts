import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logAdminAction } from '@/lib/super-admin'

// Basic email + phone validation. The point is to reject obvious garbage /
// injection attempts, not to be RFC-perfect.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[0-9 ]{6,20}$/

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  // Same rationale as backup-codes: if a verified TOTP exists, an AAL1 session
  // must not be able to overwrite the recovery contacts (that would let a
  // password-only attacker prime a self-service recovery bypass).
  const { data: factors } = await supabase.auth.mfa.listFactors()
  const hasVerifiedFactor = !!factors?.totp?.find(f => f.status === 'verified')
  if (hasVerifiedFactor) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel !== 'aal2') {
      return NextResponse.json({ error: 'Authentification à deux facteurs requise', code: 'MFA_REQUIRED' }, { status: 403 })
    }
  }

  const { phone, email } = await request.json().catch(() => ({}))
  const updateData: { recovery_phone?: string | null; recovery_email?: string | null } = {}

  if (phone !== undefined) {
    const p = typeof phone === 'string' ? phone.trim() : ''
    if (p && !PHONE_RE.test(p)) return NextResponse.json({ error: 'Téléphone invalide' }, { status: 400 })
    updateData.recovery_phone = p || null
  }
  if (email !== undefined) {
    const e = typeof email === 'string' ? email.trim() : ''
    if (e && !EMAIL_RE.test(e)) return NextResponse.json({ error: 'Email invalide' }, { status: 400 })
    updateData.recovery_email = e || null
  }

  const { error } = await admin.from('super_admins')
    .update(updateData)
    .eq('id', sa.id)

  if (error) {
    console.error('Error updating recovery methods:', error)
    return NextResponse.json({ error: 'Erreur lors de la sauvegarde.' }, { status: 500 })
  }

  await logAdminAction(admin, user.id, 'recovery_methods.update', 'super_admin', sa.id, {
    updated_phone: 'phone' in updateData,
    updated_email: 'email' in updateData,
  })

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins')
    .select('recovery_phone, recovery_email')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!sa) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  return NextResponse.json({ phone: sa.recovery_phone, email: sa.recovery_email })
}
