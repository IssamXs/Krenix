-- ============================================================
-- 056 — Per-product "show description on storefront" toggle
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: storefront product pages never rendered the merchant's description, so
-- it looked like the text was never saved. Merchants now pick per product
-- whether the description is shown (default: shown). The storefront renders
-- `description` only when this flag is ON (and a description exists).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS show_description BOOLEAN NOT NULL DEFAULT TRUE;

NOTIFY pgrst, 'reload schema';
