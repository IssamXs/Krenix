-- ============================================================
-- 060 — Manual product ordering (drag-reorder in dashboard + storefront).
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS position INTEGER;

-- Backfill existing rows: oldest product first, numbered 0..N per store, so
-- current storefront order (created_at DESC before this migration doesn't
-- matter — we just need a stable starting order) is preserved as a baseline.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY store_id ORDER BY created_at ASC) - 1 AS rn
  FROM products
  WHERE position IS NULL
)
UPDATE products SET position = ranked.rn
FROM ranked
WHERE products.id = ranked.id;

ALTER TABLE products ALTER COLUMN position SET DEFAULT 0;
ALTER TABLE products ALTER COLUMN position SET NOT NULL;

CREATE INDEX IF NOT EXISTS products_store_position_idx ON products(store_id, position);

-- New products auto-append to the end of their store's list unless a
-- position is explicitly supplied.
CREATE OR REPLACE FUNCTION set_product_position()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.position IS NULL OR NEW.position = 0 THEN
    SELECT COALESCE(MAX(position) + 1, 0) INTO NEW.position
    FROM products WHERE store_id = NEW.store_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_product_position ON products;
CREATE TRIGGER trg_set_product_position
  BEFORE INSERT ON products
  FOR EACH ROW EXECUTE FUNCTION set_product_position();

NOTIFY pgrst, 'reload schema';
