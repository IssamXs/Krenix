ALTER TABLE public.super_admins
ADD COLUMN IF NOT EXISTS recovery_phone TEXT,
ADD COLUMN IF NOT EXISTS recovery_email TEXT;
