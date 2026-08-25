import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import ChatbotWidget from '@/components/chatbot/LazyChatbotWidget'
import GtmScripts from '@/components/store/GtmScripts'
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

    const locale = store ? getStoreLocale(store as Store) : 'fr'

    return (
      <CartProvider storeSlug={store?.slug ?? storeSlug}>
        <StoreHtmlDir locale={locale} />
        {gtmId && <GtmScripts gtmId={gtmId} />}
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
