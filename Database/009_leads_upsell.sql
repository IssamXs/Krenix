-- Migration 009: Leads capture + Landing page upsell
-- Run after 008_new_tiers.sql

-- ── 1. Leads table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  landing_page_id   UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  phone             TEXT NOT NULL,
  wilaya            TEXT,
  status            TEXT NOT NULL DEFAULT 'new', -- new | contacted | converted | lost
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_store_id_idx ON leads(store_id);
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads(status);

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Store owner manages leads" ON leads;
CREATE POLICY "Store owner manages leads"
  ON leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM stores
      WHERE stores.id = leads.store_id
        AND stores.owner_id = auth.uid()
    )
  );

-- Public can INSERT leads (customer submitting their info)
DROP POLICY IF EXISTS "Public can create leads" ON leads;
CREATE POLICY "Public can create leads"
  ON leads FOR INSERT
  WITH CHECK (true);

-- ── 2. Upsell columns on landing_pages ─────────────────────────────────────
ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS upsell_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS upsell_product_name TEXT,
  ADD COLUMN IF NOT EXISTS upsell_text         TEXT,
  ADD COLUMN IF NOT EXISTS upsell_price        NUMERIC(10,2);
