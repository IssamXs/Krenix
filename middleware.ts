// ============================================================
// KRENIX — Middleware (Subdomain Routing)
// This is the core of multi-tenancy
// Place this at the ROOT of your Next.js project
// ============================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { isStoreAccessExpired } from '@/lib/plan-expiry'

// Routes that only exist on the main platform (krenix.store)
const PLATFORM_ROUTES = [
  '/',
  '/pricing',
  '/demo',
  '/auth',
  '/onboarding',
  '/dashboard',
  '/super-admin',
  '/api',
]

// Routes that are public on store subdomains
const STORE_PUBLIC_ROUTES = ['/', '/p', '/merci']

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.clone()
  const hostname = request.headers.get('host') || ''
  
  // ============================================================
  // DETERMINE ENVIRONMENT
  // ============================================================
  const isLocalDev = hostname.includes('localhost') || hostname.includes('127.0.0.1')
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'krenix.store'
  
  // ============================================================
  // LOCAL DEVELOPMENT: Use ?store=slug query param to simulate subdomains
  // Example: http://localhost:3000?store=monbazar
  // ============================================================
  if (isLocalDev) {
    const storeSlug = url.searchParams.get('store')
    if (storeSlug) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-store-slug', storeSlug)
      requestHeaders.set('x-is-store', 'true')
      const response = NextResponse.rewrite(
        new URL(`/store${url.pathname}${url.search}`, request.url),
        { request: { headers: requestHeaders } }
      )
      return response
    }
    
    // Regular platform route in dev
    return await handlePlatformAuth(request, url)
  }
  
  // ============================================================
  // PRODUCTION: Detect subdomains
  // ============================================================
  const isSubdomain =
    hostname !== rootDomain &&
    hostname !== `www.${rootDomain}` &&
    hostname.endsWith(`.${rootDomain}`)

  if (isSubdomain) {
    // Extract store slug from subdomain
    const slug = hostname.replace(`.${rootDomain}`, '')

    // Security: block reserved slugs
    const RESERVED_SLUGS = ['www', 'api', 'admin', 'app', 'dashboard', 'super']
    if (RESERVED_SLUGS.includes(slug)) {
      return NextResponse.redirect(new URL('/', `https://${rootDomain}`))
    }

    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-store-slug', slug)
    requestHeaders.set('x-is-store', 'true')
    const response = NextResponse.rewrite(
      new URL(`/store${url.pathname}${url.search}`, request.url),
      { request: { headers: requestHeaders } }
    )
    return response
  }

  // ============================================================
  // CUSTOM DOMAINS (Growth+): any other hostname → look up the store that
  // verified this domain and serve its storefront.
  // ============================================================
  const isForeignHost = hostname !== rootDomain && hostname !== `www.${rootDomain}`
  if (isForeignHost) {
    const slug = await lookupCustomDomainSlug(hostname)
    if (slug) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-store-slug', slug)
      requestHeaders.set('x-is-store', 'true')
      return NextResponse.rewrite(
        new URL(`/store${url.pathname}${url.search}`, request.url),
        { request: { headers: requestHeaders } }
      )
    }
    // Unknown host — fall through to the platform.
  }

  // ============================================================
  // MAIN PLATFORM: Handle auth protection
  // ============================================================
  return await handlePlatformAuth(request, url)
}

