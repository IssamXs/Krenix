-- ============================================================
-- 004_sur_mesure.sql — Sur Mesure package tracking
-- Run after 003_seed.sql
-- ============================================================

-- Track which Sur Mesure package a store has been assigned
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS sur_mesure_package VARCHAR(20);
-- Values: 'growth' | 'business' | 'agency' | 'enterprise' | NULL

-- Reference table of preset Sur Mesure packages
CREATE TABLE IF NOT EXISTS sur_mesure_packages (
  id           VARCHAR(20)  PRIMARY KEY,
  name         VARCHAR(50)  NOT NULL,
  price_dzd    INTEGER      NOT NULL,
  ai_credits   INTEGER      NOT NULL, -- -1 = unlimited
  chatbot_limit INTEGER     NOT NULL, -- -1 = unlimited
  max_stores   INTEGER      NOT NULL, -- -1 = unlimited
  features     TEXT[]       NOT NULL DEFAULT '{}',
  sort_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  DEFAULT NOW()
);

INSERT INTO sur_mesure_packages (id, name, price_dzd, ai_credits, chatbot_limit, max_stores, features, sort_order) VALUES
  ('growth',     'Growth',     12000, 200,  300,  1, ARRAY['Tout Ultimate inclus','200 crédits IA/mois','300 messages chatbot/jour','Support prioritaire 24h'], 1),
  ('business',   'Business',   20000, 400,  600,  2, ARRAY['Tout Growth inclus','400 crédits IA/mois','600 messages chatbot/jour','2 boutiques simultanées','Onboarding personnalisé'], 2),
  ('agency',     'Agency',     35000, 800,  1000, 5, ARRAY['Tout Business inclus','800 crédits IA/mois','1000 messages chatbot/jour','5 boutiques simultanées','Manager de compte dédié'], 3),
  ('enterprise', 'Enterprise', 60000, -1,   -1,   -1, ARRAY['Tout Agency inclus','Crédits IA illimités','Messages chatbot illimités','Boutiques illimitées','SLA garanti 99.9%','Intégration personnalisée'], 4)
ON CONFLICT (id) DO NOTHING;

-- Sur Mesure request log (created when store owner clicks "Commander" while authenticated)
CREATE TABLE IF NOT EXISTS sur_mesure_requests (
  id           UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id     UUID         REFERENCES stores(id) ON DELETE CASCADE,
  package_id   VARCHAR(20)  REFERENCES sur_mesure_packages(id),
  status       VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected
  notes        TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW()
);

ALTER TABLE sur_mesure_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners_view_own_requests" ON sur_mesure_requests
  FOR SELECT USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "owners_insert_own_requests" ON sur_mesure_requests
  FOR INSERT WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );
