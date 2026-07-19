-- ============================================================
-- Plan expiry — indexes for the nightly expiry job and its read-time backstop.
--
-- No schema change: subscriptions.expires_at already exists, it just was never
-- read by anything. These indexes support the queries that now enforce it.
-- ============================================================

-- The expiry cron scans: status = 'active' AND expires_at <= now().
-- idx_subscriptions_status alone still walks every active subscription; the
-- composite lets Postgres jump straight to the lapsed ones. Partial, because
-- rows with no expiry (one-time Basic) are never candidates.
CREATE INDEX IF NOT EXISTS idx_subscriptions_active_expiry
  ON subscriptions(expires_at)
  WHERE status = 'active' AND expires_at IS NOT NULL;

-- The read-time backstop (middleware + storefront) loads a store's
-- subscriptions filtered by status. Covered by idx_subscriptions_store_id for
-- the join, but this makes the status filter cheap on stores with long
-- payment histories.
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_status
  ON subscriptions(store_id, status);

-- The abandoned-cart cron checks "did this phone already order from this
-- store?" once per lead. idx_orders_store_id narrows to the store but then
-- scans its orders for the phone; this makes it a direct lookup.
CREATE INDEX IF NOT EXISTS idx_orders_store_phone
  ON orders(store_id, customer_phone);
