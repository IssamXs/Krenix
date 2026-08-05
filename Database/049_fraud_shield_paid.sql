-- ============================================================
-- 049 — Paid Fraud Shield (2 500 DZD/month) + order archiving
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- Fraud Shield becomes a paid add-on. A merchant may only flip the existing
-- stores.fraud_shield_enabled toggle while they hold a valid ('active', not
-- expired) fraud_shield_purchases row. Each confirmed purchase grants 30 days.
--
-- Also adds orders.is_archived so merchants can archive AI-detected fake
-- orders instead of hard-deleting them (used by the "AI fake orders detector"
-- on the orders page).
-- ============================================================

CREATE TABLE IF NOT EXISTS fraud_shield_purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount_dzd        INTEGER NOT NULL DEFAULT 2500,
  months            INTEGER NOT NULL DEFAULT 1,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'rejected')),
  payment_method    TEXT,
  payment_proof_url TEXT,
  provider_ref      TEXT,
  started_at        TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ,
  confirmed_by      UUID,
  confirmed_at      TIMESTAMPTZ,
  rejected_reason   TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS fraud_shield_purchases_store_idx  ON fraud_shield_purchases(store_id);
CREATE INDEX IF NOT EXISTS fraud_shield_purchases_status_idx ON fraud_shield_purchases(status);

ALTER TABLE fraud_shield_purchases ENABLE ROW LEVEL SECURITY;

-- Owners can read their own purchases and create new payment requests
-- (mirrors credit_purchases, migration 024). Confirmation/rejection is
-- super-admin-only.
DROP POLICY IF EXISTS "Owners read own fraud shield purchases" ON fraud_shield_purchases;
CREATE POLICY "Owners read own fraud shield purchases" ON fraud_shield_purchases FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = fraud_shield_purchases.store_id AND stores.owner_id = auth.uid())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "Owners create own fraud shield purchases" ON fraud_shield_purchases;
CREATE POLICY "Owners create own fraud shield purchases" ON fraud_shield_purchases FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = fraud_shield_purchases.store_id AND stores.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "Super admins manage fraud shield purchases" ON fraud_shield_purchases;
CREATE POLICY "Super admins manage fraud shield purchases" ON fraud_shield_purchases FOR ALL
  USING (is_super_admin()) WITH CHECK (is_super_admin());

-- Archiving: lets a store owner hide AI-flagged fake orders from the live list
-- without deleting them.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS orders_store_archived_idx ON orders(store_id, is_archived);

NOTIFY pgrst, 'reload schema';
