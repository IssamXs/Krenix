-- Add idempotency flag for Meta CAPI Purchase events
ALTER TABLE public.orders
ADD COLUMN meta_purchase_sent boolean NOT NULL DEFAULT false;
