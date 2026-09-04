-- ============================================================
-- 070 — Order edit: "livraison gratuite" (free delivery) + "remise" (discount)
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
--
-- Two independent adjustments a merchant can apply from the order detail
-- modal's edit form (see src/app/(platform)/dashboard/orders/page.tsx and
-- src/app/api/orders/[id]/route.ts → update_order()):
--
--   free_delivery   — the merchant absorbs the courier fee. delivery_price
--                     still stores the REAL fee (what's being waived / paid
--                     out of pocket); total_price simply stops including it.
--                     The finance view store_order_stats.delivered_margin_
--                     revenue = SUM(total_price - delivery_price) then nets
--                     to (goods - remise - absorbed_delivery) automatically,
--                     no analytics change needed (see 054_dashboard_aggregates).
--                     The courier COD is lowered in the ship route; the
--                     Yalidine/WeCan `freeshipping` flag stays false.
--
--   discount        — a negotiated price cut, stored itemised so the detail
--                     modal can render a "Remise −X DA" line instead of an
--                     opaque total override. discount_type is 'amount' (flat
--                     DZD) or 'percent' (of the goods subtotal); discount_value
--                     is the raw number the merchant typed; discount_amount is
--                     the resolved DZD figure actually subtracted.
--
--   total_price = goods_subtotal
--               - discount_amount
--               + (CASE WHEN free_delivery THEN 0 ELSE delivery_price END)
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS free_delivery  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_type   TEXT;            -- 'amount' | 'percent' | NULL
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_value  NUMERIC NOT NULL DEFAULT 0;  -- raw entered value
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC NOT NULL DEFAULT 0;  -- resolved DZD subtracted

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_discount_type_check;
ALTER TABLE orders ADD  CONSTRAINT orders_discount_type_check
  CHECK (discount_type IS NULL OR discount_type IN ('amount', 'percent'));

-- update_order() gains three optional parameters. The parameter list changes,
-- so the old signature must be dropped before the new one is created (CREATE OR
-- REPLACE cannot alter a function's argument list).
DROP FUNCTION IF EXISTS update_order(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, JSONB);

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
  p_items JSONB,                       -- [{product_id, color, size, quantity}]
  p_free_delivery BOOLEAN DEFAULT FALSE,
  p_discount_type TEXT DEFAULT NULL,   -- 'amount' | 'percent' | NULL
  p_discount_value NUMERIC DEFAULT 0
) RETURNS orders AS $$
DECLARE
  v_order orders;
  v_item JSONB;
  v_product RECORD;
  v_subtotal NUMERIC;
  v_total NUMERIC := 0;               -- goods subtotal (offers honoured)
  v_qty_sum INTEGER := 0;
  v_clamped_delivery NUMERIC;
  v_any_heavy BOOLEAN := FALSE;
  v_item_count INTEGER := 0;
  v_phone TEXT;
  v_discount_amount NUMERIC := 0;
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

  IF p_discount_type IS NOT NULL AND p_discount_type NOT IN ('amount', 'percent') THEN
    RAISE EXCEPTION 'Type de remise invalide';
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

  -- Resolve the remise against the goods subtotal, clamped to [0, goods].
  IF p_discount_type = 'percent' THEN
    v_discount_amount := round(v_total * GREATEST(COALESCE(p_discount_value, 0), 0) / 100);
  ELSIF p_discount_type = 'amount' THEN
    v_discount_amount := GREATEST(COALESCE(p_discount_value, 0), 0);
  END IF;
  v_discount_amount := LEAST(v_discount_amount, v_total);

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
    free_delivery = COALESCE(p_free_delivery, FALSE),
    discount_type = p_discount_type,
    discount_value = GREATEST(COALESCE(p_discount_value, 0), 0),
    discount_amount = v_discount_amount,
    total_price = GREATEST(
      v_total - v_discount_amount + (CASE WHEN COALESCE(p_free_delivery, FALSE) THEN 0 ELSE v_clamped_delivery END),
      0
    ),
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
