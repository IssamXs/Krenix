-- ============================================================
-- SlickPay: store the SlickPay invoice id on each pending payment record so the
-- webhook + return route can re-verify status by record. Service-role write only.
-- ============================================================
ALTER TABLE subscriptions     ADD COLUMN IF NOT EXISTS provider_ref TEXT;
ALTER TABLE credit_purchases  ADD COLUMN IF NOT EXISTS provider_ref TEXT;
