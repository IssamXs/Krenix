-- ============================================================
-- Admin audit log — every privileged super-admin action. Service-role write
-- only; super admins can read. Never written from the browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id),
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    TEXT,
  details      JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admins read audit" ON admin_audit_log;
CREATE POLICY "super admins read audit" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = auth.uid()));
