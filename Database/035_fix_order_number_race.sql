-- ============================================================
-- Fix: order_number collisions under concurrent order inserts
-- ============================================================
-- Found via a controlled load test (12 concurrent order inserts against the
-- demo store): generate_order_number() computed the next number as
-- `SELECT COUNT(*) + 1 FROM orders WHERE store_id = ...`, which is a classic
-- read-then-write race. Two concurrent orders for the same store can both
-- read the same count before either commits, so both get the same
-- order_number (reproduced: 3 orders shared "DEM-0001" out of 12 concurrent
-- inserts). No duplicates exist in production yet (checked all 14 live
-- orders platform-wide) — but concurrent orders on the same store are
-- exactly what a successful ad campaign produces, so this needs to land
-- before real traffic ramps up.
--
-- Fix: take a per-store advisory lock before counting, so concurrent
-- transactions for the SAME store serialize around the count+assign step
-- (orders for different stores are unaffected and still run in parallel).
-- pg_advisory_xact_lock auto-releases at transaction end — no manual unlock,
-- no risk of a stuck lock outliving the request.

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  store_prefix TEXT;
  order_count INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.store_id::text));

  SELECT UPPER(SUBSTRING(slug, 1, 3)) INTO store_prefix
  FROM stores WHERE id = NEW.store_id;

  SELECT COUNT(*) + 1 INTO order_count
  FROM orders WHERE store_id = NEW.store_id;

  NEW.order_number = store_prefix || '-' || LPAD(order_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
