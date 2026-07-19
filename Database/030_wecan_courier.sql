-- ============================================================
-- Add WECAN as a fifth delivery provider option.
-- Widen the delivery_integrations.provider CHECK (same pattern as 023).
-- ============================================================
ALTER TABLE delivery_integrations DROP CONSTRAINT IF EXISTS delivery_integrations_provider_check;
ALTER TABLE delivery_integrations ADD CONSTRAINT delivery_integrations_provider_check
  CHECK (provider IN ('yalidine', 'maystro', 'zr_express', 'procolis', 'wecan'));
