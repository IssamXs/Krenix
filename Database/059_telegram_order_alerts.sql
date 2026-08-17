-- ============================================================
-- 059 — Telegram new-order alerts (Ultimate+)
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: store owners want a phone ping the second an order lands, without
-- keeping the dashboard open. Telegram is free and needs no vendor account —
-- the platform already owns a bot (TELEGRAM_BOT_TOKEN, see src/lib/telegram.ts)
-- used for super-admin pings; this reuses that same bot for tenant alerts.
--
-- A Telegram bot CANNOT message a phone number — it can only reply to a chat
-- that opened it first. So connecting a recipient is a two-step handshake:
--   1. the owner generates a short-lived code   → telegram_link_codes
--   2. the person taps t.me/<bot>?start=<code>  → /api/webhooks/telegram
--      resolves the code and stores their numeric chat_id
-- That is why a chat_id can never be written by the client: it is only ever
-- learned from Telegram itself, in the webhook, via the service role.
--
-- Both tables are service-role-only (RLS enabled, zero policies) — same shape
-- as sms_integrations (022). All reads/writes go through
-- /api/integrations/telegram, which enforces auth + the Ultimate plan gate.
-- The on/off switch itself lives in stores.settings->>'notifyTelegramOrders'.
-- ============================================================

-- ---------- recipients: who gets pinged for this store ----------
CREATE TABLE IF NOT EXISTS telegram_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Numeric Telegram chat id, learned from the webhook. Text, not BIGINT:
  -- Telegram ids for some chat types exceed a signed 64-bit range.
  chat_id TEXT NOT NULL,
  -- Human label so the owner can tell "Moi" from "Yacine (livraison)".
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Same person can't be added twice to one store; re-linking updates the label.
  UNIQUE (store_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_telegram_recipients_store ON telegram_recipients(store_id);

ALTER TABLE telegram_recipients ENABLE ROW LEVEL SECURITY;

-- ---------- link codes: the one-time handshake tokens ----------
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  -- Short random token carried in the deep link's ?start= payload. Telegram
  -- caps that payload at 64 chars of [A-Za-z0-9_-].
  code TEXT PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  -- Set on first successful use. Non-null = spent, never accepted again, so a
  -- leaked link can't be replayed to attach a stranger's chat to the store.
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_store ON telegram_link_codes(store_id);

ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;
