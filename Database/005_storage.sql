-- ================================================================
-- 005_storage.sql — Supabase Storage buckets for Novalux
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ================================================================

-- Product images (used by dashboard product CRUD + landing page generator)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Store logos (used by onboarding step 2)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'store-logos',
  'store-logos',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
) ON CONFLICT (id) DO NOTHING;

-- Payment proofs (used by billing/upgrade)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'payment-proofs',
  'payment-proofs',
  false,  -- private — only super admin reads these
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------
-- RLS policies for product-images (public read, auth write)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated upload product-images" ON storage.objects;
CREATE POLICY "Authenticated upload product-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated update product-images" ON storage.objects;
CREATE POLICY "Authenticated update product-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "Authenticated delete product-images" ON storage.objects;
CREATE POLICY "Authenticated delete product-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-images');

-- ----------------------------------------------------------------
-- RLS policies for store-logos (public read, auth write)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "Public read store-logos" ON storage.objects;
CREATE POLICY "Public read store-logos"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'store-logos');

DROP POLICY IF EXISTS "Authenticated upload store-logos" ON storage.objects;
CREATE POLICY "Authenticated upload store-logos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'store-logos');

DROP POLICY IF EXISTS "Authenticated update store-logos" ON storage.objects;
CREATE POLICY "Authenticated update store-logos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'store-logos');

-- ----------------------------------------------------------------
-- RLS policies for payment-proofs (auth write, service-role read)
-- ----------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated upload payment-proofs" ON storage.objects;
CREATE POLICY "Authenticated upload payment-proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs');

DROP POLICY IF EXISTS "Service role read payment-proofs" ON storage.objects;
CREATE POLICY "Service role read payment-proofs"
  ON storage.objects FOR SELECT
  TO service_role
  USING (bucket_id = 'payment-proofs');
