-- ============================================================
-- 057 — Product offers (buy X get Y free, % off, bundles, tiers)
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: store owners pick one promotional offer per product from 10 curated
-- presets (see src/lib/offers.ts for the canonical list). The chosen offer
-- is stored as (offer_type, offer_config) — generic enough to cover all 6
-- underlying calculation types with one schema. As with pricing generally
-- (see 036_authorization_hardening.sql), the client is never trusted for the
-- final price: validate_order_insert already re-derives unit_price/total_price
-- from the products table on every order insert, so it's extended here to
-- also apply the active offer via compute_offer_total(), which mirrors the
-- TypeScript computeOfferPrice() in src/lib/offers.ts formula-for-formula.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_type TEXT
  CHECK (offer_type IS NULL OR offer_type IN (
    'buy_x_get_y_free', 'buy_x_get_percent_off', 'nth_item_percent_off',
    'bundle_fixed_price', 'flat_percent_off', 'tiered_discount'
  ));
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_config JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_label TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS offer_active BOOLEAN NOT NULL DEFAULT false;
-- no plan gate — offers are available on all plans (explicit product decision, not an oversight)

-- ---------- compute_offer_total: single source of truth for server-side pricing ----------
-- Mirrors computeOfferPrice() in src/lib/offers.ts. Any change to one MUST be
-- mirrored in the other — see the comment at the top of that file.
CREATE OR REPLACE FUNCTION compute_offer_total(
  unit_price NUMERIC, qty INTEGER, offer_type TEXT, offer_config JSONB
) RETURNS NUMERIC AS $$
DECLARE
  buy_qty INTEGER;
  free_qty INTEGER;
  percent_off NUMERIC;
  nth INTEGER;
  bundle_qty INTEGER;
  bundle_price NUMERIC;
  group_size INTEGER;
  groups INTEGER;
  remainder INTEGER;
  payable INTEGER;
  discounted_units INTEGER;
  full_units INTEGER;
  tier JSONB;
  best_min_qty INTEGER;
  best_percent NUMERIC;
  t_min INTEGER;
  t_pct NUMERIC;
BEGIN
  IF offer_type IS NULL OR offer_config IS NULL THEN
    RETURN unit_price * qty;
  END IF;

  IF offer_type = 'buy_x_get_y_free' THEN
    buy_qty := (offer_config->>'buyQty')::INTEGER;
    free_qty := (offer_config->>'freeQty')::INTEGER;
    IF buy_qty IS NULL OR free_qty IS NULL OR buy_qty < 1 OR free_qty < 1 THEN
      RETURN unit_price * qty;
    END IF;
    group_size := buy_qty + free_qty;
    groups := FLOOR(qty::NUMERIC / group_size);
    payable := qty - (groups * free_qty);
    RETURN ROUND(payable * unit_price);

  ELSIF offer_type = 'buy_x_get_percent_off' THEN
    buy_qty := (offer_config->>'buyQty')::INTEGER;
    percent_off := (offer_config->>'percentOff')::NUMERIC;
    IF buy_qty IS NULL OR percent_off IS NULL OR qty < buy_qty THEN
      RETURN unit_price * qty;
    END IF;
    percent_off := GREATEST(0, LEAST(100, percent_off));
    RETURN ROUND(unit_price * qty * (1 - percent_off / 100));

  ELSIF offer_type = 'nth_item_percent_off' THEN
    nth := (offer_config->>'nth')::INTEGER;
    percent_off := (offer_config->>'percentOff')::NUMERIC;
    IF nth IS NULL OR nth < 2 OR percent_off IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    percent_off := GREATEST(0, LEAST(100, percent_off));
    discounted_units := FLOOR(qty::NUMERIC / nth);
    full_units := qty - discounted_units;
    RETURN ROUND(full_units * unit_price + discounted_units * unit_price * (1 - percent_off / 100));

  ELSIF offer_type = 'bundle_fixed_price' THEN
    bundle_qty := (offer_config->>'bundleQty')::INTEGER;
    bundle_price := (offer_config->>'bundlePrice')::NUMERIC;
    IF bundle_qty IS NULL OR bundle_qty < 1 OR bundle_price IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    bundle_price := GREATEST(0, bundle_price);
    groups := FLOOR(qty::NUMERIC / bundle_qty);
    remainder := qty - (groups * bundle_qty);
    RETURN ROUND(groups * bundle_price + remainder * unit_price);

  ELSIF offer_type = 'flat_percent_off' THEN
    percent_off := (offer_config->>'percentOff')::NUMERIC;
    IF percent_off IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    percent_off := GREATEST(0, LEAST(100, percent_off));
    RETURN ROUND(unit_price * qty * (1 - percent_off / 100));

  ELSIF offer_type = 'tiered_discount' THEN
    IF offer_config->'tiers' IS NULL OR jsonb_typeof(offer_config->'tiers') != 'array' THEN
      RETURN unit_price * qty;
    END IF;
    best_min_qty := NULL;
    best_percent := NULL;
    FOR tier IN SELECT * FROM jsonb_array_elements(offer_config->'tiers')
    LOOP
      t_min := (tier->>'minQty')::INTEGER;
      t_pct := GREATEST(0, LEAST(100, (tier->>'percentOff')::NUMERIC));
      IF qty >= t_min AND (best_min_qty IS NULL OR t_min > best_min_qty) THEN
        best_min_qty := t_min;
        best_percent := t_pct;
      END IF;
    END LOOP;
    IF best_percent IS NULL THEN
      RETURN unit_price * qty;
    END IF;
    RETURN ROUND(unit_price * qty * (1 - best_percent / 100));

  ELSE
    RETURN unit_price * qty;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ---------- validate_order_insert: apply the active offer when pricing ----------
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

  IF NEW.quantity IS NULL OR NEW.quantity < 1 OR NEW.quantity > 100 THEN
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
