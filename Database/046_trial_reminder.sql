-- Migration: Trial-expiry reminder email
-- Idempotency marker so the "your trial ends soon" email is sent at most once
-- per free-trial subscription (mirrors leads.recovery_sent_at).

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_reminder_sent_at TIMESTAMPTZ;
