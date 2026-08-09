-- ============================================================
-- 055 — Fraud Shield: monthly AI-scan quota enforcement
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- Fraud Shield's paid tiers (see status.ts FRAUD_SHIELD_PRICE_DZD) include a
-- monthly cap on fresh Claude scans: 2500 DZD -> 300 scans, 5000 DZD -> 700
-- scans. Previously nothing enforced this — any paid subscriber could run
-- unlimited scans. This logs one row per FRESH scan (a cache miss that
-- actually called Claude — re-serving a cached verdict is free and must
-- never count against quota), so usage can be counted since the current
-- active purchase's started_at.
-- ============================================================

CREATE TABLE IF NOT EXISTS fraud_scan_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id   UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_scan_usage_store_created
  ON fraud_scan_usage(store_id, created_at);

-- Same protected-table shape as fraud_order_signals/fraud_ai_scans, but
-- readable by the owning store so the dashboard can show "X / 300 scans used
-- this period" without needing the admin client. Only the service-role
-- ai-scan route writes to it.
ALTER TABLE fraud_scan_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read own fraud scan usage" ON fraud_scan_usage;
CREATE POLICY "Owners read own fraud scan usage" ON fraud_scan_usage FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM stores WHERE stores.id = fraud_scan_usage.store_id AND stores.owner_id = auth.uid())
    OR is_super_admin()
  );

NOTIFY pgrst, 'reload schema';
