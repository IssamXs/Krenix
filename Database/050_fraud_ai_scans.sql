-- ============================================================
-- 050 — AI fake-orders detector: per-order verdict cache
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- Every Claude call in aiScanOrders() costs real money, so verdicts are cached
-- per order. The /api/orders/ai-scan route reuses a stored verdict for up to
-- 24h instead of re-asking Claude about orders it already analyzed. Service-
-- role-only, same as fraud_order_signals (migration 042): RLS enabled with no
-- owner policies, only the admin client reads/writes it.
-- ============================================================

CREATE TABLE IF NOT EXISTS fraud_ai_scans (
  order_id   UUID PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  verdict    TEXT NOT NULL CHECK (verdict IN ('fake', 'real', 'suspicious')),
  risk_score SMALLINT NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  reasons    JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary    TEXT NOT NULL DEFAULT '',
  model      TEXT NOT NULL,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fraud_ai_scans ENABLE ROW LEVEL SECURITY;
