-- ============================================================
-- 067 — Order editing: order_edits log table + update_order() RPC.
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
--
-- WHY a stored function instead of client-side order_items writes: order_items
-- has no client write policy (see 065_order_items.sql) — only
-- create_cart_order(), called with the service role, can write it. Editing an
-- order's product lines needs the same privilege, so update_order() below is
-- called the same way: from a server API route (which has already verified
-- the requesting user owns the order's store) using the admin client.
--
-- Every edited order is normalized to use order_items (even a single-product
-- order gets one row) so the existing cart-order code paths (stock adjustment
-- in orders/page.tsx, the courier product-list builder in
-- api/integrations/delivery/ship) apply uniformly. When there's exactly one
-- line, the legacy orders.product_id/color/size/unit_price columns are also
-- kept in sync for anything that still reads them directly; a multi-item
-- result nulls them out, exactly like create_cart_order() already does.
--
-- Stock reconciliation for the edit happens in the calling API route (TS),
-- NOT here — it needs the same per-colour/per-size delta math already
-- implemented in lib/variants.ts (applyVariantDelta), which would otherwise
-- have to be duplicated in plpgsql. This function only replaces order_items,
-- recomputes pricing (reusing compute_offer_total so offers stay honored),
-- and updates the customer/delivery fields.
-- ============================================================

CREATE TABLE IF NOT EXISTS order_edits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  -- Structured diff, e.g. {"quantity": {"from": 2, "to": 3}, "total_price": {"from": 4000, "to": 5000}}
  changes JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_edits_order_id_idx ON order_edits(order_id);

ALTER TABLE order_edits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner manages order edits" ON order_edits;
CREATE POLICY "Store owner manages order edits" ON order_edits FOR ALL
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = order_edits.store_id AND stores.owner_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM stores WHERE stores.id = order_edits.store_id AND stores.owner_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_order(
  p_order_id UUID,
  p_store_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_wilaya TEXT,
  p_commune TEXT,
  p_address TEXT,
  p_delivery_type TEXT,
  p_delivery_price NUMERIC,
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
  v_item_count INTEGER := 0;
  v_phone TEXT;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id AND store_id = p_store_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Commande introuvable';
  END IF;

  v_phone := regexp_replace(COALESCE(p_customer_phone, ''), '\s', '', 'g');
  IF v_phone !~ '^(05|06|07)[0-9]{8}$' THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide';
  END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) = 0 THEN
    RAISE EXCEPTION 'Nom du client requis';
  END IF;
  IF p_wilaya IS NULL OR length(trim(p_wilaya)) = 0 THEN
    RAISE EXCEPTION 'Wilaya requise';
  END IF;
  IF p_commune IS NULL OR length(trim(p_commune)) = 0 THEN
    RAISE EXCEPTION 'Commune requise';
  END IF;
  IF length(p_customer_name) > 100 OR length(p_commune) > 100 THEN
    RAISE EXCEPTION 'Champ trop long';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La commande doit contenir au moins un produit';
  END IF;
  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Trop d''articles dans la commande';
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
      RAISE EXCEPTION 'Produit invalide';
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
    v_item_count := v_item_count + 1;
  END LOOP;

  -- Pass 2: replace the line items now validation has passed for all of them.
  DELETE FROM order_items WHERE order_id = p_order_id;

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
      p_order_id, v_product.id, v_product.name,
      NULLIF(v_item->>'color', ''), NULLIF(v_item->>'size', ''),
      (v_item->>'quantity')::INTEGER, v_product.price, v_subtotal
    );
  END LOOP;

  UPDATE orders SET
    customer_name = trim(p_customer_name),
    customer_phone = v_phone,
    wilaya = p_wilaya,
    commune = trim(p_commune),
    address = NULLIF(trim(COALESCE(p_address, '')), ''),
    delivery_type = CASE WHEN p_delivery_type = 'desk' THEN 'desk' ELSE 'home' END,
    delivery_price = v_clamped_delivery,
    quantity = v_qty_sum,
    total_price = v_total + v_clamped_delivery,
    is_heavy = v_any_heavy,
    product_id = CASE WHEN v_item_count = 1 THEN (p_items->0->>'product_id')::UUID ELSE NULL END,
    color = CASE WHEN v_item_count = 1 THEN NULLIF(p_items->0->>'color', '') ELSE NULL END,
    size = CASE WHEN v_item_count = 1 THEN NULLIF(p_items->0->>'size', '') ELSE NULL END,
    unit_price = CASE WHEN v_item_count = 1 THEN (SELECT price FROM products WHERE id = (p_items->0->>'product_id')::UUID) ELSE 0 END,
    updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_order;

  RETURN v_order;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
