import { NextResponse } from 'next/server'
import { handleInboundMessage } from '@/lib/chatbot-core'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import type { ChatMessage } from '@/types/database'

export async function POST(request: Request) {
  try {
    const { storeId, sessionId, message, history } = await request.json()
    if (!storeId || !sessionId || !message) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    // Public, unauthenticated endpoint — throttle bursts by IP on top of the
    // existing daily-message quota (which caps volume, not burst rate).
    const allowed = await checkRateLimit(`chatbot:${requestIp(request)}`, 20, 60)
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de messages. Merci de patienter un instant.' }, { status: 429 })
    }

    const { reply, orderId } = await handleInboundMessage({
      storeId,
      sessionKey: `web:${sessionId}`,
      text: message,
      channel: 'chatbot',
      history: (history ?? []) as ChatMessage[],
    })

    return NextResponse.json({ reply, orderId })
  } catch (error) {
    console.error('Chatbot error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
