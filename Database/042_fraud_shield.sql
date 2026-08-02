-- ============================================================
-- 042 — Fraud Shield: per-store fraud-detection feature (v1, rule-based)
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- Gated entirely behind stores.fraud_shield_enabled, defaulting to FALSE for
-- every store. Only a super admin (or the service role) may flip it — this
-- follows the same protected-column pattern as plan/credits (migration 025).
-- ============================================================

ALTER TABLE stores ADD COLUMN IF NOT EXISTS fraud_shield_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_risk_score INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_signals JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_label TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fraud_label_check;
ALTER TABLE orders ADD CONSTRAINT orders_fraud_label_check
  CHECK (fraud_label IN ('pending', 'confirmed_fake', 'confirmed_real'));

CREATE TABLE IF NOT EXISTS fraud_order_signals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  order_id               UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ip                     TEXT,
  ip_country             TEXT,
  ip_is_proxy_or_hosting BOOLEAN NOT NULL DEFAULT FALSE,
  device_fingerprint     TEXT,
  time_on_page_ms        INTEGER,
  had_movement           BOOLEAN NOT NULL DEFAULT FALSE,
  form_fill_ms           INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_store_fingerprint
  ON fraud_order_signals(store_id, device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_store_created
  ON fraud_order_signals(store_id, created_at);

-- Service-role-only table (only the order-creation API route writes to it,
-- via the admin client) — RLS enabled with no owner policies, same as
-- rate_limits (migration 033).
ALTER TABLE fraud_order_signals ENABLE ROW LEVEL SECURITY;

-- Extend the migration-025 column-locking trigger to also protect
-- fraud_shield_enabled. Must re-CREATE OR REPLACE the whole function (it is
-- one function covering every protected column) — every existing protected
-- column is repeated here unchanged, plus the new one.
CREATE OR REPLACE FUNCTION protect_store_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.plan                   IS DISTINCT FROM OLD.plan
  OR NEW.ai_credits             IS DISTINCT FROM OLD.ai_credits
  OR NEW.chatbot_daily_limit    IS DISTINCT FROM OLD.chatbot_daily_limit
  OR NEW.purchased_credits      IS DISTINCT FROM OLD.purchased_credits
  OR NEW.purchased_chatbot      IS DISTINCT FROM OLD.purchased_chatbot
  OR NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status
  OR NEW.is_suspended           IS DISTINCT FROM OLD.is_suspended
  OR NEW.custom_domain_verified IS DISTINCT FROM OLD.custom_domain_verified
  OR NEW.fraud_shield_enabled   IS DISTINCT FROM OLD.fraud_shield_enabled
  THEN
    RAISE EXCEPTION 'Modification of protected store columns is not allowed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same re-CREATE OR REPLACE treatment for the BEFORE INSERT defaults function,
-- adding one line so an owner can't create a new store with the flag already on.
CREATE OR REPLACE FUNCTION default_store_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  NEW.purchased_credits      := 0;
  NEW.purchased_chatbot      := 0;
  NEW.chatbot_daily_limit    := 0;
  NEW.is_suspended           := FALSE;
  NEW.custom_domain_verified := FALSE;
  NEW.subscription_status    := COALESCE(NEW.subscription_status, 'active');
  NEW.fraud_shield_enabled   := FALSE;

  IF NEW.plan IS DISTINCT FROM 'basic'
     AND NOT EXISTS (SELECT 1 FROM stores WHERE owner_id = NEW.owner_id AND plan = NEW.plan)
  THEN
    NEW.plan := 'basic';
  END IF;

  IF NEW.plan = 'basic' THEN
    NEW.ai_credits := LEAST(COALESCE(NEW.ai_credits, 5), 5);
  ELSE
    NEW.ai_credits := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
