// ============================================================
// Telegram bot — pings the super admin's phone for business events (new store
// signup, payment/top-up awaiting confirmation). Free, no vendor account.
// Platform-owned bot: TELEGRAM_BOT_TOKEN + TELEGRAM_ADMIN_CHAT_ID.
// ============================================================

export function isTelegramConfigured(): boolean {
  return !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_ADMIN_CHAT_ID
}

/** Send a message to the configured admin chat. No-op (returns false) if unconfigured. */
export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (!isTelegramConfigured()) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID,
        text,
        parse_mode: 'HTML',
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_LABELS, ULTIMATE_PLANS, type Plan } from '@/types/database'

// Ping Telegram the moment an ONLINE (auto-confirmed via webhook/return, no
// manual action needed) platform payment lands — subscriptions and top-ups a
// store owner pays Krenix directly, not a store's own customer payments.
// Callers must only call this after confirmAndActivate() returned true, so a
// webhook retry or the webhook/return race never double-notifies.
export async function notifyPlatformPaymentConfirmed(
  admin: ReturnType<typeof createAdminClient>,
  recordType: 'subscription' | 'credit_purchase' | 'fraud_shield',
  recordId: string,
  storeId: string,
): Promise<void> {
  const { data: store } = await admin.from('stores').select('name, slug').eq('id', storeId).maybeSingle()
  if (!store) return

  if (recordType === 'fraud_shield') {
    const { data: fs } = await admin.from('fraud_shield_purchases').select('amount_dzd').eq('id', recordId).maybeSingle()
    if (!fs) return
    await sendTelegramMessage(
      `✅ <b>Fraud Shield en ligne confirmé</b>\n${store.name} (${store.slug})\nAbonnement 1 mois — ${Number(fs.amount_dzd).toLocaleString('fr-DZ')} DZD\nDétecteur IA activé, aucune action requise.`
    )
    return
  }

  if (recordType === 'subscription') {
    const { data: sub } = await admin.from('subscriptions').select('plan, amount_dzd').eq('id', recordId).maybeSingle()
    if (!sub) return
    await sendTelegramMessage(
      `✅ <b>Paiement en ligne confirmé</b>\n${store.name} (${store.slug})\nPlan ${PLAN_LABELS[sub.plan as Plan]} — ${Number(sub.amount_dzd).toLocaleString('fr-DZ')} DZD\nActivé automatiquement, aucune action requise.`
    )
    return
  }
  const { data: cp } = await admin.from('credit_purchases').select('kind, quantity, amount_dzd').eq('id', recordId).maybeSingle()
  if (!cp) return
  const label = cp.kind === 'ai_credits' ? 'crédits IA' : 'messages chatbot'
  await sendTelegramMessage(
    `✅ <b>Recharge en ligne confirmée</b>\n${store.name} (${store.slug})\n+${cp.quantity} ${label} — ${Number(cp.amount_dzd).toLocaleString('fr-DZ')} DZD\nActivée automatiquement, aucune action requise.`
  )
}

// ============================================================
// Tenant-facing: new-order alerts for store owners (Ultimate+).
//
// A SEPARATE bot from the admin one above (TELEGRAM_ORDERS_BOT_TOKEN, not
// TELEGRAM_BOT_TOKEN) — deliberately, not by accident. Two reasons it must stay
// separate: this bot's profile is customer-facing (every store owner adds it),
// and it is the only one with a webhook registered. Telegram allows exactly one
// webhook per bot, so pointing this one at /api/webhooks/telegram would have
// silently hijacked the admin bot if they shared a token.
// ============================================================

/** Max recipients a store may connect — the owner plus a couple of staff. */
export const MAX_TELEGRAM_RECIPIENTS = 3

/** How long a link code stays usable before the owner must generate a new one. */
export const TELEGRAM_LINK_CODE_TTL_MS = 15 * 60 * 1000

/** True when the orders bot token exists — enough to SEND to a known chat id. */
export function isTelegramBotConfigured(): boolean {
  return !!process.env.TELEGRAM_ORDERS_BOT_TOKEN
}

/** The orders bot's @username, needed to build t.me deep links. */
export function telegramBotUsername(): string | null {
  return process.env.TELEGRAM_ORDERS_BOT_USERNAME?.replace(/^@/, '') || null
}

/**
 * Send to one specific chat id via the ORDERS bot. Unlike sendTelegramMessage()
 * above (admin bot, hardwired to the admin chat), this is the per-recipient
 * primitive.
 * Returns false instead of throwing — callers are all best-effort paths where
 * a Telegram outage must never break the underlying business action.
 */
