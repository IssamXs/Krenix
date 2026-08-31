import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import ChatbotWidget from '@/components/chatbot/LazyChatbotWidget'
import GtmScripts from '@/components/store/GtmScripts'
import PixelScripts from '@/components/store/PixelScripts'
import StoreHtmlDir from '@/components/store/StoreHtmlDir'
import { getStoreLocale } from '@/lib/i18n/store'
import { type Store } from '@/types/database'
import { CartProvider } from '@/components/store/cart/CartProvider'
import CartWidget from '@/components/store/cart/CartWidget'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const storeSlug = headersList.get('x-store-slug')

  // Only load chatbot if we have a store slug
  if (storeSlug) {
    const supabase = await createClient()
    const { data: store } = await supabase
      .from('stores')
      .select('*, theme:themes(*)')
      .eq('slug', storeSlug)
      .eq('is_suspended', false)
      .single()

    const planAllowsChatbot = store && (store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0)
    const isChatbotEnabled = planAllowsChatbot && store.settings?.chatbot?.enabled !== false

    // GTM (Facebook/TikTok Pixel etc.) — available on every plan, Basic included.
    const gtmId: string | undefined = store?.settings?.gtmId
    // Direct pixel ids — alternative to GTM, also available on every plan.
    const metaPixelId: string | undefined = store?.settings?.metaPixelId
    const tiktokPixelId: string | undefined = store?.settings?.tiktokPixelId

    const locale = store ? getStoreLocale(store as Store) : 'fr'

    return (
      <CartProvider storeSlug={store?.slug ?? storeSlug}>
        <StoreHtmlDir locale={locale} />
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
