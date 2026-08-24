-- ============================================================
-- 062 — Cart orders: order_items table + create_cart_order() RPC.
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
--
-- WHY a stored function instead of two client-side inserts: order_items rows
-- can only be inserted after the parent order exists (FK), so a BEFORE INSERT
-- trigger on `orders` (like validate_order_insert) can never see the cart
-- contents to price it. Pricing + both inserts happen here instead, in one
-- transaction, reusing compute_offer_total() from 058_product_offers.sql so
-- offers are honored identically to single-product orders.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  -- Snapshot of the product name at order time — order history must stay
  -- readable even if the product is later renamed or deleted.
  product_name TEXT NOT NULL,
  color TEXT,
  size TEXT,
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 100),
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store owners can read own order items"
  ON order_items FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM orders WHERE store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    )
    OR is_super_admin()
  );

-- No public/anon policy: order_items, like orders, must never be readable by
-- the storefront's anon key (see the comment at the top of
-- src/app/api/orders/route.ts explaining why order creation is server-side).
-- No client-side write policy either — every write goes through
-- create_cart_order() below, called with the service role.

CREATE OR REPLACE FUNCTION create_cart_order(
  p_store_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_wilaya TEXT,
  p_commune TEXT,
  p_delivery_type TEXT,
  p_delivery_price NUMERIC,
  p_notes TEXT,
  p_source TEXT,
  p_fraud_risk_score NUMERIC,
  p_fraud_signals JSONB,
  p_items JSONB -- [{product_id, color, size, quantity}]
) RETURNS orders AS $$
DECLARE
  v_order orders;
  v_item JSONB;
  v_product RECORD;
  v_subtotal NUMERIC;
  v_total NUMERIC := 0;
  v_qty_sum INTEGER := 0;
  v_clamped_delivery NUMERIC;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide';
  END IF;

  v_clamped_delivery := LEAST(GREATEST(COALESCE(p_delivery_price, 0), 0), 5000);

  -- Pass 1: validate every product belongs to this store and sum the total
  -- BEFORE inserting anything.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'quantity') IS NULL OR (v_item->>'quantity')::INTEGER < 1 OR (v_item->>'quantity')::INTEGER > 100 THEN
      RAISE EXCEPTION 'Quantité invalide';
    END IF;
    SELECT id, price, offer_type, offer_config, offer_active INTO v_product
      FROM products WHERE id = (v_item->>'product_id')::UUID AND store_id = p_store_id;
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Produit invalide dans le panier';
    END IF;
    IF v_product.offer_active THEN
      v_subtotal := compute_offer_total(v_product.price, (v_item->>'quantity')::INTEGER, v_product.offer_type, v_product.offer_config);
    ELSE
      v_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
    END IF;
    v_total := v_total + v_subtotal;
    v_qty_sum := v_qty_sum + (v_item->>'quantity')::INTEGER;
  END LOOP;

  -- unit_price is a sentinel 0 here — orders.unit_price is NOT NULL DEFAULT 0
  -- at the schema level and is meaningless for a multi-product order; the
  -- real per-line prices live in order_items.unit_price/subtotal below.
  INSERT INTO orders (
    store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune,
    quantity, unit_price, total_price, delivery_price, delivery_type, status, source, notes,
    fraud_risk_score, fraud_signals
  ) VALUES (
    p_store_id, NULL, NULL, p_customer_name, p_customer_phone, p_wilaya, p_commune,
    v_qty_sum, 0, v_total + v_clamped_delivery, v_clamped_delivery,
    CASE WHEN p_delivery_type = 'desk' THEN 'desk' ELSE 'home' END,
    'pending', p_source, p_notes, p_fraud_risk_score, p_fraud_signals
  ) RETURNING * INTO v_order;

  -- Pass 2: insert the line items now that the parent order exists.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT id, name, price, offer_type, offer_config, offer_active INTO v_product
      FROM products WHERE id = (v_item->>'product_id')::UUID;
    IF v_product.offer_active THEN
      v_subtotal := compute_offer_total(v_product.price, (v_item->>'quantity')::INTEGER, v_product.offer_type, v_product.offer_config);
    ELSE
      v_subtotal := v_product.price * (v_item->>'quantity')::INTEGER;
    END IF;
    INSERT INTO order_items (order_id, product_id, product_name, color, size, quantity, unit_price, subtotal)
    VALUES (
      v_order.id, v_product.id, v_product.name,
      NULLIF(v_item->>'color', ''), NULLIF(v_item->>'size', ''),
      (v_item->>'quantity')::INTEGER, v_product.price, v_subtotal
    );
  END LOOP;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
