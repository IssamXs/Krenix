-- ============================================================
-- AD CREATIVES
-- Stores AI-generated ad images per landing page
-- ============================================================
CREATE TABLE IF NOT EXISTS ad_creatives (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  landing_page_id UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  product_name    TEXT NOT NULL,
  format          TEXT NOT NULL DEFAULT 'square',
  style           TEXT NOT NULL DEFAULT 'elegant',
  image_url       TEXT NOT NULL,
  ad_copy         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ad_creatives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners manage own ad creatives"
  ON ad_creatives FOR ALL TO authenticated
  USING (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ad_creatives_store_id ON ad_creatives(store_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_landing_page_id ON ad_creatives(landing_page_id);

-- Extend credit_usage type check to include ad_creative
ALTER TABLE credit_usage DROP CONSTRAINT IF EXISTS credit_usage_type_check;
ALTER TABLE credit_usage ADD CONSTRAINT credit_usage_type_check
  CHECK (type IN ('landing_page', 'ad_creative'));
