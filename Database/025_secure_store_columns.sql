-- ============================================================
-- 025 — SECURITY: stop store owners from self-granting plans / credits
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: the "Users can update own store" RLS policy lets an owner UPDATE any
-- column of their own store — including plan, ai_credits, chatbot_daily_limit and
-- the purchased_* top-up balances. A user could open the browser console and
-- self-grant Enterprise + unlimited credits, bypassing all payments.
--
-- FIX: BEFORE-triggers that let ONLY the service role (server API routes) and
-- super admins touch those "money/trust" columns. Normal owners keep full control
-- of everything else (name, slug, logo, theme, settings, custom_domain, …).
-- ============================================================

-- Block owner UPDATES to protected columns.
CREATE OR REPLACE FUNCTION protect_store_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Server (service_role key) and super admins may change anything.
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.plan                   IS DISTINCT FROM OLD.plan
  OR NEW.ai_credits             IS DISTINCT FROM OLD.ai_credits
  OR NEW.chatbot_daily_limit    IS DISTINCT FROM OLD.chatbot_daily_limit
  OR NEW.purchased_credits      IS DISTINCT FROM OLD.purchased_credits
  OR NEW.purchased_chatbot      IS DISTINCT FROM OLD.purchased_chatbot
  OR NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status
  OR NEW.is_suspended           IS DISTINCT FROM OLD.is_suspended
  OR NEW.custom_domain_verified IS DISTINCT FROM OLD.custom_domain_verified
  THEN
    RAISE EXCEPTION 'Modification of protected store columns is not allowed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_store_columns ON stores;
CREATE TRIGGER trg_protect_store_columns
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION protect_store_columns();

-- Force safe defaults on owner INSERTS so a store can't be born premium.
CREATE OR REPLACE FUNCTION default_store_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  NEW.purchased_credits      := 0;
  NEW.purchased_chatbot      := 0;
  NEW.chatbot_daily_limit    := 0;
  NEW.is_suspended           := FALSE;
  NEW.custom_domain_verified := FALSE;
  NEW.subscription_status    := COALESCE(NEW.subscription_status, 'active');

  -- Plan: only 'basic', OR a plan the owner already holds (Agency 2nd boutique
  -- inherits the paid plan). Anything else is downgraded to 'basic'.
  IF NEW.plan IS DISTINCT FROM 'basic'
     AND NOT EXISTS (SELECT 1 FROM stores WHERE owner_id = NEW.owner_id AND plan = NEW.plan)
  THEN
    NEW.plan := 'basic';
  END IF;

  -- Credits: a first Basic store gets ≤5 (trial); inherited premium stores get 0
  -- (the AI-credit pool lives on the owner's primary store).
  IF NEW.plan = 'basic' THEN
    NEW.ai_credits := LEAST(COALESCE(NEW.ai_credits, 5), 5);
  ELSE
    NEW.ai_credits := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_default_store_columns ON stores;
CREATE TRIGGER trg_default_store_columns
  BEFORE INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION default_store_columns();
