-- ============================================================
-- Performance: missing indexes for the hot query paths.
-- Idempotent (IF NOT EXISTS) — safe to run multiple times via the
-- Supabase SQL Editor, mirroring RUN_PENDING.sql conventions.
-- ============================================================

-- Landing page slug lookups run on the platform's hottest route (every
-- storefront page visit, via getCachedLandingPageBySlug). The existing
-- idx_landing_pages_store_id alone requires a seq scan on slug.
CREATE INDEX IF NOT EXISTS idx_landing_pages_store_slug
  ON landing_pages(store_id, slug);

-- A/B per-page order counts (dashboard/pages/[id]) filter only on
-- landing_page_id, which is not indexed today.
CREATE INDEX IF NOT EXISTS idx_orders_landing_page
  ON orders(landing_page_id);

-- Fraud Shield dashboard sorts/scans by risk score within a store.
CREATE INDEX IF NOT EXISTS idx_orders_store_fraud_risk
  ON orders(store_id, fraud_risk_score);

-- Abandoned-cart recovery dedupes on (store_id, phone) per lead insert.
CREATE INDEX IF NOT EXISTS idx_leads_store_phone
  ON leads(store_id, phone);

-- Monthly credit-usage counts filter on (store_id, created_at).
CREATE INDEX IF NOT EXISTS idx_credit_usage_store_created
  ON credit_usage(store_id, created_at);

-- Super-admin notifications panel loads unread-first rows.
CREATE INDEX IF NOT EXISTS idx_super_admin_notifications_unread
  ON super_admin_notifications(is_read, created_at DESC);

-- rate_limits cleanup DELETE in bump_rate_limit filters on window_start alone
-- (the PK covers (key, window_start), not window_start by itself), so the 2%
-- opportunistic sweep would otherwise seq-scan the table.
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start
  ON rate_limits(window_start);
