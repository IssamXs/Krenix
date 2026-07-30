-- ============================================================
-- Add Chargily as a second BYO-key store-level payment provider alongside
-- SlickPay. A store may connect both, but only one is "active" (shown on the
-- storefront) at a time — active_payment_provider tracks which.
-- ============================================================
ALTER TABLE payment_integrations DROP CONSTRAINT IF EXISTS payment_integrations_provider_check;
ALTER TABLE payment_integrations ADD CONSTRAINT payment_integrations_provider_check
  CHECK (provider IN ('slickpay', 'chargily'));

ALTER TABLE stores ADD COLUMN IF NOT EXISTS active_payment_provider TEXT
  CHECK (active_payment_provider IN ('slickpay', 'chargily'));
