import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // Optional post-login target (e.g. from a ?redirect=… deep link).
  const next = searchParams.get('next') || searchParams.get('redirect')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Route to /dashboard and let the middleware decide the real destination:
  // → /onboarding if the user has no onboarded store yet (new Google/GitHub signup),
  // → /activate if onboarded but unpaid, → /dashboard if ready.
  const dest = next && next.startsWith('/') ? next : '/dashboard'
  return NextResponse.redirect(`${origin}${dest}`)
}
