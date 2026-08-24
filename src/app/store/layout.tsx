import { headers } from 'next/headers'
import ChatbotWidget from '@/components/chatbot/LazyChatbotWidget'
import GtmScripts from '@/components/store/GtmScripts'
import PixelScripts from '@/components/store/PixelScripts'
import { type Store } from '@/types/database'
import type { Metadata } from 'next'
import { getCachedStoreBySlug } from '@/lib/cache/store-cache'
import { CartProvider } from '@/components/store/cart/CartProvider'
import CartWidget from '@/components/store/cart/CartWidget'

// Storefront pages otherwise fall back to the platform's own <title> ("Krenix —
// Créez votre boutique en ligne"), which is confusing for a customer (or a
// prospect being shown a demo store) — the browser tab should show the store's
// own name.
export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers()
  const storeSlug = headersList.get('x-store-slug')
  if (!storeSlug) return {}

  // Same cached lookup the layout body and the page below use — avoids a
  // second (and previously a third) uncached round-trip for the same row on
  // every single storefront request.
  const store = await getCachedStoreBySlug(storeSlug)

  if (!store) return {}
  return { title: store.name }
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const storeSlug = headersList.get('x-store-slug')

  if (storeSlug) {
    const store = await getCachedStoreBySlug(storeSlug)

    const planAllowsChatbot = store && (store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0)
    const isChatbotEnabled = planAllowsChatbot && store.settings?.chatbot?.enabled !== false

    // GTM (Facebook/TikTok Pixel etc.) — available on every plan, Basic included.
    const gtmId: string | undefined = store?.settings?.gtmId
    // Direct pixel ids — alternative to GTM, also available on every plan.
    const metaPixelId: string | undefined = store?.settings?.metaPixelId
    const tiktokPixelId: string | undefined = store?.settings?.tiktokPixelId

    return (
      <CartProvider storeSlug={store?.slug ?? storeSlug}>
        {gtmId && <GtmScripts gtmId={gtmId} />}
        {(metaPixelId || tiktokPixelId) && <PixelScripts metaPixelId={metaPixelId} tiktokPixelId={tiktokPixelId} />}
        {children}
        {store && <CartWidget store={store as Store} />}
        {isChatbotEnabled && store && (
          <ChatbotWidget store={store as Store} />
        )}
      </CartProvider>
    )
  }

  return <>{children}</>
}
