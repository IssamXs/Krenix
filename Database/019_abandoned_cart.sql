-- ============================================================
-- ABANDONED CART RECOVERY
-- Reuses the leads table with status='abandoned' (visitor started an order but
-- didn't submit). recovery_sent_at marks when a recovery message was fired by
-- the cron so it isn't re-processed.
-- ============================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ;

-- Speed up the cron window scan.
CREATE INDEX IF NOT EXISTS idx_leads_abandoned
  ON leads(store_id, created_at) WHERE status = 'abandoned';
