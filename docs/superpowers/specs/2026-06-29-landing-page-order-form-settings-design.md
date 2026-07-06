# Krenix — Landing Page + Settings + Pro Features Design Spec
**Date:** 2026-06-29  
**Status:** Approved by user

---

## 1. Landing Page — Inline Order Form (Option C)

### What changes
- Extract shared form logic from `StoreOrderModal.tsx` into `/components/store/OrderFormFields.tsx`
  - Props: `product, store, landingPageId?, onSuccess`
  - Contains: color/size selectors, quantity stepper, name, phone (Algerian validation), wilaya (58-dropdown), commune, price summary, submit
  - Inserts into `orders` table with `source: 'landing_page'`
- `LandingPageRenderer.tsx` adds a `<section id="order-form">` near the bottom that renders `<OrderFormFields>`
- The sticky header "Commander" button becomes `<a href="#order-form" scroll>` — smooth scroll anchor, no modal
- `StoreOrderModal.tsx` also uses `<OrderFormFields>` — no logic duplication
- Success state: inline green confirmation message within the form section (no modal close needed)

### Order
color/size → quantity → name → phone → wilaya → commune → price summary → submit

### Validation rules (unchanged)
- Phone: `/^(05|06|07)\d{8}$/`
- Wilaya: must be from WILAYAS array
- Name + commune: required, trimmed

---

## 2. Landing Page — Visual Redesign (ayor.ai quality)

### Typography
- Arabic content: `Cairo` (Google Fonts) — bold weights for headlines
- French content: `Sora` (Google Fonts) — bold for headlines, regular for body
- Both loaded via `<link>` in the renderer's inline style block

### Hero section
- Full-bleed product image (edge-to-edge, `object-cover`)
- Dark gradient overlay: `linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)`
- Headline rendered ON TOP of the image in large bold white text
- Floating price badge: pill shape, bottom-left of image, store primary color background
- Discount badge top-right if `comparePrice` exists

### Trust bar (below hero)
Horizontal 3-column strip:
- ✅ Paiement à la livraison / الدفع عند الاستلام
- 🚚 Livraison 58 wilayas / توصيل 58 ولاية  
- 🔒 Qualité garantie / ضمان الجودة

### Plan-based additions
- **Pro + Ultimate:** animated countdown urgency timer (renders from `urgency.deadline` if present, otherwise 24h from page load)
- **Pro + Ultimate:** sticky bottom bar on mobile — shows price + "Commander →" button anchored to `#order-form`
- **Ultimate only:** "Clients récents" scrolling ticker — shows 5 fake wilaya names cycling (e.g. "Amira de Oran vient de commander…")

### RTL support
- Arabic: `dir="rtl"`, trust bar order reverses, price badge moves to bottom-right
- Font switches to Cairo

---

## 3. Puppeteer Ad Image Generator (Pro Feature)

### Dependencies
```
@sparticuz/chromium (Vercel-compatible)
puppeteer-core
```

### API route
`POST /api/ai/generate-photo`

Request body:
```ts
{
  landingPageId: string
  format: 'square' | 'story'  // 1080×1080 or 1080×1920
  templateIndex: number        // 0, 1, or 2
}
```

Flow:
1. Auth check — user must own the landing page's store
2. Plan check — store.plan must be 'pro' | 'ultimate' | 'sur_mesure'
3. Load landing page + store from Supabase
4. Render HTML template (see below) with Puppeteer
5. Return JPG buffer as `Content-Disposition: attachment; filename="ad-{slug}.jpg"`

### HTML Templates (3 variants in `/lib/ad-templates/`)
- `template-dark.html` — dark bg, neon accent, product centered, price badge
- `template-light.html` — white bg, product photo dominant, minimal text overlay
- `template-dramatic.html` — full-bleed product photo, text overlay, Algerian map silhouette background

