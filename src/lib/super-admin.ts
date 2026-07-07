import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyStepUp, STEPUP_COOKIE } from '@/lib/step-up'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminContext { userId: string; email: string; admin: SupabaseClient }

// Guard for every /api/super-admin route. Returns a NextResponse (to return
// directly) on failure, or the AdminContext on success. Order: session →
// super_admins row → AAL2 (2FA) → step-up cookie (destructive routes only).
export async function requireSuperAdmin(opts: { stepUp?: boolean } = {}): Promise<AdminContext | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié', code: 'UNAUTH' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Accès refusé', code: 'FORBIDDEN' }, { status: 403 })

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'Authentification à deux facteurs requise', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  if (opts.stepUp) {
    const cookieStore = await cookies()
    if (!verifyStepUp(cookieStore.get(STEPUP_COOKIE)?.value, user.id)) {
      return NextResponse.json({ error: 'Ré-authentification requise', code: 'STEPUP_REQUIRED' }, { status: 403 })
    }
  }

  return { userId: user.id, email: user.email ?? '', admin }
}

export function isAdminContext(v: AdminContext | NextResponse): v is AdminContext {
  return !(v instanceof NextResponse)
}

export async function logAdminAction(
  admin: SupabaseClient, actorId: string, action: string,
  targetType: string, targetId: string | null, details: Record<string, unknown> = {},
): Promise<void> {
  await admin.from('admin_audit_log').insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, details })
}
