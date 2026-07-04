-- ============================================================
-- NOVALUX — ROW LEVEL SECURITY POLICIES
-- Migration 002: RLS Policies
-- Run this AFTER 001_schema.sql
-- ============================================================

-- ============================================================
-- Enable RLS on all tables
-- ============================================================
ALTER TABLE super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE landing_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_daily_usage ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Check if current user is a super admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM super_admins
    WHERE user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get store_id owned by current user
CREATE OR REPLACE FUNCTION get_my_store_id()
RETURNS UUID AS $$
BEGIN
  RETURN (
    SELECT id FROM stores
    WHERE owner_id = auth.uid()
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- SUPER ADMINS TABLE
-- Only super admins can read their own row
-- ============================================================
CREATE POLICY "Super admins can read own row"
  ON super_admins FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================
-- THEMES TABLE
-- Everyone can read active themes
-- Only super admins can manage themes
-- ============================================================
CREATE POLICY "Anyone can read active themes"
  ON themes FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Super admins can manage themes"
  ON themes FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================
-- STORES TABLE
-- Users can only see and manage their own store
-- Super admins can see all stores
-- ============================================================
CREATE POLICY "Users can read own store"
  ON stores FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR is_super_admin());

CREATE POLICY "Users can insert own store"
  ON stores FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own store"
  ON stores FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid() OR is_super_admin())
  WITH CHECK (owner_id = auth.uid() OR is_super_admin());

-- Allow public to read store by slug (for subdomain pages)
CREATE POLICY "Public can read store by slug"
  ON stores FOR SELECT
  TO anon
  USING (is_suspended = FALSE);

-- ============================================================
-- PRODUCTS TABLE
-- Store owners can manage their own products
-- Public can read active products (for store pages)
-- ============================================================
CREATE POLICY "Store owners can manage own products"
  ON products FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Public can read active products"
  ON products FOR SELECT
  TO anon
  USING (is_active = TRUE);

-- ============================================================
-- LANDING PAGES TABLE
-- Store owners can manage their own landing pages
-- Public can read active landing pages
-- ============================================================
CREATE POLICY "Store owners can manage own landing pages"
  ON landing_pages FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Public can read active landing pages"
  ON landing_pages FOR SELECT
  TO anon
  USING (is_active = TRUE);

-- ============================================================
-- ORDERS TABLE
-- Store owners can read and update their own orders
-- Public can insert orders (customers placing orders)
-- ============================================================
CREATE POLICY "Store owners can manage own orders"
  ON orders FOR ALL
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  )
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

-- Allow anonymous users to place orders (from store landing pages)
CREATE POLICY "Public can place orders"
  ON orders FOR INSERT
  TO anon
  WITH CHECK (TRUE);

-- ============================================================
-- SUBSCRIPTIONS TABLE
-- Store owners can read their own subscriptions
-- Only super admins can update subscriptions
-- ============================================================
CREATE POLICY "Store owners can read own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Store owners can create subscription requests"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
  );

CREATE POLICY "Super admins can manage all subscriptions"
  ON subscriptions FOR ALL
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- ============================================================
-- CREDIT USAGE TABLE
-- Store owners can read their own usage
-- System inserts (via service role in API routes)
-- ============================================================
CREATE POLICY "Store owners can read own credit usage"
  ON credit_usage FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

-- ============================================================
-- CHATBOT SESSIONS TABLE
-- Store owners can read their chatbot sessions
-- Public can insert/update sessions (chatbot widget)
-- ============================================================
CREATE POLICY "Store owners can read own chatbot sessions"
  ON chatbot_sessions FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );

CREATE POLICY "Public can create chatbot sessions"
  ON chatbot_sessions FOR INSERT
  TO anon
  WITH CHECK (TRUE);

CREATE POLICY "Public can update own chatbot sessions"
  ON chatbot_sessions FOR UPDATE
  TO anon
  USING (TRUE);

-- ============================================================
-- CHATBOT DAILY USAGE TABLE
-- Store owners can read their usage
-- System manages via API routes (service role)
-- ============================================================
CREATE POLICY "Store owners can read own chatbot usage"
  ON chatbot_daily_usage FOR SELECT
  TO authenticated
  USING (
    store_id IN (SELECT id FROM stores WHERE owner_id = auth.uid())
    OR is_super_admin()
  );
