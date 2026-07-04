-- ============================================================
-- LANDING PAGE GENERATED IMAGES
-- Stores AI-generated product photos per landing page
-- ============================================================

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS generated_images text[] NOT NULL DEFAULT '{}';
