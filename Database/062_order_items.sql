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

-- Postgres has no CREATE POLICY IF NOT EXISTS — without this DROP, a second
-- paste of this file (e.g. to re-apply a fix to create_cart_order further
-- down) errors out here and rolls back the whole batch before ever reaching
-- the function redefinition below.
DROP POLICY IF EXISTS "Store owners can read own order items" ON order_items;
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
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier';
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

-- ---------- validate_order_insert: raise the quantity ceiling for cart orders ----------
-- The original 1-100 ceiling (058_product_offers.sql) was designed as an
-- anti-abuse cap on a SINGLE product's quantity. A cart order stores the SUM
-- of every line's quantity in orders.quantity (see create_cart_order above),
-- so a legitimate cart of a few different products can easily exceed 100
-- combined units even though every individual line stayed well within
-- create_cart_order's own per-line 1-100 check (and order_items' matching
-- CHECK constraint). Cart orders are identified by product_id IS NULL (never
-- true for a single-product order) — only their ceiling is relaxed; the
-- single-product path keeps the original 100-unit cap unchanged.
CREATE OR REPLACE FUNCTION validate_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  real_price DECIMAL(10,2);
  store_row RECORD;
  prod_offer_type TEXT;
  prod_offer_config JSONB;
  prod_offer_active BOOLEAN;
BEGIN
  SELECT is_suspended, subscription_status INTO store_row FROM stores WHERE id = NEW.store_id;
  IF store_row IS NULL OR store_row.is_suspended OR store_row.subscription_status != 'active' THEN
    RAISE EXCEPTION 'Boutique indisponible';
  END IF;

  NEW.customer_phone := regexp_replace(NEW.customer_phone, '\s', '', 'g');
  IF NEW.customer_phone !~ '^(05|06|07)[0-9]{8}$' THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide';
  END IF;

  IF NEW.wilaya IS NULL OR length(trim(NEW.wilaya)) = 0 THEN
    RAISE EXCEPTION 'Wilaya requise';
  END IF;

  IF NEW.commune IS NULL OR length(trim(NEW.commune)) = 0 THEN
    RAISE EXCEPTION 'Commune requise';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR (NEW.product_id IS NOT NULL AND NEW.quantity > 100) OR (NEW.product_id IS NULL AND NEW.quantity > 5000) THEN
    RAISE EXCEPTION 'Quantité invalide';
  END IF;

  IF length(NEW.customer_name) > 100 OR length(NEW.commune) > 100 THEN
    RAISE EXCEPTION 'Champ trop long';
  END IF;
  IF NEW.notes IS NOT NULL AND length(NEW.notes) > 1000 THEN
    RAISE EXCEPTION 'Notes trop longues';
  END IF;

  NEW.delivery_price := LEAST(GREATEST(COALESCE(NEW.delivery_price, 0), 0), 5000);

  IF NEW.product_id IS NOT NULL THEN
    SELECT price, offer_type, offer_config, offer_active
      INTO real_price, prod_offer_type, prod_offer_config, prod_offer_active
      FROM products WHERE id = NEW.product_id;
    IF real_price IS NOT NULL THEN
      NEW.unit_price := real_price;
      IF prod_offer_active THEN
        NEW.total_price := compute_offer_total(real_price, NEW.quantity, prod_offer_type, prod_offer_config) + NEW.delivery_price;
      ELSE
        NEW.total_price := (real_price * NEW.quantity) + NEW.delivery_price;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
