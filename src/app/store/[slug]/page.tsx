import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCachedStoreBySlug, getCachedSitePageBySlug } from '@/lib/cache/store-cache'
import BlockRenderer from '@/components/site-builder/BlockRenderer'
import type { Metadata } from 'next'
import type { SiteBlockNode, Store } from '@/types/database'

export const revalidate = 0

async function resolve(params: Promise<{ slug: string }>) {
  const { slug } = await params
  const storeSlug = (await headers()).get('x-store-slug')
  if (!storeSlug) return null
  const store = await getCachedStoreBySlug(storeSlug)
  if (!store) return null
  const page = await getCachedSitePageBySlug(store.id, slug)
  if (!page) return null
  return { store, page }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const resolved = await resolve(params)
  if (!resolved) return {}
  return {
    title: resolved.page.meta_title || resolved.page.title,
    description: resolved.page.meta_description || undefined,
  }
}

export default async function SitePageView({ params }: { params: Promise<{ slug: string }> }) {
  const resolved = await resolve(params)
  if (!resolved) notFound()
  const { store, page } = resolved

  return (
    <div style={{ minHeight: '100vh' }}>
      <BlockRenderer blocks={(page.published_blocks ?? []) as SiteBlockNode[]} store={store as Store} />
    </div>
  )
}
