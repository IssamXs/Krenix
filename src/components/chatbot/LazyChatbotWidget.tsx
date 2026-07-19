'use client'

import dynamic from 'next/dynamic'
import type { Store } from '@/types/database'

// The chatbot is a closed bubble until a visitor clicks it, but it was being
// bundled into the first load of every storefront page. Split it out so its JS
// is fetched on demand instead of competing with the product images and hero.
//
// ssr:false is deliberate — the widget renders nothing meaningful server-side
// (it's gated behind open state), so there's no markup worth pre-rendering.
const ChatbotWidget = dynamic(() => import('./ChatbotWidget'), {
  ssr: false,
  loading: () => null,
})

export default function LazyChatbotWidget({ store }: { store: Store }) {
  return <ChatbotWidget store={store} />
}
