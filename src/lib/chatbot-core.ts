import { createAdminClient } from '@/lib/supabase/admin'
import { sendChatbotMessage, extractOrder, ORDER_READY_PREFIX } from '@/lib/gemini'
import type { ChatMessage, ChannelSource } from '@/types/database'

export interface InboundResult {
  reply: string
  orderId: string | null
  blocked: boolean // limit reached or chatbot disabled: caller may skip sending
}

// One entry point for every chatbot surface (web widget, Messenger, Instagram).
export async function handleInboundMessage(args: {
  storeId: string
  sessionKey: string          // 'web:<uuid>' | 'messenger:<PSID>' | 'instagram:<IGSID>'
  text: string
  channel: ChannelSource
  history?: ChatMessage[]      // when omitted, loaded from chatbot_sessions by sessionKey
}): Promise<InboundResult> {
  const { storeId, sessionKey, text, channel } = args
  const admin = createAdminClient()

  const { data: store } = await admin
    .from('stores')
    .select('id, name, plan, chatbot_daily_limit, settings, is_suspended')
    .eq('id', storeId)
    .single()

  if (!store || store.is_suspended) {
    return { reply: 'Boutique indisponible.', orderId: null, blocked: true }
  }

  const hasChatbot = store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0
  if (!hasChatbot || store.settings?.chatbot?.enabled === false) {
    return {
      reply: 'Le chatbot est momentanément indisponible. Contactez-nous directement. 🙏',
      orderId: null,
      blocked: true,
    }
  }

  // Daily limit (shared across all channels via chatbot_daily_usage)
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
    return {
      reply: 'Désolé, la limite de messages quotidiens est atteinte. Revenez demain ou contactez-nous directement. 🙏',
      orderId: null,
      blocked: true,
    }
  }

  // Load history: provided by caller (web) or from the session store (Meta)
  let history: ChatMessage[] = args.history ?? []
  const { data: session } = await admin
    .from('chatbot_sessions')
    .select('id, messages')
    .eq('store_id', storeId)
    .eq('session_id', sessionKey)
    .single()
  if (!args.history && session?.messages) history = session.messages as ChatMessage[]

  const { data: products } = await admin
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .gt('stock', 0)

  const reply = await sendChatbotMessage({
    storeName: store.name,
    products: products ?? [],
    storeSettings: {
      deliveryPrice: store.settings?.deliveryPrice,
      welcomeMessage: store.settings?.welcomeMessage,
      tone: store.settings?.chatbot?.tone,
      instructions: store.settings?.chatbot?.instructions,
    },
    conversationHistory: history,
    userMessage: text,
  })

  // Increment shared daily counter
  if (usage) {
    await admin.from('chatbot_daily_usage').update({ message_count: currentCount + 1 }).eq('id', usage.id)
  } else {
    await admin.from('chatbot_daily_usage').insert({ store_id: storeId, date: today, message_count: 1 })
  }

  const cleanReply = reply.includes(ORDER_READY_PREFIX)
    ? reply.substring(0, reply.indexOf(ORDER_READY_PREFIX)).trim()
    : reply

  // Persist the turn for every channel (web previously only persisted on order;
  // persisting always is required so Meta history survives across webhook calls).
  const turn: ChatMessage[] = [
    ...history,
    { role: 'user', content: text, timestamp: new Date().toISOString() },
    { role: 'assistant', content: cleanReply, timestamp: new Date().toISOString() },
  ]

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
      source: channel,
    }).select('id').single()
    orderId = newOrder?.id ?? null
  }

  if (session) {
    await admin.from('chatbot_sessions').update({
      messages: turn,
      ...(orderId ? { order_id: orderId } : {}),
      ...(orderData ? { customer_phone: orderData.customer_phone } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', session.id)
  } else {
    await admin.from('chatbot_sessions').insert({
      store_id: storeId,
      session_id: sessionKey,
      messages: turn,
      order_id: orderId,
      customer_phone: orderData?.customer_phone ?? null,
    })
  }

  return { reply: cleanReply, orderId, blocked: false }
}
