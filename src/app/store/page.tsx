import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Store, Product, LandingPage } from '@/types/database'
import ThemedStoreHome from '@/components/store/ThemedStoreHome'
import { isStoreAccessExpired } from '@/lib/plan-expiry'
import { notFound } from 'next/navigation'
import { getCachedStoreBySlug } from '@/lib/cache/store-cache'

// Store+theme is now served from a short-TTL, tag-invalidated cache (see
// lib/cache/store-cache.ts) instead of hitting the DB on every single
// storefront visit. Products (with live stock) are still fetched fresh below.
export const revalidate = 0

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>
}) {
  const resolvedParams = await searchParams
  const headersList = await headers()

  const slug = headersList.get('x-store-slug') || resolvedParams.store

  if (!slug) {
    notFound()
  }

  const supabase = createAdminClient()

  const store = await getCachedStoreBySlug(slug)

  if (!store) notFound()

  // Backstop for the nightly expiry cron: a lapsed store's shop goes dark
  // immediately, even if the job hasn't flipped its status yet.
  if (isStoreAccessExpired(store, store.subscriptions)) notFound()

  const [{ data: products }, { data: landingPages }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .gt('stock', 0)
      .order('position', { ascending: true }),
    supabase
      .from('landing_pages')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  const allLandingPages = (landingPages ?? []) as LandingPage[]

  // Products that back a published landing page → the storefront card opens that
  // high-converting page instead of the plain order modal.
  const landingByProduct: Record<string, string> = {}
  for (const lp of allLandingPages) {
    if (lp.product_id) landingByProduct[lp.product_id] = lp.slug
  }

  // Consolidated storefront: a linked page is represented by its product card,
  // so drop it from the "Offres spéciales" strip to avoid showing it twice.
  const offers = allLandingPages.filter(lp => !lp.product_id)

  return (
    <ThemedStoreHome
      store={store as Store}
      products={(products ?? []) as Product[]}
      landingPages={offers}
      landingByProduct={landingByProduct}
    />
  )
}
