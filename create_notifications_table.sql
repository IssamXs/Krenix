-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  action_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their store notifications"
  ON public.notifications FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = notifications.store_id
      AND (
        stores.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.team_members
          WHERE team_members.store_id = stores.id AND team_members.user_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Users can update their store notifications"
  ON public.notifications FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = notifications.store_id
      AND (
        stores.owner_id = auth.uid() OR
        EXISTS (
          SELECT 1 FROM public.team_members
          WHERE team_members.store_id = stores.id AND team_members.user_id = auth.uid()
        )
      )
    )
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_store_id_created_at ON public.notifications (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_store_id_is_read ON public.notifications (store_id) WHERE is_read = false;

-- Create a dummy notification for testing
INSERT INTO public.notifications (store_id, title, message, type, action_url)
SELECT id, 'Bienvenue sur Krenix', 'Votre boutique a été configurée avec succès. Explorez votre tableau de bord.', 'system', '/dashboard'
FROM public.stores
LIMIT 1;
