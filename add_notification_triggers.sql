-- 1. Trigger for new orders
CREATE OR REPLACE FUNCTION notify_store_on_new_order()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (store_id, title, message, type, action_url)
  VALUES (
    NEW.store_id,
    'Nouvelle commande',
    'Commande #' || NEW.order_number || ' de ' || NEW.customer_name,
    'order',
    '/dashboard/orders'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_new_order ON public.orders;
CREATE TRIGGER notify_new_order
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION notify_store_on_new_order();

-- 2. Trigger for new leads (abandoned carts)
CREATE OR REPLACE FUNCTION notify_store_on_new_lead()
RETURNS TRIGGER
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (store_id, title, message, type, action_url)
  VALUES (
    NEW.store_id,
    'Nouveau Lead (Abandon)',
    'Un client a laissé ses coordonnées : ' || NEW.name || ' (' || NEW.phone || ')',
    'alert',
    '/dashboard/leads'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notify_new_lead ON public.leads;
CREATE TRIGGER notify_new_lead
AFTER INSERT ON public.leads
FOR EACH ROW
EXECUTE FUNCTION notify_store_on_new_lead();
