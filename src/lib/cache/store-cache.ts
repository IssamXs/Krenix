import { unstable_cache, revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Store } from '@/types/database'

// ============================================================
// Storefront read cache — the two highest-traffic reads on the whole
// platform (every visit to every merchant's store homepage AND every
// landing page looks up the store+theme, and every landing page view
// looks up the page content). Previously both routes ran with
// `revalidate = 0` (fully dynamic, DB hit on every single request).
//
// Deliberately NOT cached here: stock counts and anything order/inventory
// related — those must always be read live. Callers fetch stock separately.
//
// Tag granularity: `unstable_cache`'s `tags` option is fixed per function
// definition, not per call — it cannot vary per slug. So invalidation here is
// one tag per RESOURCE KIND ('store-by-slug' / 'landing-page-by-slug'), not
// per individual store — any store's settings/theme/plan change busts the
// cached read for every store, not just the one that changed. At Krenix's
// current scale that's a cheap, self-correcting cost (the next request per
// store just re-populates the cache), and it's strictly safer than the
// per-slug-tag alternative silently no-op'ing if ever wired wrong. A true
// per-slug cache (Redis, or Next's newer `cacheTag()` inside `"use cache"`)
// is the natural upgrade if this coarseness ever becomes a real hot spot.
//
// Safety net: every cache entry also carries a short TTL (in addition to
// tag-based invalidation) so any mutation site that's missed self-heals
// within minutes rather than staying stale indefinitely.
// ============================================================

const STORE_TTL_SECONDS = 90
const LANDING_PAGE_TTL_SECONDS = 60
const SITE_PAGE_TTL_SECONDS = 60

const STORE_TAG = 'store-by-slug'
const LANDING_PAGE_TAG = 'landing-page-by-slug'
const SITE_PAGE_TAG = 'site-page-by-slug'

/** Store + theme + subscription, keyed by slug. Excludes anything stock/order-related. */
export const getCachedStoreBySlug = unstable_cache(
  async (slug: string) => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('stores')
      .select('*, theme:themes(*), subscriptions(status, expires_at)')
      .eq('slug', slug)
      .eq('is_suspended', false)
      .eq('subscription_status', 'active')
      .single()
    return data as (Store & { subscriptions: { status: string; expires_at: string | null }[] | null }) | null
  },
  ['store-by-slug'],
  { revalidate: STORE_TTL_SECONDS, tags: [STORE_TAG] },
)

/** Landing page content (no product join — stock must stay live), keyed by store id + slug. */
export const getCachedLandingPageBySlug = unstable_cache(
  async (storeId: string, slug: string) => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('landing_pages')
      .select('id, slug, title, content, content_b, is_active, product_id, views, views_b, stock, generated_images, upsell_enabled, upsell_product_name, upsell_text, upsell_price, store_id, theme_id, orders_count, created_at, updated_at')
      .eq('slug', slug)
      .eq('store_id', storeId)
      .eq('is_active', true)
      .single()
    return data
  },
  ['landing-page-by-slug'],
  { revalidate: LANDING_PAGE_TTL_SECONDS, tags: [LANDING_PAGE_TAG] },
)

/** Published custom page content, keyed by store id + slug. */
export const getCachedSitePageBySlug = unstable_cache(
  async (storeId: string, slug: string) => {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('site_pages')
      .select('id, title, slug, published_blocks, meta_title, meta_description, store_id, status')
      .eq('slug', slug)
      .eq('store_id', storeId)
      .eq('status', 'published')
      .single()
    return data
  },
  ['site-page-by-slug'],
  { revalidate: SITE_PAGE_TTL_SECONDS, tags: [SITE_PAGE_TAG] },
)

/** Call after any mutation to a store's settings/theme/plan/suspension. */
export function revalidateStoreCache() {
  // Second arg is Next's newer cache-profile parameter — 'max' per their own
  // deprecation guidance for callers not using the "use cache" profile system.
  revalidateTag(STORE_TAG, 'max')
}

/** Call after any mutation to a landing page's content/publish state/photos. */
export function revalidateLandingPageCache() {
  revalidateTag(LANDING_PAGE_TAG, 'max')
}

/** Call after any mutation to a site page's blocks/publish state/slug. */
export function revalidateSitePageCache() {
  revalidateTag(SITE_PAGE_TAG, 'max')
}
