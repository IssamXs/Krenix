-- ============================================================
-- KRENIX — Migration 013: Fix missing upsell columns
-- ============================================================
-- Migration 009 was meant to add these columns, but on this
-- database only the `leads` table part ran — the upsell columns
-- are missing. Without them, EVERY save on the landing-page
-- editor (/dashboard/pages/[id]) fails with HTTP 400
-- (PGRST204: "Could not find the 'upsell_enabled' column").
--
-- This ALTER is idempotent (IF NOT EXISTS) — safe to run once.
-- Run in Supabase Studio → SQL Editor.
-- ============================================================

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS upsell_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS upsell_product_name TEXT,
  ADD COLUMN IF NOT EXISTS upsell_text         TEXT,
  ADD COLUMN IF NOT EXISTS upsell_price        NUMERIC(10,2);

-- Confirm the columns now exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'landing_pages'
  AND column_name LIKE 'upsell%'
ORDER BY column_name;