// ============================================================
// CUSTOM DOMAIN LOOKUP
// Direct Supabase REST call (service role, server-side only) — RLS blocks
// anonymous reads on stores, and middleware has no user session for
// storefront visitors. Fails open (returns null) on any error.
// ============================================================
async function lookupCustomDomainSlug(hostname: string): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null

  // Match the exact host, plus the www./bare twin so both resolve.
  const twin = hostname.startsWith('www.') ? hostname.slice(4) : `www.${hostname}`
  const domains = [hostname, twin].map(d => `"${d}"`).join(',')

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/stores?custom_domain=in.(${domains})&custom_domain_verified=eq.true&is_suspended=eq.false&subscription_status=eq.active&select=slug&limit=1`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return null
    const rows = (await res.json()) as Array<{ slug?: string }>
    return rows[0]?.slug ?? null
  } catch {
    return null
  }
}

// ============================================================
// AUTH PROTECTION for platform routes
// ============================================================
async function handlePlatformAuth(request: NextRequest, url: URL) {
  const pathname = url.pathname
  
  // Public routes — no auth needed
  const PUBLIC_ROUTES = ['/', '/pricing', '/demo', '/auth/login', '/auth/register', '/auth/forgot-password', '/auth/callback']
  const isPublicRoute = PUBLIC_ROUTES.some(route => pathname === route) || pathname.startsWith('/auth/')
  const isApiRoute = pathname.startsWith('/api')
  
  if (isPublicRoute || isApiRoute) {
    return NextResponse.next()
  }
  
  // Check if user is authenticated.
  // Forward the current pathname as a header so server components (e.g. the
  // super-admin layout's defense-in-depth 2FA gate) can read it — Next.js does
  // not expose the pathname to server components otherwise.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Not logged in — redirect to login
  if (!user) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  // Super admin protection
  if (pathname.startsWith('/super-admin')) {
    const { data: superAdmin } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!superAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 2FA gate: every super-admin page EXCEPT the security page requires AAL2 (a
    // verified TOTP factor challenged this session), OR a valid backup session cookie.
    if (pathname !== '/super-admin/security') {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel !== 'aal2') {
        const backupCookie = request.cookies.get('sa_backup_session')?.value
        const isBackupValid = await verifyBackupSessionEdge(backupCookie, user.id)
        if (!isBackupValid) {
          const secUrl = new URL('/super-admin/security', request.url)
          secUrl.searchParams.set('redirect', pathname)
          return NextResponse.redirect(secUrl)
        }
      }
    }
  }
  
  // Onboarding + activation protection — redirect to onboarding/payment if not done.
  // order+limit+maybeSingle (not .single()) so Agency owners with 2+ stores don't
  // error out here — checked against their earliest (primary) store.
  if (pathname.startsWith('/dashboard') || pathname === '/activate') {
    const { data: store } = await supabase
      .from('stores')
      .select('id, is_onboarded, subscription_status, subscriptions(status, expires_at)')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!store) {
      return NextResponse.redirect(new URL('/onboarding/step-1', request.url))
    }

    if (!store.is_onboarded) {
      return NextResponse.redirect(new URL('/onboarding/step-1', request.url))
    }

    // Read-time expiry backstop: the nightly cron is the primary mechanism, but
    // if it fails the store must still lose access the moment its period ends —
    // never let a lapsed plan keep working just because a job didn't run.
    const hasAccess = store.subscription_status === 'active' && !isStoreAccessExpired(store, store.subscriptions)

    // Unpaid or lapsed accounts are locked out of the dashboard until payment is
    // confirmed by the super admin.
    if (pathname.startsWith('/dashboard') && !hasAccess) {
      return NextResponse.redirect(new URL('/activate', request.url))
    }

    // Already activated? No need to see the paywall again.
    if (pathname === '/activate' && hasAccess) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
  
  return supabaseResponse
}

// ============================================================
// MATCHER CONFIG
// Apply middleware to all routes except static files
// ============================================================
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

// ============================================================
// EDGE COMPATIBLE BACKUP SESSION VERIFICATION
// ============================================================
async function verifyBackupSessionEdge(cookieValue: string | null | undefined, userId: string): Promise<boolean> {
  const s = process.env.SUPERADMIN_STEPUP_SECRET
  if (!cookieValue || !s) return false
  const [expiryStr, sig] = cookieValue.split('.')
  if (!expiryStr || !sig) return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false

  try {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
    )
    const expectedSigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(`backup.${userId}.${expiry}`))
    const expectedSigArray = Array.from(new Uint8Array(expectedSigBuffer))
    const expectedSig = expectedSigArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // Constant-time compare — edge runtime has no timingSafeEqual, so hand-roll one.
    if (sig.length !== expectedSig.length) return false
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    return diff === 0
  } catch {
    return false
  }
}

