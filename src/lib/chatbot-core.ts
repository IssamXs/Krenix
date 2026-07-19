import { createAdminClient } from '@/lib/supabase/admin'
import { sendChatbotMessage, extractOrder, ORDER_READY_PREFIX } from '@/lib/gemini'
import { postOrderToSheet } from '@/lib/sheets'
import { resolveAccountStore } from '@/lib/server-store'
import { ULTIMATE_PLANS, type ChatMessage, type ChannelSource, type Plan } from '@/types/database'

export interface InboundResult {
  reply: string
  orderId: string | null
  blocked: boolean // limit reached or chatbot disabled: caller may skip sending
}

// Chatbot access must gate on the account's CURRENT entitlement
// (subscription_status), not just the historical `plan` value. `stores.plan` is
// deliberately left at its last-held tier after a cancellation or cron expiry
// (the /activate reactivation flow reads it to offer "renew your previous
// plan"), so checking plan membership alone would leave an Ultimate+ store's
// chatbot live forever after the subscription lapses or is cancelled.
export function hasChatbotAccess(account: { subscriptionActive: boolean; plan: Plan; dailyLimit: number }): boolean {
  if (!account.subscriptionActive) return false
  return ULTIMATE_PLANS.includes(account.plan) || account.dailyLimit > 0
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
    .select('id, owner_id, name, plan, subscription_status, chatbot_daily_limit, settings, is_suspended')
    .eq('id', storeId)
    .single()

  if (!store || store.is_suspended) {
    return { reply: 'Boutique indisponible.', orderId: null, blocked: true }
  }

  // The chatbot allowance is a shared account pool: plan + daily limit + usage all
  // live on the owner's primary store, so every boutique draws from one counter.
  const account = await resolveAccountStore(admin, store.owner_id, 'id, plan, subscription_status, chatbot_daily_limit, purchased_chatbot')
  const accountPlan = (account?.plan ?? store.plan) as Plan
  const accountActive = (account?.subscription_status ?? store.subscription_status) === 'active'
  const accountLimit = account?.chatbot_daily_limit ?? store.chatbot_daily_limit ?? 0
  const usageStoreId = account?.id ?? storeId
  const purchasedMsgs = account?.purchased_chatbot ?? 0

  const hasChatbot = hasChatbotAccess({ subscriptionActive: accountActive, plan: accountPlan, dailyLimit: accountLimit })
  if (!hasChatbot || store.settings?.chatbot?.enabled === false) {
    return {
      reply: 'Le chatbot est momentanément indisponible. Contactez-nous directement. 🙏',
      orderId: null,
      blocked: true,
    }
  }

  // Daily limit (shared across all channels AND all of the owner's stores)
  const today = new Date().toISOString().slice(0, 10)
  const { data: usage } = await admin
    .from('chatbot_daily_usage')
    .select('id, message_count')
    .eq('store_id', usageStoreId)
    .eq('date', today)
    .single()

  const dailyLimit = accountLimit > 0 ? accountLimit : 150
  const currentCount = usage?.message_count ?? 0
  // Beyond the daily allowance, fall back to any purchased top-up messages.
  const overDaily = currentCount >= dailyLimit
  if (overDaily && purchasedMsgs <= 0) {
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

  // Fetch an enabled Yalidine integration once — used both to tell the bot that
  // delivery is courier-computed, and to price the order below.
  const { data: yalidine } = await admin
    .from('delivery_integrations')
    .select('api_id, api_token, from_wilaya, enabled')
    .eq('store_id', storeId)
    .eq('provider', 'yalidine')
    .maybeSingle()
  const hasYalidine = !!(yalidine && yalidine.enabled && yalidine.from_wilaya)

  const reply = await sendChatbotMessage({
    storeName: store.name,
    products: products ?? [],
    storeSettings: {
      deliveryPrice: store.settings?.deliveryPrice,
      deliveryRates: store.settings?.deliveryRates ?? null,
      deliveryCourier: hasYalidine ? 'Yalidine' : null,
      welcomeMessage: store.settings?.welcomeMessage,
      tone: store.settings?.chatbot?.tone,
      instructions: store.settings?.chatbot?.instructions,
    },
    conversationHistory: history,
    userMessage: text,
  })

  // Increment shared daily counter
  if (overDaily) {
    // Consumed one purchased top-up message (daily allowance already exhausted).
    await admin.from('stores').update({ purchased_chatbot: purchasedMsgs - 1 }).eq('id', usageStoreId)
  } else if (usage) {
    await admin.from('chatbot_daily_usage').update({ message_count: currentCount + 1 }).eq('id', usage.id)
  } else {
    await admin.from('chatbot_daily_usage').insert({ store_id: usageStoreId, date: today, message_count: 1 })
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
    // Duplicate guard: if an identical order (same phone + product + quantity)
    // was created for this store in the last 10 minutes, reuse it instead of
    // inserting a second row. Protects against the model re-emitting ORDER_READY
    // on a follow-up turn and against Meta redelivering the same webhook event.
    const { data: recentDup } = await admin
      .from('orders')
      .select('id')
      .eq('store_id', storeId)
      .eq('customer_phone', orderData.customer_phone)
      .eq('product_id', orderData.product_id)
      .eq('quantity', orderData.quantity)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .limit(1)
      .maybeSingle()

    if (recentDup) {
      orderId = recentDup.id
    } else {
      let deliveryPrice = Number(store.settings?.deliveryPrice ?? 0)
      if (orderData.wilaya) {
        if (hasYalidine && yalidine) {
          try {
            const { decryptToken } = await import('@/lib/crypto')
            const { getYalidineFees } = await import('@/lib/yalidine')
            const { wilayaId } = await import('@/lib/wilayas')
            const fromId = wilayaId(yalidine.from_wilaya)
            const toId = wilayaId(orderData.wilaya)
            if (fromId && toId) {
              const creds = { apiId: decryptToken(yalidine.api_id), apiToken: decryptToken(yalidine.api_token) }
              const fees = await getYalidineFees(creds, fromId, toId)
              const validFees = fees?.communes.map(c => c.home).filter(f => f !== null) as number[]
              if (validFees && validFees.length > 0) {
                deliveryPrice = Math.round(validFees.reduce((a, b) => a + b, 0) / validFees.length)
              }
            }
          } catch (err) {
            console.error('Erreur récupération tarif Yalidine chatbot:', err)
          }
        } else if (store.settings?.deliveryRates && store.settings.deliveryRates[orderData.wilaya] !== undefined) {
          deliveryPrice = store.settings.deliveryRates[orderData.wilaya]
        } else if (store.settings?.deliveryRates?.default !== undefined) {
          deliveryPrice = store.settings.deliveryRates.default
        }
      }

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
      }).select('id, order_number').single()
      orderId = newOrder?.id ?? null

    // Sync the new order to the store's Google Sheet (if configured).
    if (newOrder && store.settings?.sheetsWebhookUrl) {
      void postOrderToSheet(store.settings.sheetsWebhookUrl, {
        order_number: newOrder.order_number,
        name: orderData.customer_name,
        phone: orderData.customer_phone,
        wilaya: orderData.wilaya,
        commune: orderData.commune,
        product: orderData.product_name,
        quantity: orderData.quantity,
        total,
        status: 'pending',
        source: channel,
        date: new Date().toISOString(),
      })
      }
    }
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
