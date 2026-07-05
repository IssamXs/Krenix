-- ============================================================
-- CRM — CUSTOMER NOTES (Business+)
-- Free-text notes per customer, keyed by (store_id, phone). Customer profiles
-- themselves are derived on the fly by grouping orders by phone.
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  phone       TEXT NOT NULL,
  note        TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customer_notes_store ON customer_notes(store_id);

ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;

-- Store owner reads/writes their own customers' notes.
DROP POLICY IF EXISTS "Owner manages customer notes" ON customer_notes;
CREATE POLICY "Owner manages customer notes"
  ON customer_notes FOR ALL
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = customer_notes.store_id AND stores.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM stores WHERE stores.id = customer_notes.store_id AND stores.owner_id = auth.uid()));
