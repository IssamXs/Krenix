'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Every dashboard page called createClient() fresh in its own useEffect, which
// (a) spun up a brand-new GoTrueClient per page — Supabase's own SDK warns
// about "Multiple GoTrueClient instances" for exactly this pattern — and
// (b) meant every client-side navigation re-validated the session with a
// network round trip via auth.getUser(), even though nothing about the
// session had changed since the previous page. A single cached client
// instance, plus a short-TTL memo on getUser(), turns "switch dashboard
// section" from "two network round trips before anything can render" into
// "instant" for any navigation within a few seconds of the last one.
let client: SupabaseClient | undefined

const USER_CACHE_TTL_MS = 15_000
let cachedUser: ReturnType<SupabaseClient['auth']['getUser']> | null = null
let cachedUserAt = 0

export function createClient() {
  if (client) return client

  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const originalGetUser = client.auth.getUser.bind(client.auth)
  client.auth.getUser = (jwt?: string) => {
    // Only the common no-arg call (checking the current session) is memoized;
    // an explicit jwt always goes straight to the network.
    if (jwt) return originalGetUser(jwt)
    const now = Date.now()
    if (cachedUser && now - cachedUserAt < USER_CACHE_TTL_MS) return cachedUser
    const result = originalGetUser()
    cachedUser = result
    cachedUserAt = now
    result.catch(() => { cachedUser = null })
    return result
  }

  // Any real auth transition (sign in/out, token refresh) invalidates the
  // memo immediately instead of waiting out the TTL.
  client.auth.onAuthStateChange(() => { cachedUser = null })

  return client
}
