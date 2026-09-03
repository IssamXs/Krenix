-- ============================================================
-- 073 — Finance: committed-sales aggregates + per-product view
--     that includes multi-item (cart) orders.
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
--
-- WHY
--   The finance page previously measured money ONLY on orders with status
--   'livree' (delivered). On every real COD store a large share (often all)
--   of orders sit in 'pending'/'confirmed'/'en_livraison'/'chez_livreur' for
--   days, so finance showed ~0 while the store had plenty of committed sales.
--   This migration adds dashboard-level "committed" aggregates (every order
--   that is NOT cancelled or returned) so the owner sees the true value of
--   what they've sold.
--
--   It also fixes a silent hole in the per-product breakdown: the old
--   store_product_stats read orders.product_id, which is NULL for cart
--   (multi-item) orders, so any 2+-product cart sale vanished from the per-
--   product table entirely. The new store_product_sales_stats view unions
--   single-product orders (from orders) with cart lines (from order_items).
--
--   Money is always measured as GOODS ONLY (total_price − delivery_price, or
--   order_items.subtotal), matching the merchant's "sale value = product
--   price, exclude delivery" choice. Delivery fees and discounts are netted
--   out at the per-order level by the existing formulas.
-- ============================================================

-- ---------- Per-store committed-sales KPIs ----------
-- Replaces store_order_stats (same base columns) and adds committed figures.
-- Postgres cannot add columns with CREATE OR REPLACE VIEW, so it is dropped
-- and recreated in full. All pre-existing column names are preserved so the
-- Analytics / CRM pages keep working unchanged.
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
            FILTER (WHERE status NOT IN ('annulee', 'retournee')), 0) AS active_revenue,
  -- NEW: committed = every order that is not cancelled/returned (the money
  -- actually owed across pending → delivered).
  COUNT(*) FILTER (WHERE status NOT IN ('annulee', 'retournee'))      AS committed_orders,
  COALESCE(SUM(total_price - COALESCE(delivery_price, 0))
            FILTER (WHERE status NOT IN ('annulee', 'retournee')), 0) AS committed_revenue,
  COALESCE(SUM(total_price)
            FILTER (WHERE status NOT IN ('annulee', 'retournee')), 0) AS committed_total_revenue
FROM orders
GROUP BY store_id;

-- ---------- Per-store, per-product committed sales ----------
-- Includes BOTH single-product orders (orders row) and multi-item cart orders
-- (order_items lines). products with product_id NULL (deleted product, or a
-- cart line whose product was deleted) are excluded — they can't be costed.
DROP VIEW IF EXISTS store_product_sales_stats CASCADE;
CREATE VIEW store_product_sales_stats
WITH (security_invoker = true) AS
SELECT
  store_id,
  product_id,
  SUM(units_sold)  AS units_sold,
  SUM(sold_revenue) AS sold_revenue,
  SUM(order_count) AS order_count
FROM (
  -- Single-product orders: goods value on the orders row itself.
  SELECT
    store_id,
    product_id,
    SUM(quantity)                                        AS units_sold,
    SUM(total_price - COALESCE(delivery_price, 0))       AS sold_revenue,
    COUNT(*)                                             AS order_count
  FROM orders
  WHERE product_id IS NOT NULL
    AND status NOT IN ('annulee', 'retournee')
  GROUP BY store_id, product_id

  UNION ALL

  -- Cart (multi-item) orders: per-line goods value from order_items.
  SELECT
    o.store_id,
    oi.product_id,
    SUM(oi.quantity)                                     AS units_sold,
    SUM(oi.subtotal)                                     AS sold_revenue,
    COUNT(DISTINCT o.id)                                 AS order_count
  FROM order_items oi
  JOIN orders o ON o.id = oi.order_id
  WHERE o.product_id IS NULL                             -- a cart order (not single-product)
    AND oi.product_id IS NOT NULL
    AND o.status NOT IN ('annulee', 'retournee')
  GROUP BY o.store_id, oi.product_id
) AS product_lines
GROUP BY store_id, product_id;

NOTIFY pgrst, 'reload schema';
