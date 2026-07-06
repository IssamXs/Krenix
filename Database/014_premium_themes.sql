-- ============================================================
-- KRENIX — Migration 014: Premium theme tokens
-- ============================================================
-- Replaces the placeholder niche-theme palettes (from 006) with
-- the real premium aesthetics designed in Claude Design.
-- STYLE ONLY — no brand names, logos, or product copy from the
-- reference demos are used. Each UPDATE targets an existing row
-- by slug, so this is safe to run once (idempotent-ish: re-running
-- just re-applies the same config).
--
-- Run in Supabase Studio -> SQL Editor, after 006_niche_themes.sql.
-- ============================================================

-- ── BEAUTY & FASHION ──────────────────────────────────────────
-- Soft romantic luxury: blush + coral, Cormorant Garamond serif
UPDATE themes SET
  name = 'Beauty & Fashion',
  tier_required = 'pro',
  config = '{
    "colors": {
      "background": "#FDEEEE",
      "card": "#FFFFFF",
      "primary": "#E85D5D",
      "secondary": "#E8B04A",
      "text": "#1A1A1A",
      "textMuted": "#6B5D5A",
      "border": "rgba(232,93,93,0.14)"
    },
    "fonts": { "heading": "Cormorant Garamond", "body": "Jost" },
    "borderRadius": "16px",
    "heroLayout": "centered",
    "cardStyle": "luxury"
  }'
WHERE slug = 'beauty-fashion';

-- ── AUTO ACCESSORIES ──────────────────────────────────────────
-- Bold automotive: high-contrast light + aggressive red/black,
-- Barlow Condensed display
UPDATE themes SET
  name = 'Auto Accessories',
  tier_required = 'ultimate',
  config = '{
    "colors": {
      "background": "#F4F4F4",
      "card": "#FFFFFF",
      "primary": "#E62E2D",
      "secondary": "#111111",
      "text": "#111111",
      "textMuted": "#6B6B6B",
      "border": "rgba(0,0,0,0.09)"
    },
    "fonts": { "heading": "Barlow Condensed", "body": "Barlow" },
    "borderRadius": "4px",
    "heroLayout": "fullwidth",
    "cardStyle": "bold"
  }'
WHERE slug = 'auto-accessories';

-- ── FITNESS & WELLNESS ────────────────────────────────────────
-- Dark athletic + electric lime, Barlow Condensed
UPDATE themes SET
  name = 'Fitness & Wellness',
  tier_required = 'ultimate',
  config = '{
    "colors": {
      "background": "#141414",
      "card": "#1C1C1C",
      "primary": "#DFFF3A",
      "secondary": "#C9D048",
      "text": "#FFFFFF",
      "textMuted": "#8F8F8F",
      "border": "rgba(223,255,58,0.18)"
    },
    "fonts": { "heading": "Barlow Condensed", "body": "Barlow" },
    "borderRadius": "6px",
    "heroLayout": "fullwidth",
    "cardStyle": "bold"
  }'
WHERE slug = 'fitness-wellness';

-- ── HOME & LIFESTYLE ──────────────────────────────────────────
-- Warm minimal lifestyle: off-white + terracotta, Sora / Manrope
UPDATE themes SET
  name = 'Home & Lifestyle',
  tier_required = 'ultimate',
  config = '{
    "colors": {
      "background": "#F5F5F2",
      "card": "#FFFFFF",
      "primary": "#FF5B2E",
      "secondary": "#1F8A5B",
      "text": "#1A1A1A",
      "textMuted": "#6B6B6B",
      "border": "rgba(0,0,0,0.07)"
    },
    "fonts": { "heading": "Sora", "body": "Manrope" },
    "borderRadius": "18px",
    "heroLayout": "centered",
    "cardStyle": "warm"
  }'
WHERE slug = 'home-lifestyle';

-- ── TECH & MOBILE ─────────────────────────────────────────────
-- Clean minimal tech: white + lime green, Poppins
UPDATE themes SET
  name = 'Tech & Mobile',
  tier_required = 'ultimate',
  config = '{
    "colors": {
      "background": "#FFFFFF",
      "card": "#F5F5F5",
      "primary": "#8BC34A",
      "secondary": "#F5A623",
      "text": "#1A1A1A",
      "textMuted": "#6B7280",
      "border": "rgba(0,0,0,0.07)"
    },
    "fonts": { "heading": "Poppins", "body": "Poppins" },
    "borderRadius": "14px",
    "heroLayout": "split",
    "cardStyle": "clean"
  }'
WHERE slug = 'tech-mobile';

-- Confirm
SELECT name, slug, tier_required, config->'colors'->>'primary' AS primary_color
FROM themes
WHERE slug IN ('beauty-fashion','auto-accessories','fitness-wellness','home-lifestyle','tech-mobile')
ORDER BY name;
