-- ============================================================
-- 051 — Fraud Shield: evolving engine (v4) — behavioral signal columns
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- The evolving detector (engine.ts) learns the bot's STRATEGY from confirmed
-- history: fill speed, typing cadence, paste usage, hidden-tab fills, hour
-- bands, phone prefixes, IP /16 pools. Those features need the richer
-- storefront telemetry captured by client-signals.ts, so fraud_order_signals
-- gains the extended behavioral columns here.
--
-- Everything is ADD COLUMN IF NOT EXISTS — the route code already tolerates
-- the old base schema, so this migration can be applied at any time.
-- ============================================================

ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS input_events       INTEGER;
ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS paste_events       INTEGER;
ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS avg_key_delay_ms   INTEGER;
ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS max_input_gap_ms   INTEGER;
ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS tab_hidden_ms      INTEGER;
ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS scroll_events      INTEGER;
ALTER TABLE fraud_order_signals ADD COLUMN IF NOT EXISTS focus_events       INTEGER;

-- Bot waves hammer the same IP; the engine's ip_shared / IP-pool learning and
-- the ai-scan cadence block both scan by IP. Missing index = slow scans at
-- wave scale.
CREATE INDEX IF NOT EXISTS idx_fraud_signals_store_ip
  ON fraud_order_signals(store_id, ip);
