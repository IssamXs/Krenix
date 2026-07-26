-- ================================================================
-- 036_authorization_hardening.sql
-- Fixes from the authorization/access-control security audit:
--   1. storage.objects UPDATE/DELETE policies for product-images and
--      store-logos only checked bucket_id — any authenticated user (any
--      store, any plan) could overwrite or delete ANY other store's product
--      photos or logo, since object paths aren't store-prefixed. Scope to
--      the uploader's own object (owner = auth.uid(), which Supabase sets
--      automatically on client-side uploads).
--   2. "Public can update own chatbot sessions" was `USING (TRUE)` for anon —
--      any anonymous caller could rewrite ANY store's chatbot session row
--      (messages, phone, store_id) via a raw REST/JS call. The app itself
--      never uses this policy (chatbot-core.ts always writes through the
--      service-role admin client) — drop it and the equally-unused anon
--      INSERT policy, matching the service-role-only pattern already used
--      for team_members/channel_connections/delivery_integrations.
-- Idempotent — safe to run more than once.
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor).
-- ================================================================

-- ---------- 1. storage.objects: scope writes to the uploader ----------

DROP POLICY IF EXISTS "Authenticated update product-images" ON storage.objects;
CREATE POLICY "Authenticated update product-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "Authenticated delete product-images" ON storage.objects;
CREATE POLICY "Authenticated delete product-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images' AND owner = auth.uid());

DROP POLICY IF EXISTS "Authenticated update store-logos" ON storage.objects;
CREATE POLICY "Authenticated update store-logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'store-logos' AND owner = auth.uid());

-- store-logos had no DELETE policy at all (deny-by-default) — add one scoped
-- the same way, so an owner can delete their own uploaded logo.
DROP POLICY IF EXISTS "Authenticated delete store-logos" ON storage.objects;
CREATE POLICY "Authenticated delete store-logos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'store-logos' AND owner = auth.uid());

-- ---------- 2. chatbot_sessions: remove unused, overly-permissive anon policies ----------

DROP POLICY IF EXISTS "Public can update own chatbot sessions" ON chatbot_sessions;
DROP POLICY IF EXISTS "Public can create chatbot sessions" ON chatbot_sessions;

-- ---------- 3. subscriptions: recompute amount_dzd server-side ----------
-- billing/page.tsx (and activate/page.tsx) insert a manual-payment request
-- with a CLIENT-SIDE `plan` + `amount_dzd` pair — the RLS policy only checks
-- store ownership, not that amount_dzd is the real price for that plan. A
-- store owner could submit plan:'ultimate' with a forged low amount_dzd (or
-- vice versa) to visually mislead whoever reviews the payment proof in
-- /super-admin/payments before confirming. Recompute amount_dzd from the
-- canonical catalog price so the confirm screen always shows the true price,
-- regardless of what the client submitted. 'sur_mesure' has no catalog price
-- (bespoke, negotiated manually) so it's left as submitted.
CREATE OR REPLACE FUNCTION validate_subscription_insert()
RETURNS TRIGGER AS $$
DECLARE
  canonical_price INTEGER;
BEGIN
  canonical_price := CASE NEW.plan
    WHEN 'basic'      THEN 15000
    WHEN 'pro'        THEN 3000
    WHEN 'ultimate'   THEN 9000
    WHEN 'growth'     THEN 12000
    WHEN 'business'   THEN 20000
    WHEN 'agency'     THEN 35000
    WHEN 'enterprise' THEN 60000
    ELSE NULL -- sur_mesure or anything else: no fixed catalog price
  END;

  IF canonical_price IS NOT NULL THEN
    NEW.amount_dzd := canonical_price;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_subscription_insert ON subscriptions;
CREATE TRIGGER trg_validate_subscription_insert
  BEFORE INSERT ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION validate_subscription_insert();

-- ---------- 4. orders: block inserts for suspended/inactive stores at the DB level ----------
-- "Public can place orders" (anon INSERT, WITH CHECK (TRUE)) has no store-status
-- check — src/app/api/orders/route.ts:57-64 already rejects suspended/inactive
-- stores, but that's only enforced by the app's own route. A raw REST/JS call
-- with the public anon key could insert an order directly into a suspended
-- store, bypassing that check entirely. Fold the same rule into the existing
-- validate_order_insert trigger so it's enforced for every insert path.
CREATE OR REPLACE FUNCTION validate_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  real_price DECIMAL(10,2);
  store_row RECORD;
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

  -- Clamp delivery price to a sane bound rather than reject — legitimate
  -- remote-wilaya delivery can be pricier, but not absurdly so.
  NEW.delivery_price := LEAST(GREATEST(COALESCE(NEW.delivery_price, 0), 0), 5000);

  -- Recompute unit/total price from the real product row when one is linked.
  -- A manual/chatbot order with no product_id keeps its server-computed price
  -- from that flow (chatbot-core.ts already prices from the products table).
  IF NEW.product_id IS NOT NULL THEN
    SELECT price INTO real_price FROM products WHERE id = NEW.product_id;
    IF real_price IS NOT NULL THEN
      NEW.unit_price := real_price;
      NEW.total_price := (real_price * NEW.quantity) + NEW.delivery_price;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
