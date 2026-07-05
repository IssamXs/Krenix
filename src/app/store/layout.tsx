import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import ChatbotWidget from '@/components/chatbot/ChatbotWidget'
import GtmScripts from '@/components/store/GtmScripts'
import { ULTIMATE_PLANS, type Plan, type Store } from '@/types/database'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const storeSlug = headersList.get('x-store-slug')

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

    // GTM (Facebook/TikTok Pixel etc.) — Ultimate+ only
    const gtmId: string | undefined =
      store && ULTIMATE_PLANS.includes(store.plan as Plan) ? store.settings?.gtmId : undefined

    return (
      <>
        {gtmId && <GtmScripts gtmId={gtmId} />}
        {children}
        {isChatbotEnabled && store && (
          <ChatbotWidget store={store as Store} />
        )}
      </>
    )
  }

  return <>{children}</>
}
