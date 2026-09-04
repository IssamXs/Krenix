-- ============================================================
-- 069 — Persistent log for storefront Meta Conversions API delivery
-- failures. Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: Meta's "Improve your rate of Meta Pixel events covered by
-- Conversions API" diagnostic showed the server sending fewer Purchase
-- events than the browser pixel over a 7-day window. lib/storefront-capi.ts
-- silently drops an event on timeout/network failure (console.error only),
-- and Vercel's log retention is too short to ever see which orders were
-- affected or why. This table gives that gap a permanent trace, matching
-- the same rationale as order_deletions/order_failed_attempts (068).
-- ============================================================

CREATE TABLE IF NOT EXISTS capi_delivery_failures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id       UUID,
  event_name     TEXT NOT NULL DEFAULT 'Purchase',
  attempts       INTEGER NOT NULL DEFAULT 1,
  error_message  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS capi_delivery_failures_store_idx ON capi_delivery_failures(store_id, created_at DESC);

ALTER TABLE capi_delivery_failures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner reads own CAPI failure log" ON capi_delivery_failures;
CREATE POLICY "Store owner reads own CAPI failure log" ON capi_delivery_failures FOR SELECT
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = capi_delivery_failures.store_id AND stores.owner_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
