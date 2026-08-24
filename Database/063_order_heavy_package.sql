-- ============================================================
-- 063 — Heavy package flag moves to the order, not just the product
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: is_heavy (061) lived on the PRODUCT, so a normally-light item ordered
-- in bulk (5-6 units bagged into one parcel for one tracking number) had no
-- way to be flagged over 5kg — the product itself is light, only this
-- particular order's quantity makes it heavy. Moves the authoritative flag to
-- orders.is_heavy, defaulted from the product's is_heavy at order-creation
-- time (so genuinely heavy single-unit products still default correctly),
-- but now editable per order in the dashboard regardless of quantity.
-- ============================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_heavy BOOLEAN NOT NULL DEFAULT FALSE;

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

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
