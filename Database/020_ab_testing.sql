-- ============================================================
-- A/B TESTING FOR LANDING PAGES (Business+)
-- content_b holds an alternate version of the page content. When present, the
-- storefront serves A or B 50/50 (sticky per visitor via cookie). views_b counts
-- variant-B views (views stays variant A). orders.variant records which version
-- produced each order.
-- ============================================================
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_b JSONB;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS views_b INTEGER NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant TEXT CHECK (variant IN ('A', 'B'));
