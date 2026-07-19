-- ============================================================
-- Self-service subscription cancellation — a monthly plan owner can stop
-- their subscription from renewing without losing the days already paid
-- for. Purely a flag: the existing plan-expiry cron (src/lib/plan-expiry.ts)
-- already lapses a subscription at expires_at regardless of this column, so
-- cancelling just marks intent (and drives the dashboard banner) — it does
-- not touch stores.plan/subscription_status directly, and no new expiry
-- mechanism is needed.
-- ============================================================
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false;
