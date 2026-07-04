-- ============================================================
-- DELIVERY INTEGRATIONS
-- Per-store courier credentials (bring-your-own-key). Each store owner enters
-- their OWN Yalidine API ID + Token; the platform never has a courier account.
-- Service-role only: api_id / api_token are AES-256-GCM encrypted at the app
-- layer (same TOKEN_ENC_KEY as the Meta channel) and never exposed to the browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS delivery_integrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  provider     TEXT NOT NULL CHECK (provider IN ('yalidine')),
  api_id       TEXT NOT NULL,   -- encrypted
  api_token    TEXT NOT NULL,   -- encrypted
  from_wilaya  TEXT,            -- pickup wilaya name (Yalidine from_wilaya_name)
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_delivery_integrations_store ON delivery_integrations(store_id);

-- RLS enabled with NO client policies → only the service role (API routes) can
-- read/write. Credentials never reach the browser.
ALTER TABLE delivery_integrations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_delivery_integrations_updated_at
  BEFORE UPDATE ON delivery_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Orders: courier tracking, set when a shipment is created.
-- ============================================================
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_provider  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_label_url TEXT;
