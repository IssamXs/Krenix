-- ============================================================
-- KRENIX — SEED DATA
-- Migration 003: Default Themes
-- Run this AFTER 002_rls.sql
-- ============================================================

INSERT INTO themes (name, slug, tier_required, config, is_active) VALUES

-- ============================================================
-- BASIC THEMES (3 themes — available to all)
-- ============================================================

(
  'Classique',
  'classique',
  'basic',
  '{
    "colors": {
      "background": "#0A0A0F",
      "card": "#111118",
      "primary": "#F59E0B",
      "secondary": "#3B82F6",
      "text": "#FFFFFF",
      "textMuted": "#9CA3AF",
      "border": "rgba(255,255,255,0.1)"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Inter"
    },
    "borderRadius": "12px",
    "heroLayout": "centered",
    "cardStyle": "glassmorphic"
  }',
  TRUE
),

(
  'Sombre',
  'sombre',
  'basic',
  '{
    "colors": {
      "background": "#000000",
      "card": "#0D0D0D",
      "primary": "#FFFFFF",
      "secondary": "#888888",
      "text": "#FFFFFF",
      "textMuted": "#666666",
      "border": "rgba(255,255,255,0.08)"
    },
    "fonts": {
      "heading": "Space Grotesk",
      "body": "Inter"
    },
    "borderRadius": "4px",
    "heroLayout": "split",
    "cardStyle": "minimal"
  }',
  TRUE
),

(
  'Chaleureux',
  'chaleureux',
  'basic',
  '{
    "colors": {
      "background": "#1A1209",
      "card": "#241A0E",
      "primary": "#D97706",
      "secondary": "#92400E",
      "text": "#FEF3C7",
      "textMuted": "#D97706",
      "border": "rgba(217,119,6,0.2)"
    },
    "fonts": {
      "heading": "Playfair Display",
      "body": "Inter"
    },
    "borderRadius": "8px",
    "heroLayout": "centered",
    "cardStyle": "warm"
  }',
  TRUE
),

-- ============================================================
-- PRO THEMES (5 themes — Pro + Ultimate only)
-- ============================================================

(
  'Flash Sale',
  'flash-sale',
  'pro',
  '{
    "colors": {
      "background": "#0A0000",
      "card": "#1A0000",
      "primary": "#EF4444",
      "secondary": "#F59E0B",
      "text": "#FFFFFF",
      "textMuted": "#FCA5A5",
      "border": "rgba(239,68,68,0.3)"
    },
    "fonts": {
      "heading": "Space Grotesk",
      "body": "Inter"
    },
    "borderRadius": "8px",
    "heroLayout": "fullwidth",
    "cardStyle": "bold"
  }',
  TRUE
),

(
  'Luxe',
  'luxe',
  'pro',
  '{
    "colors": {
      "background": "#0A0800",
      "card": "#141000",
      "primary": "#D4AF37",
      "secondary": "#B8962E",
      "text": "#FFF8E7",
      "textMuted": "#D4AF37",
      "border": "rgba(212,175,55,0.2)"
    },
    "fonts": {
      "heading": "Cormorant Garamond",
      "body": "Inter"
    },
    "borderRadius": "2px",
    "heroLayout": "split",
    "cardStyle": "luxury"
  }',
  TRUE
),

(
  'Moderne',
  'moderne',
  'pro',
  '{
    "colors": {
      "background": "#050510",
      "card": "#0D0D1A",
      "primary": "#818CF8",
      "secondary": "#6366F1",
      "text": "#FFFFFF",
      "textMuted": "#A5B4FC",
      "border": "rgba(129,140,248,0.15)"
    },
    "fonts": {
      "heading": "Space Grotesk",
      "body": "Inter"
    },
    "borderRadius": "16px",
    "heroLayout": "centered",
    "cardStyle": "glassmorphic"
  }',
  TRUE
),

(
  'Minimaliste Pro',
  'minimaliste-pro',
  'pro',
  '{
    "colors": {
      "background": "#FAFAFA",
      "card": "#FFFFFF",
      "primary": "#111111",
      "secondary": "#666666",
      "text": "#111111",
      "textMuted": "#666666",
      "border": "rgba(0,0,0,0.08)"
    },
    "fonts": {
      "heading": "Playfair Display",
      "body": "Inter"
    },
    "borderRadius": "0px",
    "heroLayout": "split",
    "cardStyle": "clean"
  }',
  TRUE
),

(
  'Coloré',
  'colore',
  'pro',
  '{
    "colors": {
      "background": "#0A0015",
      "card": "#130020",
      "primary": "#A855F7",
      "secondary": "#EC4899",
      "text": "#FFFFFF",
      "textMuted": "#D8B4FE",
      "border": "rgba(168,85,247,0.2)"
    },
    "fonts": {
      "heading": "Space Grotesk",
      "body": "Inter"
    },
    "borderRadius": "20px",
    "heroLayout": "centered",
    "cardStyle": "vibrant"
  }',
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- CONFIRMATION
-- ============================================================
SELECT 
  name,
  tier_required,
  'Active' as status
FROM themes 
ORDER BY 
  CASE tier_required 
    WHEN 'basic' THEN 1 
    WHEN 'pro' THEN 2 
    WHEN 'ultimate' THEN 3 
  END,
  name;
