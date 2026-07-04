-- Run this in your Supabase SQL Editor to expand the order status options

-- Step 1: Drop the old status constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Step 2: Add the new expanded status constraint
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'pending',
    'confirmed',
    'société_livraison',
    'on_the_way',
    'delivered',
    'cancelled',
    'returned'
  ));
