import type { SupabaseClient } from '@supabase/supabase-js'
import type { LandingPage } from '@/types/database'

// Slugify a product name → url-safe slug (matches the style used elsewhere).
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

/**
 * Ensure a landing page is backed by a Product row.
 *
 * When a store owner publishes a landing page we materialise a Product from the
 * page's own data so it shows up in the "Produits" dashboard and on the store
 * grid, and — crucially — so a single Product row owns the stock count.
 *
 * Returns the product id (existing if already linked, otherwise newly created),
 * or null if creation failed.
 */
export async function ensureLandingPageProduct(
  supabase: SupabaseClient,
  page: Pick<LandingPage, 'id' | 'product_id' | 'title' | 'content' | 'stock' | 'generated_images'>,
  storeId: string,
): Promise<string | null> {
  if (page.product_id) return page.product_id

  const meta = page.content?._meta
  const name = (meta?.productName || page.title || 'Produit').trim()
  const price = Number(meta?.price ?? 0) || 0

  // Collect any product imagery we already have, de-duplicated.
  const images = Array.from(
    new Set(
      [
        meta?.imageUrl,
        page.content?.hero?.background_image,
        ...(page.generated_images ?? []),
      ].filter(Boolean) as string[],
    ),
  )

  const description =
    page.content?.product_details?.sections?.[0]?.content ||
    page.content?.hero?.subheadline ||
    null

  // Product owns the stock. Landing form enforces stock >= 1, so this is set in
  // practice; legacy untracked pages (null) fall back to 0.
  const stock = page.stock == null ? 0 : Math.max(0, Math.floor(page.stock))

  const slug = `${slugify(name) || 'produit'}-${Date.now().toString(36)}`

  const { data: product, error } = await supabase
    .from('products')
    .insert({
      store_id: storeId,
      name,
      slug,
      description,
      price,
      images,
      colors: [],
      sizes: [],
      stock,
      is_active: true,
    })
    .select('id')
    .single()

  if (error || !product) return null
  return product.id as string
}
