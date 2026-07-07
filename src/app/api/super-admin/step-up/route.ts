import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createRawClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { signStepUp, STEPUP_COOKIE, STEPUP_TTL_MS } from '@/lib/step-up'

// Re-verify the admin's password WITHOUT disturbing their main session (uses a
// throwaway non-persistent client), then set a short-lived signed step-up cookie.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { password } = await request.json().catch(() => ({ password: '' }))
  if (!password) return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 })

  const throwaway = createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await throwaway.auth.signInWithPassword({ email: user.email, password })
  if (error) return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(STEPUP_COOKIE, signStepUp(user.id), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: Math.floor(STEPUP_TTL_MS / 1000),
  })
  return res
}
