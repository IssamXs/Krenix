-- ============================================================
-- 060 — Photo ↔ color tagging on products
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: photos and colors were unrelated arrays with no link between them.
-- Merchants can now tag each photo with the color it depicts so the
-- storefront gallery and color picker stay in sync (click a photo → its
-- color is selected; pick a color → the gallery jumps to a matching photo).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_colors JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
