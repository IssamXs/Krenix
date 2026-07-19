CREATE TABLE IF NOT EXISTS public.super_admin_backup_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Active RLS
ALTER TABLE public.super_admin_backup_codes ENABLE ROW LEVEL SECURITY;

-- Allow super admins to read/manage their own backup codes via the API (using service role)
-- No public policies needed since we use service_role for API access to this table.
