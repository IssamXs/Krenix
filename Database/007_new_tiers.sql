-- Migration 007: New tier system (Growth, Business, Agency, Enterprise)
-- Run after 001_schema.sql

-- ── 1. Add new feature-flag columns to stores ─────────────────────────────────
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS custom_domain          TEXT,
  ADD COLUMN IF NOT EXISTS facebook_pixel_id      TEXT,
  ADD COLUMN IF NOT EXISTS tiktok_pixel_id        TEXT,
  ADD COLUMN IF NOT EXISTS max_products           INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS max_landing_pages      INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_team_members       INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_stores             INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS has_yalidine           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_all_delivery       BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_ab_testing         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_white_label        BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_api_access         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_crm                BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_auto_sms           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_profit_calculator  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_custom_domain      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_dedicated_infra     BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2. Update plan enum to include new tiers ─────────────────────────────────
-- (Only needed if plan column is an enum; skip if it's TEXT)
-- ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'growth';
-- ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'business';
-- ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'agency';
-- ALTER TYPE plan_type ADD VALUE IF NOT EXISTS 'enterprise';

-- ── 3. plan_config — default feature values per plan ─────────────────────────
CREATE TABLE IF NOT EXISTS plan_config (
  plan                  TEXT PRIMARY KEY,
  ai_credits            INTEGER NOT NULL DEFAULT 5,
  chatbot_daily_limit   INTEGER NOT NULL DEFAULT 0,
  max_products          INTEGER NOT NULL DEFAULT 10,
  max_landing_pages     INTEGER NOT NULL DEFAULT 5,
  max_team_members      INTEGER NOT NULL DEFAULT 1,
  max_stores            INTEGER NOT NULL DEFAULT 1,
  has_chatbot           BOOLEAN NOT NULL DEFAULT FALSE,
  has_yalidine          BOOLEAN NOT NULL DEFAULT FALSE,
  has_all_delivery      BOOLEAN NOT NULL DEFAULT FALSE,
  has_ab_testing        BOOLEAN NOT NULL DEFAULT FALSE,
  has_white_label       BOOLEAN NOT NULL DEFAULT FALSE,
  has_api_access        BOOLEAN NOT NULL DEFAULT FALSE,
  has_crm               BOOLEAN NOT NULL DEFAULT FALSE,
  has_auto_sms          BOOLEAN NOT NULL DEFAULT FALSE,
  has_profit_calculator BOOLEAN NOT NULL DEFAULT FALSE,
  has_custom_domain     BOOLEAN NOT NULL DEFAULT FALSE,
  is_dedicated_infra    BOOLEAN NOT NULL DEFAULT FALSE,
  pixel_auto_install    BOOLEAN NOT NULL DEFAULT FALSE
);

INSERT INTO plan_config (plan, ai_credits, chatbot_daily_limit, max_products, max_landing_pages, max_team_members, max_stores, has_chatbot, has_yalidine, has_all_delivery, has_ab_testing, has_white_label, has_api_access, has_crm, has_auto_sms, has_profit_calculator, has_custom_domain, is_dedicated_infra, pixel_auto_install)
VALUES
  ('basic',      5,    0,    10,  5,  1,         1, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('pro',        20,   0,    -1,  -1, 1,         1, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE),
  ('ultimate',   100,  150,  -1,  -1, 2,         1, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  FALSE, FALSE, FALSE),
  ('growth',     200,  300,  -1,  -1, 2,         1, TRUE,  FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, TRUE,  TRUE,  FALSE, TRUE),
  ('business',   400,  600,  -1,  -1, 5,         2, TRUE,  TRUE,  FALSE, TRUE,  TRUE,  FALSE, TRUE,  TRUE,  TRUE,  TRUE,  FALSE, TRUE),
  ('agency',     800,  1000, -1,  -1, -1,        5, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  FALSE, TRUE),
  ('enterprise', 1500, 2000, -1,  -1, -1,        -1, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE),
  ('sur_mesure', 0,    0,    -1,  -1, -1,        -1, TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  TRUE,  FALSE, TRUE)
ON CONFLICT (plan) DO UPDATE SET
  ai_credits            = EXCLUDED.ai_credits,
  chatbot_daily_limit   = EXCLUDED.chatbot_daily_limit,
  max_products          = EXCLUDED.max_products,
  max_landing_pages     = EXCLUDED.max_landing_pages,
  max_team_members      = EXCLUDED.max_team_members,
  max_stores            = EXCLUDED.max_stores,
  has_chatbot           = EXCLUDED.has_chatbot,
  has_yalidine          = EXCLUDED.has_yalidine,
  has_all_delivery      = EXCLUDED.has_all_delivery,
  has_ab_testing        = EXCLUDED.has_ab_testing,
  has_white_label       = EXCLUDED.has_white_label,
  has_api_access        = EXCLUDED.has_api_access,
  has_crm               = EXCLUDED.has_crm,
  has_auto_sms          = EXCLUDED.has_auto_sms,
  has_profit_calculator = EXCLUDED.has_profit_calculator,
  has_custom_domain     = EXCLUDED.has_custom_domain,
  is_dedicated_infra    = EXCLUDED.is_dedicated_infra,
  pixel_auto_install    = EXCLUDED.pixel_auto_install;

-- ── 4. Also update the niche theme tiers in themes table ──────────────────────
-- Beauty & Fashion becomes Pro (1 niche theme for Pro)
-- Other 4 become Ultimate (all 5 on Ultimate)
UPDATE themes SET tier_required = 'pro'     WHERE slug = 'beauty-fashion';
UPDATE themes SET tier_required = 'ultimate' WHERE slug IN ('auto-accessories', 'fitness-wellness', 'home-lifestyle', 'tech-mobile');

-- ── 5. Backfill existing stores with correct limits per their plan ─────────────
UPDATE stores s
SET
  max_products          = pc.max_products,
  max_landing_pages     = pc.max_landing_pages,
  max_team_members      = pc.max_team_members,
  max_stores            = pc.max_stores,
  has_yalidine          = pc.has_yalidine,
  has_all_delivery      = pc.has_all_delivery,
  has_ab_testing        = pc.has_ab_testing,
  has_white_label       = pc.has_white_label,
  has_api_access        = pc.has_api_access,
  has_crm               = pc.has_crm,
  has_auto_sms          = pc.has_auto_sms,
  has_profit_calculator = pc.has_profit_calculator,
  has_custom_domain     = pc.has_custom_domain,
  is_dedicated_infra    = pc.is_dedicated_infra
FROM plan_config pc
WHERE s.plan = pc.plan;
