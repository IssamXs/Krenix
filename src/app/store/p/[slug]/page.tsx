import { headers, cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import ThemedLanding from '@/components/store/ThemedLanding'
import SetVariantCookie from '@/components/store/SetVariantCookie'
import ViewContentTracker from '@/components/store/ViewContentTracker'
import { getCachedStoreBySlug, getCachedLandingPageBySlug } from '@/lib/cache/store-cache'

// Store+theme and landing-page content are served from a short-TTL,
// tag-invalidated cache (see lib/cache/store-cache.ts) — this route is by
// far the highest-traffic read in the platform (every ad click lands here).
// Product stock is still fetched fresh below; it must never be stale.
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

  const store = await getCachedStoreBySlug(storeSlug)

  if (!store) notFound()

  const cachedLandingPage = await getCachedLandingPageBySlug(store.id, slug)
  if (!cachedLandingPage) notFound()

  // Product (price/name/stock) fetched live and merged in — cached above is
  // page content only, which must never carry a stale stock count.
  const product = cachedLandingPage.product_id
    ? (await supabase.from('products').select('*').eq('id', cachedLandingPage.product_id).single()).data
    : null
  const landingPage = { ...cachedLandingPage, product }

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

  // Meta/TikTok mid-funnel signal — visitor viewed a specific product page.
  // Falls back to the landing page's own title/price when there's no linked
  // Product, so pixel data is still populated for AI-generated LP-only items.
  const pixelId = landingPage.product_id ?? landingPage.id
  const pixelName = landingPage.product?.name ?? landingPage.title
  const pixelPrice = landingPage.product?.price ?? (activeContent as { _meta?: { price?: number } })?._meta?.price ?? 0

  return (
    <>
      {abActive && <SetVariantCookie pageId={landingPage.id} variant={variant} />}
      <ViewContentTracker productId={pixelId} productName={pixelName} price={pixelPrice} storeId={store.id} />
      <ThemedLanding landingPage={view} store={store} />
    </>
  )
}
