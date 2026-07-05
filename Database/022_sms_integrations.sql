-- ============================================================
-- SMS INTEGRATIONS (Business+) — bring-your-own Twilio credentials
-- Service-role only: account_sid / auth_token are AES-256-GCM encrypted at the
-- app layer (same TOKEN_ENC_KEY) and never exposed to the browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS sms_integrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  provider     TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio')),
  account_sid  TEXT NOT NULL,   -- encrypted
  auth_token   TEXT NOT NULL,   -- encrypted
  sender       TEXT NOT NULL,   -- Twilio sender number / alphanumeric id
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_sms_integrations_store ON sms_integrations(store_id);

ALTER TABLE sms_integrations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_sms_integrations_updated_at
  BEFORE UPDATE ON sms_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
