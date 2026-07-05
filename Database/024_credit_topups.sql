-- ============================================================
-- 024 — AI-credit & chatbot-message TOP-UPS (Ultimate+ purchasable packs)
-- Idempotent. Paste into Supabase → SQL Editor → Run.
-- ============================================================

-- Permanent top-up balances. They live on the owner's PRIMARY (earliest) store —
-- the shared account pool — and are NEVER wiped by the monthly plan reset (which
-- only touches ai_credits / chatbot_daily_limit). Generations spend the monthly
-- allowance first, then draw from these.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS purchased_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS purchased_chatbot INTEGER NOT NULL DEFAULT 0;

-- One row per top-up request (manual payment, confirmed by super admin — same flow
-- as plan upgrades in `subscriptions`).
CREATE TABLE IF NOT EXISTS credit_purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL CHECK (kind IN ('ai_credits', 'chatbot_messages')),
  quantity          INTEGER NOT NULL,
  amount_dzd        INTEGER NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  payment_proof_url TEXT,
  rejected_reason   TEXT,
  confirmed_by      UUID,
  confirmed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS credit_purchases_store_idx  ON credit_purchases(store_id);
CREATE INDEX IF NOT EXISTS credit_purchases_status_idx ON credit_purchases(status);

ALTER TABLE credit_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own credit purchases" ON credit_purchases;
CREATE POLICY "Owners read own credit purchases" ON credit_purchases FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = credit_purchases.store_id AND stores.owner_id = auth.uid())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "Owners create own credit purchases" ON credit_purchases;
CREATE POLICY "Owners create own credit purchases" ON credit_purchases FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = credit_purchases.store_id AND stores.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Super admins manage credit purchases" ON credit_purchases;
CREATE POLICY "Super admins manage credit purchases" ON credit_purchases FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

NOTIFY pgrst, 'reload schema';
