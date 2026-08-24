-- ============================================================
-- 062 — Multiple shipments per order
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: orders.tracking_number/delivery_provider/delivery_label_url only ever
-- held ONE shipment, so the ship route hard-blocked re-shipping an order that
-- already had a tracking number. Merchants need to be able to create another
-- parcel for the same order (a courier mistake, a split shipment, a correction
-- after a bug) without losing the record of the earlier attempt.
--
-- order_shipments keeps the full history; orders.tracking_number/
-- delivery_provider/delivery_label_url keep pointing at the MOST RECENT
-- shipment so every existing dashboard list/badge/WhatsApp template keeps
-- working unchanged.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_shipments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,
  tracking_number  TEXT,
  label_url        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_shipments_order_id_idx ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS order_shipments_store_id_idx ON order_shipments(store_id);

ALTER TABLE order_shipments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner manages order shipments" ON order_shipments;
CREATE POLICY "Store owner manages order shipments" ON order_shipments FOR ALL
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = order_shipments.store_id AND stores.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM stores WHERE stores.id = order_shipments.store_id AND stores.owner_id = auth.uid()));

-- Backfill: every order that already has a tracking_number gets one history row,
-- so existing shipments show up in the new history list instead of appearing empty.
INSERT INTO order_shipments (order_id, store_id, provider, tracking_number, label_url, created_at)
SELECT id, store_id, COALESCE(delivery_provider, 'yalidine'), tracking_number, delivery_label_url, updated_at
FROM orders
WHERE tracking_number IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM order_shipments os WHERE os.order_id = orders.id);

NOTIFY pgrst, 'reload schema';
