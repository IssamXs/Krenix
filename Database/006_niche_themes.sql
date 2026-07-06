-- ============================================================
-- KRENIX — NICHE THEMES
-- Migration 006: 5 niche-specific themes
-- Run this AFTER 003_seed.sql
-- ============================================================
-- 1 free (Basic) — Beauty & Fashion
-- 4 locked (Pro) — Automotive, Fitness, Home & Lifestyle, Tech

INSERT INTO themes (name, slug, tier_required, config, is_active) VALUES

-- ============================================================
-- BEAUTY & FASHION — Free Basic niche theme
-- Soft editorial luxury: blush/rose, Playfair Display serif
-- ============================================================
(
  'Beauty & Fashion',
  'beauty-fashion',
  'basic',
  '{
    "colors": {
      "background": "#FDF4F7",
      "card": "#FFFFFF",
      "primary": "#BE185D",
      "secondary": "#F472B6",
      "text": "#1A0012",
      "textMuted": "#9D6B7C",
      "border": "rgba(190,24,93,0.1)"
    },
    "fonts": {
      "heading": "Playfair Display",
      "body": "DM Sans"
    },
    "borderRadius": "16px",
    "heroLayout": "centered",
    "cardStyle": "luxury"
  }',
  TRUE
),

-- ============================================================
-- AUTOMOTIVE ACCESSORIES — Pro niche theme
-- Aggressive dark red: Tromic-inspired, sharp industrial
-- ============================================================
(
  'Auto Accessories',
  'auto-accessories',
  'pro',
  '{
    "colors": {
      "background": "#0F0F0F",
      "card": "#1C1C1C",
      "primary": "#DC2626",
      "secondary": "#EF4444",
      "text": "#FFFFFF",
      "textMuted": "#9CA3AF",
      "border": "rgba(220,38,38,0.2)"
    },
    "fonts": {
      "heading": "Bebas Neue",
      "body": "Rajdhani"
    },
    "borderRadius": "4px",
    "heroLayout": "fullwidth",
    "cardStyle": "bold"
  }',
  TRUE
),

-- ============================================================
-- FITNESS & WELLNESS — Pro niche theme
-- Electric charcoal + lime: FitFlex-inspired, athletic
-- ============================================================
(
  'Fitness & Wellness',
  'fitness-wellness',
  'pro',
  '{
    "colors": {
      "background": "#111111",
      "card": "#1A1A1A",
      "primary": "#C8E645",
      "secondary": "#DCEF5A",
      "text": "#FFFFFF",
      "textMuted": "#7D7D7D",
      "border": "rgba(200,230,69,0.15)"
    },
    "fonts": {
      "heading": "Barlow Condensed",
      "body": "Barlow"
    },
    "borderRadius": "6px",
    "heroLayout": "fullwidth",
    "cardStyle": "bold"
  }',
  TRUE
),

-- ============================================================
-- HOME & LIFESTYLE — Pro niche theme
-- Warm minimal: Alan-inspired, clean beige warmth
-- ============================================================
(
  'Home & Lifestyle',
  'home-lifestyle',
  'pro',
  '{
    "colors": {
      "background": "#FAFAF7",
      "card": "#FFFFFF",
      "primary": "#D97706",
      "secondary": "#F59E0B",
      "text": "#1C1C1C",
      "textMuted": "#6B7280",
      "border": "rgba(0,0,0,0.08)"
    },
    "fonts": {
      "heading": "Cormorant Garamond",
      "body": "Jost"
    },
    "borderRadius": "12px",
    "heroLayout": "centered",
    "cardStyle": "warm"
  }',
  TRUE
),

-- ============================================================
-- TECH & MOBILE ACCESSORIES — Pro niche theme
-- Clean tech green: SmartTech-inspired, modern white + green
-- ============================================================
(
  'Tech & Mobile',
  'tech-mobile',
  'pro',
  '{
    "colors": {
      "background": "#FFFFFF",
      "card": "#F8F9FA",
      "primary": "#16A34A",
      "secondary": "#22C55E",
      "text": "#111827",
      "textMuted": "#6B7280",
      "border": "rgba(0,0,0,0.07)"
    },
    "fonts": {
      "heading": "Plus Jakarta Sans",
      "body": "Plus Jakarta Sans"
    },
    "borderRadius": "8px",
    "heroLayout": "split",
    "cardStyle": "clean"
  }',
  TRUE
)

ON CONFLICT (slug) DO NOTHING;

-- Confirm insertion
SELECT name, slug, tier_required FROM themes ORDER BY tier_required, name;
