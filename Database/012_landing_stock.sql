-- ============================================================
-- LANDING PAGE STOCK
-- Per-landing-page inventory count.
-- NULL = stock not tracked (existing pages created before this feature).
-- New pages always set an integer >= 0.
-- Decrements when an order from the page enters the "confirmed zone"
-- (confirmed / chez_livreur / en_livraison / livree), restored on cancel/return.
-- At 0, the landing page shows "Rupture de stock" and blocks ordering.
-- ============================================================

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS stock integer;
