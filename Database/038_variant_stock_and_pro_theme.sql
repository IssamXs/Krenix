-- Migration 038: per-variant stock + Pro locked theme choice
--
-- 1. products.variant_stock (JSONB): independent per-colour and per-size stock
--    pools. Shape: { "colors": {"Bleu": 10}, "sizes": {"S": 8, "M": 12} }.
--    NULL / absent = product doesn't track variant stock (legacy general stock).
--
-- 2. stores.pro_theme_slug (TEXT): the single niche theme a Pro-plan store has
--    locked into. Pro can pick ANY one of the 5 niche themes and keep it; to
--    switch they must upgrade to Ultimate+ (which ignores this and unlocks all).
--    NULL = no niche theme chosen yet (Pro may still pick any one).

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS variant_stock JSONB;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS pro_theme_slug TEXT;
