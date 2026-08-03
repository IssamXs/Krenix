-- ============================================================
-- 047 — Stop-desk delivery type on orders
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: customers can now choose home delivery ("domicile") or stop-desk
-- pickup on the order form. Every order needs to record which one was
-- chosen so dashboard fulfillment and automatic Yalidine shipment creation
-- (which already supports stop-desk at the API level) know which to use.
-- Existing orders default to 'home' — the only option that existed before
-- this change, so this is a correct backfill, not a guess.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_type TEXT NOT NULL DEFAULT 'home';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_delivery_type_check'
  ) THEN
    ALTER TABLE orders ADD CONSTRAINT orders_delivery_type_check
      CHECK (delivery_type IN ('home', 'desk'));
  END IF;
END $$;