export async function sendTelegramTo(chatId: string, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_ORDERS_BOT_TOKEN
  if (!token) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Telegram renders parse_mode:HTML, so customer-supplied text must be escaped. */
export function escapeTelegramHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export interface TelegramOrderPayload {
  order_number: number | string | null
  customer_name: string | null
  customer_phone: string | null
  wilaya: string | null
  commune: string | null
  quantity: number | null
  total_price: number | null
  product_name?: string | null
}

/**
 * Ping every connected recipient of `storeId` about a freshly created order.
 *
 * Fire-and-forget by contract: the caller has already committed the order, so
 * every failure path here returns quietly. Gated on BOTH the Ultimate plan and
 * the store's own settings toggle, re-checked server-side — the client toggle
 * is a UI convenience, not the authority.
 */
export async function notifyStoreNewOrder(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  order: TelegramOrderPayload,
): Promise<void> {
  if (!isTelegramBotConfigured()) return
  try {
    const { data: store } = await admin
      .from('stores')
      .select('name, plan, settings')
      .eq('id', storeId)
      .maybeSingle()
    if (!store) return
    if (!ULTIMATE_PLANS.includes(store.plan as Plan)) return
    if (store.settings?.notifyTelegramOrders === false) return

    const { data: recipients } = await admin
      .from('telegram_recipients')
      .select('chat_id')
      .eq('store_id', storeId)
    if (!recipients?.length) return

    const esc = escapeTelegramHtml
    const money = (n: number | null) => `${Number(n ?? 0).toLocaleString('fr-DZ')} DZD`
    const lines = [
      `🛒 <b>Nouvelle commande</b> — ${esc(String(store.name ?? ''))}`,
      order.order_number != null ? `N° ${esc(String(order.order_number))}` : null,
      order.product_name ? `📦 ${esc(order.product_name)}` : null,
      `👤 ${esc(order.customer_name ?? '—')}`,
      `📞 ${esc(order.customer_phone ?? '—')}`,
      `📍 ${esc(order.wilaya ?? '—')}, ${esc(order.commune ?? '—')}`,
      `🔢 Quantité : ${order.quantity ?? 1}`,
      `💰 <b>${money(order.total_price)}</b>`,
    ].filter(Boolean)
    const text = lines.join('\n')

    // Parallel, and never let one blocked/deleted chat stop the others.
    await Promise.all(recipients.map(r => sendTelegramTo(String(r.chat_id), text)))
  } catch {
    // Best-effort by design — the order is already saved.
  }
}

/**
 * Alert that a store's Messenger/Instagram page token was invalidated (Graph
 * error 190 — password change, token revoke, permission removal). The caller
 * disables the channel_connections row first, so this fires exactly once per
 * breakage instead of once per incoming message.
 *
 * Notifies the store owner's own Telegram (orders bot, if linked) AND the
 * platform admin bot — owners who never linked Telegram would otherwise never
 * find out their chatbot went silent.
 */
export async function notifyChannelDisconnected(
  admin: ReturnType<typeof createAdminClient>,
  storeId: string,
  platform: 'messenger' | 'instagram',
  pageName: string | null,
): Promise<void> {
  try {
    const { data: store } = await admin.from('stores').select('name, slug, plan').eq('id', storeId).maybeSingle()
    if (!store) return

    const platformLabel = platform === 'instagram' ? 'Instagram' : 'Messenger'
    const page = pageName ? ` (${escapeTelegramHtml(pageName)})` : ''
    const ownerText =
      `⚠️ <b>Chatbot ${platformLabel} déconnecté</b>\n` +
      `Le token Facebook a expiré ou a été invalidé (mot de passe changé, session révoquée...) — ` +
      `le chatbot ne peut plus répondre sur ce canal.\n` +
      `Reconnectez-vous : Dashboard → Paramètres → Chatbot → « Connecter Facebook / Instagram »${page}.`

    let ownerNotified = false
    if (ULTIMATE_PLANS.includes(store.plan as Plan)) {
      const { data: recipients } = await admin.from('telegram_recipients').select('chat_id').eq('store_id', storeId)
      if (recipients?.length) {
        const results = await Promise.all(recipients.map(r => sendTelegramTo(String(r.chat_id), ownerText)))
        ownerNotified = results.some(Boolean)
      }
    }

    const adminText =
      `⚠️ <b>Chatbot ${platformLabel} déconnecté</b>\n${escapeTelegramHtml(store.name)} (${store.slug})${page}\n` +
      `Token Facebook invalidé — le canal a été désactivé automatiquement.` +
      (ownerNotified ? '' : '\n<i>Propriétaire non alerté (Telegram non connecté).</i>')
    await sendTelegramMessage(adminText)
  } catch {
    // Best-effort — never let alerting break webhook processing.
  }
}
