-- ============================================================
-- 026 — ACTIVATION PAYWALL
-- New stores start LOCKED (subscription_status = 'inactive') until the
-- customer pays their plan (Basic = 15 000 DZD one-time) and the super admin
-- confirms it in /super-admin/payments. The dashboard checks this status and
-- redirects unpaid accounts to /activate instead of the real dashboard.
--
-- Redefines default_store_columns() from migration 025 (safe to run whether
-- or not 025 has already run — CREATE OR REPLACE + DROP/CREATE TRIGGER handle
-- both cases). Idempotent. Paste into Supabase → SQL Editor → Run.
-- ============================================================

CREATE OR REPLACE FUNCTION default_store_columns()
RETURNS TRIGGER AS $$
DECLARE
  inherited_active BOOLEAN;
BEGIN
  -- Server (service_role key, e.g. demo-store seeding) and super admins
  -- (manually creating/comping a store) may set anything.
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  NEW.purchased_credits      := 0;
  NEW.purchased_chatbot      := 0;
  NEW.chatbot_daily_limit    := 0;
  NEW.is_suspended           := FALSE;
  NEW.custom_domain_verified := FALSE;

  -- Does the owner already hold an ACTIVE, paid store on this same plan?
  -- (Agency owners adding a 2nd/3rd boutique inherit trust — no repeat payment.)
  inherited_active := NEW.plan IS DISTINCT FROM 'basic' AND EXISTS (
    SELECT 1 FROM stores
    WHERE owner_id = NEW.owner_id AND plan = NEW.plan AND subscription_status = 'active'
  );

  IF NOT inherited_active THEN
    NEW.plan := 'basic';
  END IF;

  IF inherited_active THEN
    NEW.subscription_status := 'active';
    NEW.ai_credits := 0; -- the AI-credit pool lives on the owner's primary store
  ELSE
    -- First-ever store, or a plan the owner hasn't actually paid for yet:
    -- locked out of the dashboard until the activation payment is confirmed.
    NEW.subscription_status := 'inactive';
    NEW.ai_credits := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_default_store_columns ON stores;
CREATE TRIGGER trg_default_store_columns
  BEFORE INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION default_store_columns();
