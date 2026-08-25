import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { getCachedStoreBySlug, getCachedSitePageBySlug } from '@/lib/cache/store-cache'
import BlockRenderer from '@/components/site-builder/BlockRenderer'
import type { Metadata } from 'next'
import type { SiteBlockNode, Store } from '@/types/database'

export const revalidate = 0

async function resolve(params: Promise<{ slug: string }>, searchParams: Promise<{ store?: string }>) {
  const { slug } = await params
  const resolvedSearch = await searchParams
  // Local dev has no real subdomain, so middleware simulates one via ?store=
  // and sets this header — but hitting the route directly (no middleware
  // rewrite in front, e.g. testing with curl or a bare query string) needs
  // the same fallback the sibling /store/p/[slug] route already has.
  const storeSlug = (await headers()).get('x-store-slug') || resolvedSearch.store
  if (!storeSlug) return null
  const store = await getCachedStoreBySlug(storeSlug)
  if (!store) return null
  const page = await getCachedSitePageBySlug(store.id, slug)
  if (!page) return null
  return { store, page }
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ store?: string }> }): Promise<Metadata> {
  const resolved = await resolve(params, searchParams)
  if (!resolved) return {}
  return {
    title: resolved.page.meta_title || resolved.page.title,
    description: resolved.page.meta_description || undefined,
  }
}

export default async function SitePageView({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ store?: string }> }) {
  const resolved = await resolve(params, searchParams)
  if (!resolved) notFound()
  const { store, page } = resolved

  return (
    <div style={{ minHeight: '100vh' }}>
      <BlockRenderer blocks={(page.published_blocks ?? []) as SiteBlockNode[]} store={store as Store} />
    </div>
  )
}
