-- ============================================================
-- 042 — Product badges (Winner, Bestseller, etc.), Ultimate+ only
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: store owners on Ultimate+ can tag products with merchandising badges,
-- shown on the storefront. Client-side plan gating alone isn't enough (an
-- owner could write to the column via the browser console), so a trigger
-- clears `badges` on any INSERT/UPDATE unless the owning store's plan is
-- Ultimate+ — same pattern as 025_secure_store_columns.sql.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION enforce_product_badges_plan()
RETURNS TRIGGER AS $$
DECLARE
  owner_plan TEXT;
BEGIN
  IF NEW.badges IS NULL OR array_length(NEW.badges, 1) IS NULL THEN
    NEW.badges := '{}';
    RETURN NEW;
  END IF;

  SELECT plan INTO owner_plan FROM stores WHERE id = NEW.store_id;

  IF owner_plan IS NULL OR owner_plan NOT IN
     ('ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure')
  THEN
    NEW.badges := '{}';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_product_badges_plan ON products;
CREATE TRIGGER trg_enforce_product_badges_plan
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_product_badges_plan();
