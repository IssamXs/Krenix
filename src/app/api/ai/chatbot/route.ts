import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendChatbotMessage, extractOrder, ORDER_READY_PREFIX } from '@/lib/gemini'
import type { ChatMessage } from '@/types/database'

export async function POST(request: Request) {
  try {
    const { storeId, sessionId, message, history } = await request.json()
    if (!storeId || !sessionId || !message) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get store + products
    const { data: store } = await admin
      .from('stores')
      .select('id, name, plan, chatbot_daily_limit, settings, is_suspended')
      .eq('id', storeId)
      .single()

    if (!store || store.is_suspended) {
      return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    }

    // Check chatbot is enabled for the plan
    const isUltimate = store.plan === 'ultimate'
    const hasChatbot = isUltimate || (store.chatbot_daily_limit ?? 0) > 0
    if (!hasChatbot) {
      return NextResponse.json({ reply: 'Le chatbot n\'est pas disponible sur ce plan.' }, { status: 200 })
    }

    // Respect the merchant's on/off switch (defensive — the widget also hides when off)
    if (store.settings?.chatbot?.enabled === false) {
      return NextResponse.json({ reply: 'Le chatbot est momentanément indisponible. Contactez-nous directement. 🙏' }, { status: 200 })
    }

    // Check daily limit
    const today = new Date().toISOString().slice(0, 10)
    const { data: usage } = await admin
      .from('chatbot_daily_usage')
      .select('id, message_count')
      .eq('store_id', storeId)
      .eq('date', today)
      .single()

    const dailyLimit = store.chatbot_daily_limit > 0 ? store.chatbot_daily_limit : 150
    const currentCount = usage?.message_count ?? 0

    if (currentCount >= dailyLimit) {
      return NextResponse.json({
        reply: 'Désolé, la limite de messages quotidiens est atteinte. Revenez demain ou contactez-nous directement. 🙏',
      })
    }

    // Get products
    const { data: products } = await admin
      .from('products')
      .select('*')
      .eq('store_id', storeId)
      .eq('is_active', true)
      .gt('stock', 0)

    // Call Gemini
    const conversationHistory: ChatMessage[] = history ?? []
    const reply = await sendChatbotMessage({
      storeName: store.name,
      products: products ?? [],
      storeSettings: {
        deliveryPrice: store.settings?.deliveryPrice,
        welcomeMessage: store.settings?.welcomeMessage,
        tone: store.settings?.chatbot?.tone,
        instructions: store.settings?.chatbot?.instructions,
      },
      conversationHistory,
      userMessage: message,
    })

    // Increment daily usage
    if (usage) {
      await admin.from('chatbot_daily_usage').update({ message_count: currentCount + 1 }).eq('id', usage.id)
    } else {
      await admin.from('chatbot_daily_usage').insert({ store_id: storeId, date: today, message_count: 1 })
    }

    // Check if order is ready
    const orderData = extractOrder(reply)
    let orderId: string | null = null

    if (orderData) {
      const deliveryPrice = Number(store.settings?.deliveryPrice ?? 0)
      const total = orderData.unit_price * orderData.quantity + deliveryPrice

      const { data: newOrder } = await admin.from('orders').insert({
        store_id: storeId,
        product_id: orderData.product_id,
        customer_name: orderData.customer_name,
        customer_phone: orderData.customer_phone,
        wilaya: orderData.wilaya,
        commune: orderData.commune,
        quantity: orderData.quantity,
        color: orderData.color ?? null,
        size: orderData.size ?? null,
        unit_price: orderData.unit_price,
        delivery_price: deliveryPrice,
        total_price: total,
        status: 'pending',
        source: 'chatbot',
      }).select('id').single()

      orderId = newOrder?.id ?? null

      // Save session
      const allMessages: ChatMessage[] = [
        ...conversationHistory,
        { role: 'user', content: message, timestamp: new Date().toISOString() },
        { role: 'assistant', content: reply, timestamp: new Date().toISOString() },
      ]

      const { data: existingSession } = await admin
        .from('chatbot_sessions')
        .select('id')
        .eq('session_id', sessionId)
        .single()

      if (existingSession) {
        await admin.from('chatbot_sessions').update({
          messages: allMessages,
          order_id: orderId,
          customer_phone: orderData.customer_phone,
          updated_at: new Date().toISOString(),
        }).eq('id', existingSession.id)
      } else {
        await admin.from('chatbot_sessions').insert({
          store_id: storeId,
          session_id: sessionId,
          messages: allMessages,
          order_id: orderId,
          customer_phone: orderData.customer_phone,
        })
      }
    }

    // Strip the ORDER_READY prefix from the reply shown to the user
    const cleanReply = reply.includes(ORDER_READY_PREFIX)
      ? reply.substring(0, reply.indexOf(ORDER_READY_PREFIX)).trim()
      : reply

    return NextResponse.json({ reply: cleanReply, orderId })
  } catch (error) {
    console.error('Chatbot error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
