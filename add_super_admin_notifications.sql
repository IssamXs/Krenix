CREATE TABLE IF NOT EXISTS public.super_admin_notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL,
  is_read boolean DEFAULT false,
  action_url text,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.super_admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read super_admin_notifications"
  ON public.super_admin_notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins WHERE super_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "Super admins can update super_admin_notifications"
  ON public.super_admin_notifications
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins WHERE super_admins.user_id = auth.uid()
    )
  );

-- Trigger to notify super admins when a new store is created
CREATE OR REPLACE FUNCTION notify_super_admin_on_new_store()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.super_admin_notifications (title, message, type, action_url)
  VALUES (
    'Nouvelle Boutique',
    'La boutique ' || NEW.name || ' vient de s''inscrire.',
    'store_created',
    '/super-admin/stores'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_new_store ON public.stores;
CREATE TRIGGER notify_new_store
AFTER INSERT ON public.stores
FOR EACH ROW
EXECUTE FUNCTION notify_super_admin_on_new_store();
