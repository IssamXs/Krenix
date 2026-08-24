-- ============================================================
-- 066 — Reconcile validate_order_insert() + create_cart_order() after two
-- independent features both redefined the same trigger function.
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: 063_order_heavy_package.sql (main) and 065_order_items.sql (this
-- branch) both CREATE OR REPLACE FUNCTION validate_order_insert() with
-- different bodies — 063 adds order-level is_heavy defaulting from the
-- product, 065 relaxes the 1-100 quantity ceiling for cart orders
-- (product_id IS NULL). CREATE OR REPLACE fully replaces a function; it does
-- not merge two versions. Whichever migration is pasted into Supabase LAST
-- wins and silently drops the other's change. This migration is the single
-- final version with BOTH changes, meant to be pasted after both 063 and
-- 065 regardless of which order they were run in.
--
-- Also extends create_cart_order() (065) to set orders.is_heavy for cart
-- orders: true if ANY line item's product is flagged heavy, since a cart
-- checkout has no single product_id for validate_order_insert's own
-- is_heavy-from-product logic to apply to.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  real_price DECIMAL(10,2);
  store_row RECORD;
  prod_offer_type TEXT;
  prod_offer_config JSONB;
  prod_offer_active BOOLEAN;
  prod_is_heavy BOOLEAN;
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

  -- From 065_order_items.sql: a cart order stores the SUM of every line's
  -- quantity here, so a legitimate multi-product cart can exceed 100
  -- combined units even though every individual line stayed within
  -- create_cart_order's own per-line 1-100 check. Only cart orders
  -- (product_id IS NULL) get the relaxed ceiling.
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
    SELECT price, offer_type, offer_config, offer_active, is_heavy
      INTO real_price, prod_offer_type, prod_offer_config, prod_offer_active, prod_is_heavy
      FROM products WHERE id = NEW.product_id;
    IF real_price IS NOT NULL THEN
      NEW.unit_price := real_price;
      IF prod_offer_active THEN
        NEW.total_price := compute_offer_total(real_price, NEW.quantity, prod_offer_type, prod_offer_config) + NEW.delivery_price;
      ELSE
        NEW.total_price := (real_price * NEW.quantity) + NEW.delivery_price;
      END IF;
    END IF;
    NEW.is_heavy := COALESCE(prod_is_heavy, FALSE);
  END IF;
  -- NEW.is_heavy for a cart order (product_id IS NULL) is set by
  -- create_cart_order() itself below, since it already has each line's
  -- product row in scope and this trigger has no per-line data to check.

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------- create_cart_order(): also compute is_heavy across all lines ----------
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
  v_any_heavy BOOLEAN := FALSE;
BEGIN
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Trop d''articles dans le panier';
  END IF;

  v_clamped_delivery := LEAST(GREATEST(COALESCE(p_delivery_price, 0), 0), 5000);

  -- Pass 1: validate every product belongs to this store, sum the total, and
  -- note whether any line's product is flagged heavy.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'quantity') IS NULL OR (v_item->>'quantity')::INTEGER < 1 OR (v_item->>'quantity')::INTEGER > 100 THEN
      RAISE EXCEPTION 'Quantité invalide';
    END IF;
    SELECT id, price, offer_type, offer_config, offer_active, is_heavy INTO v_product
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
    IF COALESCE(v_product.is_heavy, FALSE) THEN
      v_any_heavy := TRUE;
    END IF;
  END LOOP;

  -- unit_price is a sentinel 0 here — orders.unit_price is NOT NULL DEFAULT 0
  -- at the schema level and is meaningless for a multi-product order; the
  -- real per-line prices live in order_items.unit_price/subtotal below.
  INSERT INTO orders (
    store_id, product_id, landing_page_id, customer_name, customer_phone, wilaya, commune,
    quantity, unit_price, total_price, delivery_price, delivery_type, status, source, notes,
    fraud_risk_score, fraud_signals, is_heavy
  ) VALUES (
    p_store_id, NULL, NULL, p_customer_name, p_customer_phone, p_wilaya, p_commune,
    v_qty_sum, 0, v_total + v_clamped_delivery, v_clamped_delivery,
    CASE WHEN p_delivery_type = 'desk' THEN 'desk' ELSE 'home' END,
    'pending', p_source, p_notes, p_fraud_risk_score, p_fraud_signals, v_any_heavy
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
