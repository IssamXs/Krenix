-- ============================================================
-- 034 — CRITICAL FIX: restore base table grants for anon/authenticated.
--
-- Discovered during a live test on demo-tech.krenix.store: a real anonymous
-- storefront order insert (using the anon key, exactly what every customer's
-- browser uses) was rejected with "new row violates row-level security
-- policy for table orders" (Postgres 42501) — even though 002_rls.sql
-- defines "Public can place orders ... WITH CHECK (true)". The same insert
-- succeeds instantly with the service-role key, and re-testing showed the
-- IDENTICAL failure on "leads" and "chatbot_sessions" INSERT, while anon
-- SELECT (products) still works fine. That pattern — SELECT fine, INSERT
-- broken identically across every anon-insert table — points at the base
-- Postgres GRANT, not the RLS policy text: in Postgres, an RLS policy only
-- takes effect if the role ALSO holds the underlying table privilege. No
-- migration file in this project ever contains a GRANT statement (grep
-- confirmed zero matches), meaning the anon/authenticated roles have only
-- ever had whatever Supabase's dashboard set up automatically — and that
-- appears to have been lost or never applied for INSERT/UPDATE at some
-- point. This migration restores the grants explicitly so this can no
-- longer depend on an implicit dashboard default. RLS policies (already in
-- place) remain the real per-row gate — granting the base privilege does
-- not bypass them.
--
-- Idempotent — safe to run multiple times. Paste into Supabase → SQL Editor.
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- anon: customers browsing/ordering on a storefront, no login. Never DELETE.
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon;
-- authenticated: merchants, super admin. RLS policies scope every row to the
-- caller's own store (or super admin) — this grant does not widen access.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Keep future tables covered automatically, not just the ones that exist today.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
