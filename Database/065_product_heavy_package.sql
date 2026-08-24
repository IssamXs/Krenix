-- ============================================================
-- 065 — Heavy package flag on products
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: some products weigh more than 5kg, which most Algerian couriers
-- (Yalidine/WeCan) surcharge or handle differently. Merchants can now flag a
-- product as heavy; the ship route reads it and reports an approximate
-- weight to the courier automatically when the parcel is created, instead of
-- always sending 0.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS is_heavy BOOLEAN NOT NULL DEFAULT FALSE;

NOTIFY pgrst, 'reload schema';
