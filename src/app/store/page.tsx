import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Store, Product, LandingPage } from '@/types/database'
import ThemedStoreHome from '@/components/store/ThemedStoreHome'
import { notFound } from 'next/navigation'

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

  const { data: store } = await supabase
    .from('stores')
    .select('*, theme:themes(*)')
    .eq('slug', slug)
    .eq('is_suspended', false)
    .eq('subscription_status', 'active')
    .single()

  if (!store) notFound()

  const [{ data: products }, { data: landingPages }] = await Promise.all([
    supabase
      .from('products')
      .select('*')
      .eq('store_id', store.id)
      .eq('is_active', true)
      .gt('stock', 0)
      .order('created_at', { ascending: false }),
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
