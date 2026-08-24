import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import { getCachedStoreBySlug } from '@/lib/cache/store-cache'
import { isStoreAccessExpired } from '@/lib/plan-expiry'
import StandaloneProductView from '@/components/store/StandaloneProductView'
import type { Store, Product } from '@/types/database'

export const revalidate = 0

export default async function StoreProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ store?: string }>
}) {
  const resolvedParams = await searchParams
  const resolvedIdParams = await params
  const headersList = await headers()

  const slug = headersList.get('x-store-slug') || resolvedParams.store
  const productId = resolvedIdParams.id

  if (!slug || !productId) {
    notFound()
  }

  const supabase = createAdminClient()
  const store = await getCachedStoreBySlug(slug)

  if (!store) notFound()

  if (isStoreAccessExpired(store, store.subscriptions)) notFound()

  const { data: product } = await supabase
    .from('products')
    .select('*')
    .eq('id', productId)
    .eq('store_id', store.id)
    .eq('is_active', true)
    .gt('stock', 0)
    .single()

  if (!product) notFound()

  const { data: relatedRows } = product.category_id
    ? await supabase
        .from('products')
        .select('id, name, price, images, category_id')
        .eq('store_id', store.id)
        .eq('category_id', product.category_id)
        .eq('is_active', true)
        .gt('stock', 0)
        .neq('id', product.id)
        .limit(8)
    : { data: [] }

  return (
    <StandaloneProductView
      product={product as Product}
      store={store as Store}
      relatedProducts={(relatedRows ?? []) as Product[]}
    />
  )
}
