-- ============================================================
-- In-app notifications (dashboard bell). Referenced by
-- src/app/api/notifications/route.ts and NotificationBell.tsx since an
-- earlier session, but never captured in a migration — this closes that gap.
--
-- The table may already exist in your DB with only the original columns
-- (created directly via Supabase Studio, not through a migration file), so
-- CREATE TABLE IF NOT EXISTS alone would silently skip adding new columns —
-- every column below is backfilled with ADD COLUMN IF NOT EXISTS so this
-- migration is safe to run whether the table is brand new or pre-existing.
--
-- dedupe_key lets recurring/derived alerts (e.g. low-stock) be upserted
-- idempotently: re-running the same alert doesn't reset is_read or spam a
-- second row, and the app can safely delete-and-reinsert to resolve one.
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE INDEX IF NOT EXISTS notifications_store_id_idx ON notifications(store_id);
CREATE INDEX IF NOT EXISTS notifications_store_unread_idx ON notifications(store_id, is_read);
-- Plain (non-partial) unique index: Postgres never considers NULL = NULL, so
-- regular notifications (dedupe_key NULL) coexist freely, while rows with a
-- real dedupe_key (e.g. stock alerts) get idempotent upserts. A partial index
-- here would NOT be usable by supabase-js's upsert(onConflict: '...').
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications(store_id, dedupe_key);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner manages notifications" ON notifications;
CREATE POLICY "Store owner manages notifications" ON notifications FOR ALL
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = notifications.store_id AND stores.owner_id = auth.uid()));
