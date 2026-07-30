-- ============================================================
-- Per-product preferred delivery society. Optional default courier for a
-- product — when shipping an order for it, the ship button pre-selects this
-- provider instead of asking every time. Purely a default: the merchant can
-- still override per-order via the existing provider picker.
-- ============================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS preferred_delivery_provider TEXT;
