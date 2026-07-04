// ============================================================
// NOVALUX — Middleware (Subdomain Routing)
// This is the core of multi-tenancy
// Place this at the ROOT of your Next.js project
// ============================================================

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// Routes that only exist on the main platform (novalux.com)
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
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'novalux.com'
  
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
  // MAIN PLATFORM: Handle auth protection
  // ============================================================
  return await handlePlatformAuth(request, url)
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
  
  // Check if user is authenticated
  const supabaseResponse = NextResponse.next({ request })
  
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
      .single()
    
    if (!superAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
  
  // Onboarding protection — redirect to onboarding if not completed
  if (pathname.startsWith('/dashboard')) {
    const { data: store } = await supabase
      .from('stores')
      .select('id, is_onboarded')
      .eq('owner_id', user.id)
      .single()
    
    if (!store) {
      return NextResponse.redirect(new URL('/onboarding/step-1', request.url))
    }
    
    if (!store.is_onboarded && !pathname.startsWith('/onboarding')) {
      return NextResponse.redirect(new URL('/onboarding/step-1', request.url))
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
