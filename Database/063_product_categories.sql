-- ============================================================
-- 063 — Product categories (admin-defined, one per product).
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_categories_store_id ON categories(store_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- Postgres has no CREATE POLICY IF NOT EXISTS — DROP first so a second paste
-- of this file doesn't error out on a duplicate policy name.
DROP POLICY IF EXISTS "Store owners can manage own categories" ON categories;
CREATE POLICY "Store owners can manage own categories"
  ON categories FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

DROP POLICY IF EXISTS "Public can read categories" ON categories;
CREATE POLICY "Public can read categories"
  ON categories FOR SELECT
  TO anon
  USING (true);

NOTIFY pgrst, 'reload schema';
