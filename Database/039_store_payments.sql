-- ============================================================
-- STORE-LEVEL ONLINE PAYMENTS (SlickPay — CIB / Edahabia)
-- Bring-your-own-key, same pattern as delivery_integrations: each store
-- connects its OWN SlickPay account. Krenix never intermediates the money
-- (0% commission stays true) and never has a merchant account for a store's
-- customers' payments.
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_integrations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  provider           TEXT NOT NULL CHECK (provider IN ('slickpay')),
  public_key         TEXT NOT NULL,   -- encrypted (AES-256-GCM, same TOKEN_ENC_KEY)
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_payment_integrations_store ON payment_integrations(store_id);

-- RLS enabled with NO client policies → service role (API routes) only.
-- The encrypted key never reaches the browser, same as delivery credentials.
ALTER TABLE payment_integrations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_payment_integrations_updated_at
  BEFORE UPDATE ON payment_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Storefront-visibility toggle — deliberately a plain boolean on `stores`
-- (not on payment_integrations) so the public storefront query, which already
-- does an anonymous `select('*')` on stores, can read it directly without a
-- second service-role lookup. No secret ever lives here.
ALTER TABLE stores ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================
-- Orders: payment tracking for the online-payment path. Existing COD orders
-- are unaffected — payment_status defaults to 'unpaid' and is simply never
-- referenced by the COD flow.
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status   TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_provider TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref      TEXT;
