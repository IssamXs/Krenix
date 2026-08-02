-- Migration 037: Allow the newer tiers on the plan CHECK constraints
--
-- 001_schema.sql pinned stores.plan and subscriptions.plan to
-- ('basic','pro','ultimate','sur_mesure'). 007_new_tiers.sql added the
-- growth/business/agency/enterprise tiers everywhere in code and in plan_config
-- but LEFT THE CHECK CONSTRAINTS UNTOUCHED (the ALTER TYPE lines were commented
-- out because the column is TEXT, not an enum — but the CHECK was never widened).
--
-- Effect of the bug: the super-admin "Modifier la boutique" panel and any
-- payment confirmation that sets plan to growth/business/agency/enterprise fails
-- at the database with a check_violation, surfacing only as a generic
-- "Échec de la mise à jour" / "Paiement déjà traité". This migration widens both
-- constraints to the full assignable tier list.

ALTER TABLE stores DROP CONSTRAINT IF EXISTS stores_plan_check;
ALTER TABLE stores
  ADD CONSTRAINT stores_plan_check
  CHECK (plan IN ('basic','pro','ultimate','growth','business','agency','enterprise','sur_mesure'));

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('basic','pro','ultimate','growth','business','agency','enterprise','sur_mesure'));
