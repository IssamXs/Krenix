import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { MAX_TELEGRAM_RECIPIENTS, escapeTelegramHtml, sendTelegramTo } from '@/lib/telegram'

// Telegram ORDERS-bot webhook — the second half of the recipient handshake.
// Registered against TELEGRAM_ORDERS_BOT_TOKEN only. The admin bot
// (TELEGRAM_BOT_TOKEN, src/lib/telegram.ts) has no webhook and must not get
// one — Telegram permits a single webhook per bot.
//
// A bot cannot message a phone number; it can only reply to a chat that opened
// it. So the owner mints a code in /api/integrations/telegram, shares
// t.me/<bot>?start=<code>, and Telegram delivers that payload here as the text
// "/start <code>" the moment the person taps Start. Only then do we learn their
// numeric chat id — which is exactly why chat ids are never client-supplied.
//
// Register the webhook once per environment:
//   curl -F "url=https://krenix.store/api/webhooks/telegram" \
//        -F "secret_token=$TELEGRAM_ORDERS_WEBHOOK_SECRET" \
//        "https://api.telegram.org/bot$TELEGRAM_ORDERS_BOT_TOKEN/setWebhook"
//
// The endpoint is public (Telegram cannot authenticate), so the secret header
// is the only thing standing between it and a forged "someone pressed Start".
// Without TELEGRAM_ORDERS_WEBHOOK_SECRET set we refuse to process anything rather
// than run unauthenticated.

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string }
    from?: { first_name?: string; username?: string }
    text?: string
  }
}

// Always 200: a non-2xx makes Telegram retry the same update for hours. Every
// rejection path below is deliberate, not transient, so there is nothing to retry.
const ok = () => NextResponse.json({ ok: true })

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_ORDERS_WEBHOOK_SECRET
  if (!secret) return ok()
  if (request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('Forbidden', { status: 403 })
  }

  let update: TelegramUpdate
  try { update = await request.json() } catch { return ok() }

  const chatId = update.message?.chat?.id
  const text = update.message?.text?.trim()
  if (chatId == null || !text) return ok()

  const match = /^\/start(?:\s+(\S+))?$/.exec(text)
  if (!match) return ok()

  const code = match[1]
  if (!code) {
    await sendTelegramTo(
      String(chatId),
      "👋 Bonjour ! Pour recevoir les alertes de commandes, ouvrez le lien d'invitation généré depuis votre tableau de bord Krenix (Paramètres → Notifications).",
    )
    return ok()
  }

  const admin = createAdminClient()
  const { data: link } = await admin
    .from('telegram_link_codes')
    .select('code, store_id, label, expires_at, used_at')
    .eq('code', code)
    .maybeSingle()

  if (!link || link.used_at || new Date(link.expires_at) < new Date()) {
    await sendTelegramTo(String(chatId), '❌ Ce lien a expiré ou a déjà été utilisé. Demandez-en un nouveau.')
    return ok()
  }

  // Re-check the cap here, not just at mint time: several codes can be minted
  // and redeemed independently, so this is the only place the real count is known.
  const { count } = await admin
    .from('telegram_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', link.store_id)

  const { data: existing } = await admin
    .from('telegram_recipients')
    .select('id')
    .eq('store_id', link.store_id)
    .eq('chat_id', String(chatId))
    .maybeSingle()

  if (!existing && (count ?? 0) >= MAX_TELEGRAM_RECIPIENTS) {
    await sendTelegramTo(
      String(chatId),
      `❌ Cette boutique a déjà ${MAX_TELEGRAM_RECIPIENTS} destinataires connectés.`,
    )
    return ok()
  }

  // Burn the code first. If the upsert below fails we'd rather leave a spent
  // code than a live one — the owner can mint another in one click.
  const { data: burned } = await admin
    .from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code', code)
    .is('used_at', null)
    .select('code')
    .maybeSingle()
  // Lost the race against a concurrent redemption of the same code.
  if (!burned) return ok()

  const { error } = await admin
    .from('telegram_recipients')
    .upsert(
      { store_id: link.store_id, chat_id: String(chatId), label: link.label },
      { onConflict: 'store_id,chat_id' },
    )
  if (error) {
    console.error('[webhooks/telegram] recipient upsert failed:', error)
    await sendTelegramTo(String(chatId), '❌ Erreur lors de la connexion. Réessayez plus tard.')
    return ok()
  }

  const { data: store } = await admin.from('stores').select('name').eq('id', link.store_id).maybeSingle()
  await sendTelegramTo(
    String(chatId),
    `✅ <b>Connecté !</b>\nVous recevrez ici chaque nouvelle commande de <b>${escapeTelegramHtml(String(store?.name ?? ''))}</b>.`,
  )
  return ok()
}
