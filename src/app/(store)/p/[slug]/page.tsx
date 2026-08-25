import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ThemedLanding from '@/components/store/ThemedLanding'
import type { Product } from '@/types/database'

export const revalidate = 60

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

  const supabase = await createClient()

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

  // Related products: other active landing pages in the same category, same
  // store, excluding this product. Uncategorized products (or a category with
  // no siblings) simply render no section — see RelatedProducts.
  const { data: relatedRows } = landingPage.product?.category_id
    ? await supabase
        .from('landing_pages')
        .select('slug, product:products!inner(*)')
        .eq('store_id', store.id)
        .eq('is_active', true)
        .eq('product.category_id', landingPage.product.category_id)
        .neq('product_id', landingPage.product.id)
        .limit(8)
    : { data: [] }

  const relatedProducts = (relatedRows ?? []).map(row => ({
    ...(row.product as unknown as Product),
    landing_page_slug: row.slug as string,
  }))

  // Increment view count (fire and forget)
  supabase.from('landing_pages').update({ views: (landingPage.views ?? 0) + 1 }).eq('id', landingPage.id)

  return <ThemedLanding landingPage={landingPage} store={store} relatedProducts={relatedProducts} />
}
