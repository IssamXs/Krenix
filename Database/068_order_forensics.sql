-- ============================================================
-- 068 — Two forensic logs for "what happened to order X":
-- order_deletions (a snapshot written before a real delete) and
-- order_failed_attempts (every POST /api/orders that did NOT create a row).
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: chasing four missing order numbers (LEM-0029..0032) hit two dead
-- ends — Vercel Hobby log retention caps at ~1 hour, and orders/delete/
-- route.ts does a hard DELETE with no trace at all. Deletion was the
-- likely cause: a rejected insert can't explain a number gap, because
-- generate_order_number() runs inside the same INSERT's trigger chain —
-- any later RAISE EXCEPTION in that chain rolls back the sequence
-- increment along with everything else. So a genuinely rejected order
-- never consumes a number; only a create-then-delete does.
-- ============================================================

-- ---------- Deletion log ----------
-- A snapshot of the order row taken at the moment orders/delete/route.ts
-- deletes it, plus who did it. Written directly in that route (the only
-- code path that deletes from `orders`), not via a DB trigger — there is
-- exactly one call site today, and the route already has the authenticated
-- user in scope, which a trigger fired by the service-role client would not.
CREATE TABLE IF NOT EXISTS order_deletions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id        UUID NOT NULL,
  order_number    TEXT,
  customer_name   TEXT,
  customer_phone  TEXT,
  wilaya          TEXT,
  total_price     NUMERIC,
  status          TEXT,
  order_created_at TIMESTAMPTZ,
  deleted_by      UUID REFERENCES auth.users(id),
  deleted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_deletions_store_idx ON order_deletions(store_id, deleted_at DESC);

ALTER TABLE order_deletions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner reads own deletion log" ON order_deletions;
CREATE POLICY "Store owner reads own deletion log" ON order_deletions FOR SELECT
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = order_deletions.store_id AND stores.owner_id = auth.uid()));

-- ---------- Failed-attempt log ----------
-- Every POST /api/orders that returned a non-2xx response: rate limit,
-- validation (400), store unavailable (404), the DB trigger's P0001
-- message, or an unexpected 500. Best-effort — a failure writing this row
-- must never affect the actual response the customer sees.
CREATE TABLE IF NOT EXISTS order_failed_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID REFERENCES stores(id) ON DELETE CASCADE,
  http_status    INTEGER NOT NULL,
  error_message  TEXT NOT NULL,
  customer_name  TEXT,
  customer_phone TEXT,
  wilaya         TEXT,
  commune        TEXT,
  product_id     UUID,
  quantity       INTEGER,
  ip             TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS order_failed_attempts_store_idx ON order_failed_attempts(store_id, created_at DESC);

ALTER TABLE order_failed_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Store owner reads own failed attempts" ON order_failed_attempts;
CREATE POLICY "Store owner reads own failed attempts" ON order_failed_attempts FOR SELECT
  USING (EXISTS (SELECT 1 FROM stores WHERE stores.id = order_failed_attempts.store_id AND stores.owner_id = auth.uid()));

NOTIFY pgrst, 'reload schema';
