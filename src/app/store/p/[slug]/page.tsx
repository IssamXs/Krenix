import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ThemedLanding from '@/components/store/ThemedLanding'

export const revalidate = 0

export default async function LandingPageView({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ store?: string }>
}) {
  const { slug } = await params
  const resolvedSearch = await searchParams
  const headersList = await headers()

  const storeSlug = headersList.get('x-store-slug') || resolvedSearch.store
  if (!storeSlug) notFound()

  const supabase = createAdminClient()

  const { data: store } = await supabase
    .from('stores')
    .select('*, theme:themes(*)')
    .eq('slug', storeSlug)
    .eq('is_suspended', false)
    .single()

  if (!store) notFound()

  const { data: landingPage } = await supabase
    .from('landing_pages')
    .select('*, product:products(*)')
    .eq('slug', slug)
    .eq('store_id', store.id)
    .eq('is_active', true)
    .single()

  if (!landingPage) notFound()

  supabase.from('landing_pages').update({ views: (landingPage.views ?? 0) + 1 }).eq('id', landingPage.id)

  // When the page is backed by a Product, that Product owns the stock — surface
  // its count so the inventory gate (rupture de stock / badge) is the single truth.
  const view =
    landingPage.product_id && landingPage.product
      ? { ...landingPage, stock: landingPage.product.stock }
      : landingPage

  return <ThemedLanding landingPage={view} store={store} />
}
