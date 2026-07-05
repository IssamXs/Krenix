-- ============================================================
-- More delivery providers: Maystro, ZR Express, Procolis.
-- Widen the delivery_integrations.provider CHECK; a store can now hold one row
-- per provider (UNIQUE(store_id, provider) already enforces that).
-- ============================================================
ALTER TABLE delivery_integrations DROP CONSTRAINT IF EXISTS delivery_integrations_provider_check;
ALTER TABLE delivery_integrations ADD CONSTRAINT delivery_integrations_provider_check
  CHECK (provider IN ('yalidine', 'maystro', 'zr_express', 'procolis'));
