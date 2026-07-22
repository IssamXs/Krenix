-- ============================================================
-- 033 — Security hardening: order input validation + price integrity,
-- rate limiting infra, login lockout.
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
-- ============================================================

-- ---------- Order validation + price-integrity trigger ----------
-- The "Public can place orders" RLS policy (002_rls.sql) is WITH CHECK (TRUE) —
-- any anonymous client can insert ANY row, including a forged unit_price/
-- total_price that bypasses the React form entirely (devtools/raw API call).
-- This trigger normalizes + validates format server-side, and recomputes the
-- price from the trusted products row so a tampered client-submitted price can
-- never be trusted. Runs on INSERT only — legitimate authenticated edits by the
-- store owner (status changes, manual price adjustments) are untouched.
CREATE OR REPLACE FUNCTION validate_order_insert()
RETURNS TRIGGER AS $$
DECLARE
  real_price DECIMAL(10,2);
BEGIN
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

DROP TRIGGER IF EXISTS trg_validate_order_insert ON orders;
CREATE TRIGGER trg_validate_order_insert
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION validate_order_insert();

-- ---------- Order-spam guard ----------
-- Anonymous inserts have no IP to key on at the Postgres level, so the
-- practical DB-side throttle is: block the same phone number from placing
-- more than 5 orders at the same store within 10 minutes.
CREATE OR REPLACE FUNCTION guard_order_spam()
RETURNS TRIGGER AS $$
DECLARE recent_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO recent_count
  FROM orders
  WHERE store_id = NEW.store_id
    AND customer_phone = NEW.customer_phone
    AND created_at > NOW() - INTERVAL '10 minutes';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Trop de commandes récentes pour ce numéro. Réessayez plus tard.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_order_spam ON orders;
CREATE TRIGGER trg_guard_order_spam
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION guard_order_spam();

-- ---------- Rate limiting infra (used by server API routes) ----------
-- Fixed-window counter, keyed by an arbitrary string (e.g. "chatbot:<ip>" or
-- "price-suggestion:<userId>"). Only ever touched via the service-role admin
-- client from server code — no public RLS policy is needed or granted.
CREATE TABLE IF NOT EXISTS rate_limits (
  key          TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION bump_rate_limit(p_key TEXT, p_window_start TIMESTAMPTZ)
RETURNS INTEGER AS $$
DECLARE new_count INTEGER;
BEGIN
  INSERT INTO rate_limits (key, window_start, count)
  VALUES (p_key, p_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
  RETURNING count INTO new_count;

  -- Opportunistic cleanup (~2% of calls) — no cron needed, table stays small.
  IF random() < 0.02 THEN
    DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
  END IF;

  RETURN new_count;
END;
$$ LANGUAGE plpgsql;

-- ---------- Login lockout ----------
-- Supabase Auth's own GoTrue backend already rate-limits sign-in attempts per
-- IP, but that's bypassed by a distributed attempt across many IPs against one
-- account. This adds a per-EMAIL lockout, checked/recorded by the login page
-- via a server route (src/app/api/auth/lockout) — never touched client-side.
CREATE TABLE IF NOT EXISTS login_attempts (
  email        TEXT PRIMARY KEY,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
