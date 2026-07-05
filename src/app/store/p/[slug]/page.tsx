import { headers, cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ThemedLanding from '@/components/store/ThemedLanding'
import SetVariantCookie from '@/components/store/SetVariantCookie'

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
    .eq('subscription_status', 'active')
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

  // A/B testing: when content_b exists, serve A or B 50/50 (sticky via cookie).
  const abActive = !!landingPage.content_b
  let variant: 'A' | 'B' = 'A'
  if (abActive) {
    const existing = (await cookies()).get(`lpv_${landingPage.id}`)?.value
    if (existing === 'A' || existing === 'B') {
      variant = existing
    } else {
      // Per-request 50/50 bucketing (crypto avoids the render-purity lint on Math.random).
      variant = (crypto.getRandomValues(new Uint8Array(1))[0] & 1) === 0 ? 'A' : 'B'
    }
  }

  // Increment the variant's view counter (fire and forget).
  if (variant === 'B') {
    supabase.from('landing_pages').update({ views_b: (landingPage.views_b ?? 0) + 1 }).eq('id', landingPage.id)
  } else {
    supabase.from('landing_pages').update({ views: (landingPage.views ?? 0) + 1 }).eq('id', landingPage.id)
  }

  const activeContent = variant === 'B' && landingPage.content_b ? landingPage.content_b : landingPage.content

  // When the page is backed by a Product, that Product owns the stock — surface
  // its count so the inventory gate (rupture de stock / badge) is the single truth.
  const base =
    landingPage.product_id && landingPage.product
      ? { ...landingPage, stock: landingPage.product.stock }
      : landingPage
  const view = { ...base, content: activeContent }

  return (
    <>
      {abActive && <SetVariantCookie pageId={landingPage.id} variant={variant} />}
      <ThemedLanding landingPage={view} store={store} />
    </>
  )
}
