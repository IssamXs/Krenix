-- ============================================================
-- TEAM MEMBERS
-- Collaborators invited to a store's dashboard. Seats per plan are enforced
-- in the API layer via PLAN_TEAM_LIMITS (Ultimate/Growth 2, Business 5,
-- Agency+ unlimited); the owner always occupies one seat.
-- Service-role only: no client RLS policies — the /api/team routes own all
-- access (owner-scoped).
-- ============================================================
CREATE TABLE IF NOT EXISTS team_members (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- null until the invite is accepted
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member')),
  invited_email  TEXT NOT NULL,
  invited_by     UUID REFERENCES auth.users(id),
  accepted_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_team_members_store ON team_members(store_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user  ON team_members(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
