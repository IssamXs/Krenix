-- ============================================================
-- CATCH-UP MIGRATION — makes the DB match the app.
-- Fully idempotent: every statement is IF NOT EXISTS / guarded, so it is safe
-- to run this whole file as many times as you like.
-- Paste into Supabase → SQL Editor → Run.
-- ============================================================

-- ---------- leads (create if it was never applied) ----------
CREATE TABLE IF NOT EXISTS leads (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  landing_page_id  UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  phone            TEXT NOT NULL,
  wilaya           TEXT,
  status           TEXT NOT NULL DEFAULT 'new',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS leads_store_id_idx ON leads(store_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner manages leads" ON leads;
CREATE POLICY "Store owner manages leads" ON leads FOR ALL
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = leads.store_id AND stores.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Public can create leads" ON leads;
CREATE POLICY "Public can create leads" ON leads FOR INSERT WITH CHECK (true);

-- ---------- 016: order courier-tracking columns ----------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number    TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_provider  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_label_url TEXT;

-- ---------- 018: custom domain ----------
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_custom_domain ON stores(custom_domain) WHERE custom_domain IS NOT NULL;

-- ---------- 019: abandoned cart ----------
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_leads_abandoned ON leads(store_id, created_at) WHERE status = 'abandoned';

-- ---------- 020: A/B testing ----------
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_b JSONB;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS views_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant TEXT;
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_variant_check;
ALTER TABLE orders ADD CONSTRAINT orders_variant_check CHECK (variant IN ('A', 'B'));

-- ---------- 015: channel_connections (create if missing) ----------
CREATE TABLE IF NOT EXISTS channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('messenger', 'instagram')),
  page_id TEXT NOT NULL,
  page_name TEXT,
  access_token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, platform)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_conn_platform_page ON channel_connections(platform, page_id);
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

-- ---------- 016: delivery_integrations (create if missing) ----------
CREATE TABLE IF NOT EXISTS delivery_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('yalidine')),
  api_id TEXT NOT NULL,
  api_token TEXT NOT NULL,
  from_wilaya TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, provider)
);
ALTER TABLE delivery_integrations ENABLE ROW LEVEL SECURITY;

-- ---------- 023: extra couriers (widen provider CHECK) ----------
ALTER TABLE delivery_integrations DROP CONSTRAINT IF EXISTS delivery_integrations_provider_check;
ALTER TABLE delivery_integrations ADD CONSTRAINT delivery_integrations_provider_check
  CHECK (provider IN ('yalidine', 'maystro', 'zr_express', 'procolis'));

-- ---------- tables 017 / 021 / 022 (create if missing) ----------
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  invited_email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, invited_email)
);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS customer_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  note TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, phone)
);
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owner manages customer notes" ON customer_notes;
CREATE POLICY "Owner manages customer notes" ON customer_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = customer_notes.store_id AND stores.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM stores WHERE stores.id = customer_notes.store_id AND stores.owner_id = auth.uid()));

CREATE TABLE IF NOT EXISTS sms_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio')),
  account_sid TEXT NOT NULL,
  auth_token TEXT NOT NULL,
  sender TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, provider)
);
ALTER TABLE sms_integrations ENABLE ROW LEVEL SECURITY;

-- ---------- refresh PostgREST schema cache ----------
NOTIFY pgrst, 'reload schema';
