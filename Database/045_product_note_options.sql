-- Migration: Add required flag and placeholder example text to the product note field
-- Lets merchants make the "Note" field mandatory and show an example message inside it.

ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_note_required BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_note_placeholder TEXT;
