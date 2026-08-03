-- Migration: Fix delivery price defaulting to 0 DZD on new stores, and make
-- new stores default to real per-wilaya pricing instead of one flat rate.
--
-- Root cause #1: the `stores.settings` column default (001_schema.sql) hardcoded
-- "deliveryPrice": 0. Every store created without an explicit settings payload
-- (onboarding step-1 insert) inherited that default. Storefront checkout
-- (OrderFormFields.tsx) and the chatbot (chatbot-core.ts) both compute the
-- delivery fee as `rates?.default ?? Number(settings.deliveryPrice ?? 600)` —
-- since 0 is not null/undefined, the `?? 600` fallback never kicked in, so
-- every freshly published boutique showed 0 DZD delivery until the owner
-- manually configured a price in Settings.
--
-- Root cause #2: even once deliveryPrice is non-zero, it's a single flat
-- number applied to every wilaya. A real per-wilaya table already exists in
-- code (src/lib/wilayas.ts DEFAULT_DELIVERY_RATES, based on WeCan's zone
-- tariffs) but was only ever written to a store's settings.deliveryRates when
-- the owner manually opened the dashboard Settings page and hit Save — new
-- stores never had it, so checkout fell back to the flat deliveryPrice.
--
-- Fix: change the column default going forward to include the full
-- per-wilaya deliveryRates map (mode "wilaya"), and backfill stores that
-- never touched their delivery settings (identified by deliveryPrice = 0 AND
-- no deliveryRates key — the dashboard Settings page always writes both
-- together, so their absence means the owner never saved delivery settings).

ALTER TABLE stores ALTER COLUMN settings SET DEFAULT '{
  "primaryColor": "#F59E0B",
  "secondaryColor": "#3B82F6",
  "fontFamily": "Inter",
  "borderRadius": "rounded-xl",
  "whatsapp": "",
  "facebook": "",
  "instagram": "",
  "deliveryPrice": 650,
  "deliveryPricingMode": "wilaya",
  "deliveryRates": {
    "default": 650,
    "Alger": 450, "Blida": 500, "Boumerdès": 500, "Tipaza": 500,
    "Chlef": 650, "Oum El Bouaghi": 650, "Batna": 650, "Béjaïa": 650, "Bouira": 650,
    "Tlemcen": 650, "Tiaret": 650, "Tizi Ouzou": 650, "Jijel": 650, "Sétif": 650,
    "Saïda": 650, "Skikda": 650, "Sidi Bel Abbès": 650, "Annaba": 650, "Guelma": 650,
    "Constantine": 650, "Médéa": 650, "Mostaganem": 650, "M''Sila": 650, "Mascara": 650,
    "Oran": 650, "Bordj Bou Arréridj": 650, "El Tarf": 650, "Tissemsilt": 650,
    "Khenchela": 650, "Souk Ahras": 650, "Mila": 650, "Aïn Defla": 650,
    "Aïn Témouchent": 650, "Relizane": 650,
    "Laghouat": 800, "Biskra": 800, "Tébessa": 800, "Djelfa": 800, "El Bayadh": 800,
    "Ouargla": 800, "El Oued": 800, "Ghardaïa": 800, "Ouled Djellal": 800,
    "Touggourt": 800, "El M''Ghair": 800, "El Meniaa": 800,
    "Adrar": 1600, "Béchar": 1600, "Tamanrasset": 1600, "Illizi": 1600,
    "Tindouf": 1600, "Naâma": 1600, "Timimoun": 1600, "Bordj Badji Mokhtar": 1600,
    "Béni Abbès": 1600, "In Salah": 1600, "In Guezzam": 1600, "Djanet": 1600
  },
  "freeDeliveryThreshold": 0,
  "welcomeMessage": "Bienvenue dans notre boutique!"
}';

UPDATE stores
SET settings = settings
  || jsonb_build_object('deliveryPrice', 650, 'deliveryPricingMode', 'wilaya')
  || jsonb_build_object('deliveryRates', '{
    "default": 650,
    "Alger": 450, "Blida": 500, "Boumerdès": 500, "Tipaza": 500,
    "Chlef": 650, "Oum El Bouaghi": 650, "Batna": 650, "Béjaïa": 650, "Bouira": 650,
    "Tlemcen": 650, "Tiaret": 650, "Tizi Ouzou": 650, "Jijel": 650, "Sétif": 650,
    "Saïda": 650, "Skikda": 650, "Sidi Bel Abbès": 650, "Annaba": 650, "Guelma": 650,
    "Constantine": 650, "Médéa": 650, "Mostaganem": 650, "M''Sila": 650, "Mascara": 650,
    "Oran": 650, "Bordj Bou Arréridj": 650, "El Tarf": 650, "Tissemsilt": 650,
    "Khenchela": 650, "Souk Ahras": 650, "Mila": 650, "Aïn Defla": 650,
    "Aïn Témouchent": 650, "Relizane": 650,
    "Laghouat": 800, "Biskra": 800, "Tébessa": 800, "Djelfa": 800, "El Bayadh": 800,
    "Ouargla": 800, "El Oued": 800, "Ghardaïa": 800, "Ouled Djellal": 800,
    "Touggourt": 800, "El M''Ghair": 800, "El Meniaa": 800,
    "Adrar": 1600, "Béchar": 1600, "Tamanrasset": 1600, "Illizi": 1600,
    "Tindouf": 1600, "Naâma": 1600, "Timimoun": 1600, "Bordj Badji Mokhtar": 1600,
    "Béni Abbès": 1600, "In Salah": 1600, "In Guezzam": 1600, "Djanet": 1600
  }'::jsonb)
WHERE (settings->>'deliveryPrice')::numeric = 0
  AND settings->'deliveryRates' IS NULL;
