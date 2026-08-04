-- Migration: Required + Telegram-verified phone number at signup
-- New table, not a stores column: verification must complete before a store
-- row exists (created only at onboarding step 1), and OAuth signups never
-- pass through the register form's phone field at all — so this anchors to
-- the auth user, not the store.
CREATE TABLE IF NOT EXISTS phone_verifications (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone                TEXT NOT NULL,               -- E.164, e.g. +213555123456
  phone_verified       BOOLEAN NOT NULL DEFAULT false,
  verified_at          TIMESTAMPTZ,
  telegram_request_id  TEXT,                        -- last Gateway request_id, for checkVerificationStatus
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Users may read their own verification status. Deliberately NO
-- INSERT/UPDATE/DELETE policy for anon/authenticated roles — every write
-- goes through server API routes on the service-role client (which bypasses
-- RLS entirely). phone_verified must never be client-settable, mirroring
-- the store-column lockdown in migration 025.
DROP POLICY IF EXISTS "User reads own phone verification" ON phone_verifications;
CREATE POLICY "User reads own phone verification" ON phone_verifications
  FOR SELECT USING (auth.uid() = user_id);
