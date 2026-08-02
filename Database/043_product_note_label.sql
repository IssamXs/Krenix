-- Migration: Add custom_note_label to products table
-- Allows merchants to customize the label of the "Note" field on the order form per product.

ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_note_label TEXT;
