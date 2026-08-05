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
import { PLAN_LABELS, type Plan } from '@/types/database'

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
