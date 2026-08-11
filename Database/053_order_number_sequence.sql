-- ============================================================
-- 053 — Replace the COUNT(*) order_number generator with an O(1)
-- per-store atomic counter.
-- ============================================================
-- generate_order_number() (001 + 035) computed the next order_number as
-- `SELECT COUNT(*) + 1 FROM orders WHERE store_id = ...`, guarded by a
-- per-store advisory lock. Correct, but O(n) on every single order insert:
-- a store with 100k orders does a full COUNT over 100k rows before every
-- insert, and the advisory lock serializes concurrent inserts for that store.
--
-- Replacement: a tiny store_order_sequences table. Each insert atomically
-- increments the store's counter via `INSERT ... ON CONFLICT DO UPDATE ...
-- RETURNING` — O(1), lock-free (row-level), race-free. Numbers are monotonic
-- and are NEVER reused, so deleting orders can no longer cause a later order
-- to collide with an existing number (a latent bug in the COUNT approach).
--
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.

CREATE TABLE IF NOT EXISTS store_order_sequences (
  store_id   UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  last_value INTEGER NOT NULL
);

-- Seed the counter from existing rows so existing stores keep counting up
-- from where they are today (no number restarts or collisions).
INSERT INTO store_order_sequences (store_id, last_value)
SELECT store_id, COUNT(*) FROM orders GROUP BY store_id
ON CONFLICT (store_id) DO NOTHING;

CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  store_prefix TEXT;
  order_count INTEGER;
BEGIN
  SELECT UPPER(SUBSTRING(slug, 1, 3)) INTO store_prefix
  FROM stores WHERE id = NEW.store_id;

  INSERT INTO store_order_sequences (store_id, last_value)
  VALUES (NEW.store_id, 1)
  ON CONFLICT (store_id) DO UPDATE SET last_value = store_order_sequences.last_value + 1
  RETURNING last_value INTO order_count;

  NEW.order_number = store_prefix || '-' || LPAD(order_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
