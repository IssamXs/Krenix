-- ============================================================
-- 057 — Site Builder Phase 1: site_pages table
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: freeform drag-and-drop custom pages (Ultimate+), separate from
-- landing_pages (AI-generated) and the homepage editor. `blocks` is the
-- draft tree autosaved while editing; `published_blocks` is a snapshot
-- copied over only when the owner clicks Publier, so the live storefront
-- never shows an in-progress edit.
-- ============================================================

CREATE TABLE IF NOT EXISTS site_pages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  title             TEXT NOT NULL,
  slug              TEXT NOT NULL,
  blocks            JSONB NOT NULL DEFAULT '[]',
  published_blocks  JSONB,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  meta_title        TEXT,
  meta_description  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, slug)
);

ALTER TABLE site_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can manage own site pages"
  ON site_pages FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Public can read published site pages"
  ON site_pages FOR SELECT
  TO anon
  USING (status = 'published');

NOTIFY pgrst, 'reload schema';
