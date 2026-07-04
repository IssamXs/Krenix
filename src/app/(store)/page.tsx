import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Store, Product, LandingPage } from '@/types/database'
import ThemedStoreHome from '@/components/store/ThemedStoreHome'
import { notFound } from 'next/navigation'

export const revalidate = 60

export default async function StorePage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>
}) {
  const resolvedParams = await searchParams
  const headersList = await headers()

  const slug = headersList.get('x-store-slug') || resolvedParams.store
  if (!slug) notFound()

  const supabase = await createClient()

  const { data: store } = await supabase
    .from('stores')
    .select('*, theme:themes(*)')
    .eq('slug', slug)
    .eq('is_suspended', false)
    .single()

  if (!store) notFound()

  const [{ data: products }, { data: landingPages }] = await Promise.all([
    supabase.from('products').select('*').eq('store_id', store.id).eq('is_active', true).gt('stock', 0).order('created_at', { ascending: false }),
    supabase.from('landing_pages').select('*').eq('store_id', store.id).eq('is_active', true).order('created_at', { ascending: false }).limit(6),
  ])

  return (
    <ThemedStoreHome
      store={store as Store}
      products={(products ?? []) as Product[]}
      landingPages={(landingPages ?? []) as LandingPage[]}
    />
  )
}
