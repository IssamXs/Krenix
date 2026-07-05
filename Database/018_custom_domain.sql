-- ============================================================
-- CUSTOM DOMAIN (Growth+ plans)
-- A store can attach its own domain (e.g. www.maboutique.dz). The middleware
-- serves the storefront for that hostname once the DNS CNAME is verified.
-- ============================================================
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- One store per domain.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_custom_domain
  ON stores(custom_domain) WHERE custom_domain IS NOT NULL;