All templates:
- Receive data via `?data=base64(JSON)` query param injected by Puppeteer
- Use inline CSS only (no external fonts at render time — embed Base64 font)
- Arabic headline + price + store name + "الدفع عند الاستلام · التوصيل لكل الجزائر"

### Dashboard UI
Location: `/dashboard/pages/[id]` — new "Générer une image pub" card section  
- Format picker: Carré (1:1) / Story (9:16)
- Template carousel: 3 preview thumbnails (static screenshots)
- "Générer et télécharger" button
- Plan gate: Basic sees the card grayed out with lock + "Passer à Pro"

---

## 4. Settings Page — Extended (Option C)

### New fields added to existing `/dashboard/settings`

**Section: Identité de la boutique** (renamed from "Informations générales")
- Store name (existing)
- Store description / bio (textarea, 200 chars max) — used in trust badges on landing pages
- Email professionnel
- Adresse physique (optional, used in footer of landing pages)
- Logo upload (existing from onboarding, display + replace button)
- Bannière boutique upload (new — 1200×400px recommended, shown on store homepage header)

**Section: Réseaux sociaux** (extended)
- WhatsApp (existing)
- Facebook (existing)  
- Instagram (existing)
- TikTok (new) — placeholder: `@maboutique`
- Snapchat (new) — placeholder: `@maboutique`
- YouTube (new) — placeholder: `youtube.com/@maboutique`

**Section: Livraison** (existing, unchanged)

### Storage
Banner image: `store-logos` Supabase bucket (already defined in `005_storage.sql`), path: `{store_id}/banner.jpg`  
Saved to `stores.settings.bannerUrl`  
Social fields saved to `stores.settings.tiktok`, `stores.settings.snapchat`, `stores.settings.youtube`  
Bio/email/address saved to `stores.settings.bio`, `stores.settings.email`, `stores.settings.address`

---

## 5. Pro Plan Feature Additions — UI Shells

### New dashboard nav items (Pro-gated)
All show proper empty states with icon + description + "Bientôt disponible" or "Configurer" CTA. No blank pages.

| Feature | Route | Status |
|---|---|---|
| Advanced Analytics | `/dashboard/analytics` | Shell — charts with placeholder data |
| Delivery Integrations | `/dashboard/integrations/delivery` | Shell — Yalidine, Zr Express, Maystro cards |
| SKU & Stock Management | `/dashboard/products` | Already has stock field — add SKU column + low-stock alert |
| Google Sheets Integration | `/dashboard/integrations/sheets` | Shell — OAuth connect button (non-functional) |
| Google Tag Manager | `/dashboard/integrations/gtm` | Shell — GTM ID input field, instructions |
| Abandoned Cart Recovery | `/dashboard/integrations/abandoned-cart` | Shell — concept explanation + "coming soon" |

### Navigation change
Add "Intégrations" nav item in dashboard sidebar (Pro/Ultimate only, locked for Basic)

---

## 6. Basic Plan — Theme Changer

### Structure
- 1 free theme (current dark theme, renamed "Krenix Dark")
- 5 locked themes — one per niche:
  - Beauty & Fashion
  - Home & Lifestyle
  - Automotive Accessories
  - Fitness & Wellness
  - Tech & Mobile Accessories
- UI: `/dashboard/themes` page with theme cards (preview thumbnail + name + niche tag)
- Locked themes show lock icon + niche badge, clickable opens upgrade modal
- Free theme shows "Actif" badge
- Theme config pulled from existing `themes` table in Supabase

**Note:** Visual designs for the 5 locked themes will be added after user provides reference screenshots.

---

## Implementation Order

1. `OrderFormFields` shared component + update `LandingPageRenderer` + update `StoreOrderModal`
2. `LandingPageRenderer` visual redesign (ayor.ai quality)
3. Settings page extensions
4. Puppeteer setup + `/api/ai/generate-photo` + dashboard UI
5. Pro feature shells (nav + pages)
6. Basic theme changer shell (themes data in DB, UI page — designs added later)
