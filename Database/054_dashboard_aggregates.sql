-- ============================================================
-- 054 — Server-side aggregation views for the heavy dashboard
-- pages (Analytics / Finance / CRM).
-- ============================================================
-- The dashboard pages previously downloaded EVERY order row and aggregated
-- in the browser — O(N) network + O(N) JS on every load, which is exactly
-- what makes the platform slow as a store's order history grows.
--
-- These views push the aggregation into Postgres so only a handful of rows
-- cross the wire. They are created WITH (security_invoker = true) so the
-- existing RLS policies on the base tables (e.g. "Store owners can manage
-- own orders") apply at query time — a view must never let a merchant read
-- another store's aggregates.
--
-- Requires Postgres 15+ (Supabase default). Idempotent — safe to re-run.
-- Paste into Supabase → SQL Editor → Run.

-- ---------- Per-store order KPIs ----------
-- One row per store: counts per status/source + delivered/active revenue.
DROP VIEW IF EXISTS store_order_stats CASCADE;
CREATE VIEW store_order_stats
WITH (security_invoker = true) AS
SELECT
  store_id,
  COUNT(*)                                                            AS total_orders,
  COUNT(*) FILTER (WHERE status = 'pending')                          AS pending_orders,
  COUNT(*) FILTER (WHERE status = 'confirmed')                        AS confirmed_orders,
  COUNT(*) FILTER (WHERE status = 'chez_livreur')                     AS chez_livreur_orders,
  COUNT(*) FILTER (WHERE status = 'en_livraison')                     AS en_livraison_orders,
  COUNT(*) FILTER (WHERE status = 'livree')                           AS delivered_orders,
  COUNT(*) FILTER (WHERE status = 'annulee')                          AS cancelled_orders,
  COUNT(*) FILTER (WHERE status = 'retournee')                        AS returned_orders,
  COUNT(*) FILTER (WHERE status IN ('chez_livreur', 'en_livraison', 'livree', 'retournee'))
                                                                      AS shipped_orders,
  COUNT(*) FILTER (WHERE source = 'manual')                           AS source_manual_orders,
  COUNT(*) FILTER (WHERE source = 'chatbot')                          AS source_chatbot_orders,
  COUNT(*) FILTER (WHERE source = 'form')                             AS source_form_orders,
  COUNT(*) FILTER (WHERE source = 'landing_page')                     AS source_landing_orders,
  COUNT(*) FILTER (WHERE source = 'messenger')                        AS source_messenger_orders,
  COUNT(*) FILTER (WHERE source = 'instagram')                        AS source_instagram_orders,
  COALESCE(SUM(total_price) FILTER (WHERE status = 'livree'), 0)      AS delivered_revenue,
  COALESCE(SUM(total_price - COALESCE(delivery_price, 0))
            FILTER (WHERE status = 'livree'), 0)                      AS delivered_margin_revenue,
  COALESCE(SUM(total_price)
            FILTER (WHERE status NOT IN ('annulee', 'retournee')), 0) AS active_revenue
FROM orders
GROUP BY store_id;

-- ---------- Per-store, per-day order stats (trends) ----------
-- One row per store per day. The client fetches only the last ~31 days via
-- a WHERE day >= ... filter — at most 31 rows per store, never the full
-- history. Powers the 7-day order trend + 30-day revenue trend + month-over-
-- month comparisons.
DROP VIEW IF EXISTS store_daily_order_stats CASCADE;
CREATE VIEW store_daily_order_stats
WITH (security_invoker = true) AS
SELECT
  store_id,
  (created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(*)                              AS orders,
  COUNT(*) FILTER (WHERE status = 'livree')                            AS delivered_orders,
  COALESCE(SUM(total_price) FILTER (WHERE status = 'livree'), 0)       AS delivered_revenue
FROM orders
GROUP BY store_id, day;

-- ---------- Per-store, per-product stats (finance product table) ----------
-- Delivered units + delivered revenue per product. Only products that have
-- actually sold appear — no full products table download needed.
DROP VIEW IF EXISTS store_product_stats CASCADE;
CREATE VIEW store_product_stats
WITH (security_invoker = true) AS
SELECT
  store_id,
  product_id,
  COUNT(*)                                                             AS delivered_orders,
  COALESCE(SUM(quantity) FILTER (WHERE status = 'livree'), 0)          AS units_sold,
  COALESCE(SUM(total_price - COALESCE(delivery_price, 0))
            FILTER (WHERE status = 'livree'), 0)                       AS delivered_revenue
FROM orders
WHERE product_id IS NOT NULL
GROUP BY store_id, product_id;

-- ---------- Per-store, per-customer stats (CRM) ----------
-- One row per customer phone. The old CRM page grouped ALL orders by phone
-- in the browser; now Postgres does it. Powers customer count, order count,
-- total spent, last order date.
DROP VIEW IF EXISTS store_customer_stats CASCADE;
CREATE VIEW store_customer_stats
WITH (security_invoker = true) AS
SELECT
  store_id,
  customer_phone,
  COUNT(*)                                       AS order_count,
  MIN(customer_name)                             AS customer_name,
  MIN(wilaya)                                    AS wilaya,
  COALESCE(SUM(total_price), 0)                  AS total_spent,
  MAX(created_at)                                AS last_order_at
FROM orders
GROUP BY store_id, customer_phone;

-- ---------- Per-store, per-wilaya order counts (analytics map) ----------
DROP VIEW IF EXISTS store_wilaya_stats CASCADE;
CREATE VIEW store_wilaya_stats
WITH (security_invoker = true) AS
SELECT
  store_id,
  wilaya,
  COUNT(*) AS orders
FROM orders
WHERE wilaya IS NOT NULL
GROUP BY store_id, wilaya;
