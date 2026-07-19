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
