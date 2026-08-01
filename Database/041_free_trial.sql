-- ============================================================
-- 041 — 2-DAY FREE TRIAL
-- New stores (if it's the owner's first store) start ACTIVE and 
-- automatically get a 2-day free trial subscription.
-- If the owner creates a second store, it starts INACTIVE (no trial).
-- ============================================================

CREATE OR REPLACE FUNCTION default_store_columns()
RETURNS TRIGGER AS $$
DECLARE
  inherited_active BOOLEAN;
  has_any_store BOOLEAN;
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

  -- Does the user have ANY existing stores?
  has_any_store := EXISTS (
    SELECT 1 FROM stores WHERE owner_id = NEW.owner_id
  );

  IF NOT inherited_active THEN
    NEW.plan := 'basic';
  END IF;

  IF inherited_active THEN
    NEW.subscription_status := 'active';
    NEW.ai_credits := 0; -- the AI-credit pool lives on the owner's primary store
  ELSE
    IF NOT has_any_store THEN
      -- First-ever store: grant 2-day free trial access
      NEW.subscription_status := 'active';
    ELSE
      -- Additional store on basic plan: locked out until payment
      NEW.subscription_status := 'inactive';
    END IF;
    NEW.ai_credits := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to actually insert the 2-day subscription record
CREATE OR REPLACE FUNCTION grant_free_trial()
RETURNS TRIGGER AS $$
DECLARE
  has_other_store BOOLEAN;
BEGIN
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Inside AFTER INSERT, the new store is already inserted, so count > 1 means they had a prior store.
  SELECT (COUNT(*) > 1) INTO has_other_store FROM stores WHERE owner_id = NEW.owner_id;

  IF NEW.plan = 'basic' AND NEW.subscription_status = 'active' AND NOT has_other_store THEN
    INSERT INTO subscriptions (store_id, plan, status, expires_at)
    VALUES (NEW.id, 'basic', 'active', (NOW() + INTERVAL '2 days'));
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_grant_free_trial ON stores;
CREATE TRIGGER trg_grant_free_trial
  AFTER INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION grant_free_trial();
