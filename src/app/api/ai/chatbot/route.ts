import { NextResponse } from 'next/server'
import { handleInboundMessage } from '@/lib/chatbot-core'
import type { ChatMessage } from '@/types/database'

export async function POST(request: Request) {
  try {
    const { storeId, sessionId, message, history } = await request.json()
    if (!storeId || !sessionId || !message) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
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
