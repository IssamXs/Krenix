-- ============================================================
-- NOVALUX — DATABASE SCHEMA
-- Migration 001: All Tables
-- Run this in Supabase SQL Editor FIRST
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SUPER ADMINS
-- Only platform owner (Issam) has a row here
-- ============================================================
CREATE TABLE IF NOT EXISTS super_admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- THEMES
-- Available store themes, locked by tier
-- ============================================================
CREATE TABLE IF NOT EXISTS themes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  preview_url    TEXT,
  tier_required  TEXT NOT NULL DEFAULT 'basic'
                 CHECK (tier_required IN ('basic', 'pro', 'ultimate')),
  config         JSONB NOT NULL DEFAULT '{}',
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- STORES
-- One row per tenant/customer
-- ============================================================
CREATE TABLE IF NOT EXISTS stores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id              UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name                  TEXT NOT NULL,
  slug                  TEXT NOT NULL UNIQUE,
  logo_url              TEXT,
  theme_id              UUID REFERENCES themes(id),
  plan                  TEXT NOT NULL DEFAULT 'basic'
                        CHECK (plan IN ('basic', 'pro', 'ultimate', 'sur_mesure')),
  subscription_status   TEXT NOT NULL DEFAULT 'active'
                        CHECK (subscription_status IN ('active', 'inactive', 'trial', 'expired', 'suspended')),
  ai_credits            INTEGER NOT NULL DEFAULT 5,
  chatbot_daily_limit   INTEGER NOT NULL DEFAULT 0,
  settings              JSONB NOT NULL DEFAULT '{
    "primaryColor": "#F59E0B",
    "secondaryColor": "#3B82F6",
    "fontFamily": "Inter",
    "borderRadius": "rounded-xl",
    "whatsapp": "",
    "facebook": "",
    "instagram": "",
    "deliveryPrice": 0,
    "freeDeliveryThreshold": 0,
    "welcomeMessage": "Bienvenue dans notre boutique!"
  }',
  is_onboarded          BOOLEAN DEFAULT FALSE,
  is_suspended          BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PRODUCTS
-- Each product belongs to a store
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  price           DECIMAL(10,2) NOT NULL DEFAULT 0,
  compare_price   DECIMAL(10,2),
  images          TEXT[] DEFAULT '{}', -- Use flat lay product photos only. No people, no animals.
  colors          TEXT[] DEFAULT '{}',
  sizes           TEXT[] DEFAULT '{}',
  stock           INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  meta_title      TEXT,
  meta_description TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, slug)
);

-- ============================================================
-- LANDING PAGES
-- AI-generated product landing pages
-- ============================================================
CREATE TABLE IF NOT EXISTS landing_pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  theme_id    UUID REFERENCES themes(id),
  is_active   BOOLEAN DEFAULT TRUE,
  views       INTEGER DEFAULT 0,
  orders_count INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, slug)
);

-- ============================================================
-- ORDERS
-- Customer orders from store landing pages or chatbot
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  landing_page_id  UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  order_number     TEXT NOT NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  wilaya           TEXT NOT NULL,
  commune          TEXT NOT NULL,
  address          TEXT,
  quantity         INTEGER NOT NULL DEFAULT 1,
  color            TEXT,
  size             TEXT,
  unit_price       DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  delivery_price   DECIMAL(10,2) DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN (
                     'pending',
                     'confirmed',
                     'chez_livreur',
                     'en_livraison',
                     'livree',
                     'annulee',
                     'retournee'
                   )),
  source           TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual', 'chatbot', 'form', 'landing_page')),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SUBSCRIPTIONS
-- Payment records — manually confirmed by super admin
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  plan               TEXT NOT NULL
                     CHECK (plan IN ('basic', 'pro', 'ultimate', 'sur_mesure')),
  amount_dzd         INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'expired', 'cancelled', 'rejected')),
  payment_method     TEXT CHECK (payment_method IN ('cib', 'edahabia', 'baridimob', 'virement', 'cash', 'other')),
  payment_proof_url  TEXT,
  started_at         TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  confirmed_by       UUID REFERENCES auth.users(id),
  confirmed_at       TIMESTAMPTZ,
  rejected_reason    TEXT,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CREDIT USAGE
-- Log every AI credit spent
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_usage (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  landing_page_id UUID REFERENCES landing_pages(id) ON DELETE SET NULL,
  type            TEXT NOT NULL DEFAULT 'landing_page'
                  CHECK (type IN ('landing_page')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHATBOT SESSIONS
-- Full conversation history per customer session
-- ============================================================
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  session_id  TEXT NOT NULL,
  messages    JSONB NOT NULL DEFAULT '[]',
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_phone TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, session_id)
);

-- ============================================================
-- CHATBOT DAILY USAGE
-- Rate limiting: tracks daily message count per store
-- ============================================================
CREATE TABLE IF NOT EXISTS chatbot_daily_usage (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  date           DATE NOT NULL DEFAULT CURRENT_DATE,
  message_count  INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, date)
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_stores_updated_at
  BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_landing_pages_updated_at
  BEFORE UPDATE ON landing_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chatbot_sessions_updated_at
  BEFORE UPDATE ON chatbot_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-generate order number
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  store_prefix TEXT;
  order_count INTEGER;
BEGIN
  SELECT UPPER(SUBSTRING(slug, 1, 3)) INTO store_prefix
  FROM stores WHERE id = NEW.store_id;

  SELECT COUNT(*) + 1 INTO order_count
  FROM orders WHERE store_id = NEW.store_id;

  NEW.order_number = store_prefix || '-' || LPAD(order_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_order_number_trigger
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- Auto-generate product slug from name
CREATE OR REPLACE FUNCTION generate_product_slug()
RETURNS TRIGGER AS $$
DECLARE
  base_slug TEXT;
  final_slug TEXT;
  counter INTEGER := 0;
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base_slug := LOWER(REGEXP_REPLACE(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'));
    base_slug := TRIM(BOTH '-' FROM base_slug);
    final_slug := base_slug;

    WHILE EXISTS (
      SELECT 1 FROM products
      WHERE store_id = NEW.store_id AND slug = final_slug AND id != NEW.id
    ) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;

    NEW.slug := final_slug;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER generate_product_slug_trigger
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION generate_product_slug();

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_stores_owner_id ON stores(owner_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON stores(slug);
CREATE INDEX IF NOT EXISTS idx_products_store_id ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(store_id, slug);
CREATE INDEX IF NOT EXISTS idx_landing_pages_store_id ON landing_pages(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_id ON orders(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_store_id ON subscriptions(store_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_chatbot_sessions_store_session ON chatbot_sessions(store_id, session_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_daily_usage ON chatbot_daily_usage(store_id, date);
CREATE INDEX IF NOT EXISTS idx_credit_usage_store_id ON credit_usage(store_id);
