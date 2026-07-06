# Premium Theme Templates — Beauty (Reference Build) — Design

**Date:** 2026-07-03
**Status:** Approved design → ready for implementation plan
**Scope:** ONE theme (`beauty-fashion`) across BOTH surfaces (store homepage + AI landing page), as the reference implementation. The other 4 themes (tech, sport, car, home) each get their own spec+plan reusing this architecture.

---

## Goal

Give each premium theme its own faithful full-page templates — reproducing the layout/structure/style of the Claude Design reference files — filled with the merchant's real data plus tasteful French default copy for editorial slots (headline, promo, reviews). All existing commerce functionality (ordering, stock, DZD pricing, wilaya dropdown, WhatsApp) is preserved unchanged; only the visual layer changes.

Beauty is built first because it is the entry-tier (Pro) theme, the test store `nova` already uses it (enabling free live verification), and its reference file is already authored as a slot-based template.

## Non-goals (this build)

- The other 4 themes (separate specs).
- New merchant-editable settings fields for the editorial slots (headline/promo/testimonials). This build uses French **defaults** only (per approved "Choice B"); an editable-fields pass comes later.
- Category data for products (schema has none) → collection tiles are decorative for now.

---

## Architecture

### Theme dispatcher (the seam)

`StoreHomepage` and `LandingPageRenderer` are each rendered from multiple routes:
- Store home: `src/app/(store)/page.tsx`, `src/app/store/page.tsx`
- Landing: `src/app/(store)/p/[slug]/page.tsx`, `src/app/store/p/[slug]/page.tsx`, `src/app/(platform)/dashboard/pages/new/page.tsx` (generator preview)

Rather than swap imports in every route, introduce two thin dispatcher components that look up the active theme by `store.theme?.slug` and render the matching bespoke template, falling back to the current generic renderer for any theme without one.

**New files:**
- `src/components/store/themes/registry.tsx` — maps theme slug → `{ StoreHome, Landing }` React components. Unknown/absent slug → `null` (dispatcher falls back to generic).
- `src/components/store/ThemedStoreHome.tsx` — dispatcher. Props identical to `StoreHomepage` (`store`, `products`, `landingPages`). Renders `registry[slug]?.StoreHome ?? StoreHomepage`.
- `src/components/store/ThemedLanding.tsx` — dispatcher. Props identical to `LandingPageRenderer` (`landingPage`, `store`). Renders `registry[slug]?.Landing ?? LandingPageRenderer`.

**Modified files:** the 5 route files above swap their direct import of `StoreHomepage`/`LandingPageRenderer` for the dispatcher. No prop changes.

This keeps `StoreHomepage`/`LandingPageRenderer` intact as the default and guarantees every non-Beauty theme is byte-for-byte unchanged.

### Beauty template components

`src/components/store/themes/beauty/`
- `BeautyStoreHome.tsx` — full Beauty storefront (client component; owns product-modal state).
- `BeautyLanding.tsx` — Beauty-skinned landing page.
- `beautyDefaults.ts` — French default copy (hero headline/subtitle/CTA, promo banners, about text, stats, trust badges, collection tiles, footer columns) in one place so the later "editable fields" pass has a clear swap point.

### Shared/reused (NOT duplicated)

- `StoreOrderModal` (product-click order popup) — reused as-is by BeautyStoreHome.
- `OrderFormFields` (inline order form with wilaya/phone/upsell) — reused as-is by BeautyLanding.
- Stock gating logic, DZD formatting (`toLocaleString('fr-DZ')`), `buildWaLink`/`toWaNumber` — reused.
- Google Fonts loader pattern (inline `@import`) — Beauty loads `Cormorant Garamond` + `Jost`.

---

## Data flow — Beauty store homepage

Consumes the same props as `StoreHomepage`: `store`, `products[]`, `landingPages[]`.

| Design section | Source | Notes |
|---|---|---|
| Header + nav | `store.name`, `store.logo_url` | Nav = French anchors (Accueil/Boutique/À propos/Contact) scrolling to sections |
| Hero | French default headline/subtitle/CTA (`beautyDefaults`) | Hero image = `products[0].images[0]` if present, else tinted gradient placeholder. CTA scrolls to `#produits` |
| Collections row | French default tiles (`beautyDefaults.collections`) | Decorative; each links to `#produits`. No category data in schema |
| Featured campaigns | `landingPages[]` | Preserve the "Offres spéciales" concept from StoreHomepage, restyled; links to `/p/[slug]` (respecting dev `?store=` query) |
| Products grid | `products[]` | name, `price` DZD, PROMO badge when `compare_price`, static 5-star, colors preview. Click → `StoreOrderModal`. Empty state when no products |
| Promo banners (×2) | French defaults | Static, link to `#produits` |
| About + stats | `store.settings?.bio` if present else French default; stats = French defaults | e.g. "58 wilayas", "Paiement à la livraison" |
| Brand marquee | **Dropped** | Replaced by a payment/trust badge strip (French) |
| Features / trust row | French defaults | Livraison / Paiement à la livraison / Qualité |
| Footer | `store.name`, `store.settings` socials, French default link columns | "© {year} {name} · Propulsé par Krenix" |

**Order path:** identical to today — clicking a product opens `StoreOrderModal`. Header "Commander" uses WhatsApp when `store.settings.whatsapp` is valid (via `toWaNumber`), else scrolls to `#produits`.

## Data flow — Beauty landing page

Consumes the same props as `LandingPageRenderer`: `landingPage`, `store`. Renders the **same content model** (`landingPage.content`: hero/benefits/product_details/social_proof/order_form/urgency, plus `product`, `generated_images`, `stock`, `upsell_*`) in Beauty's aesthetic.

Preserved behaviors (must match `LandingPageRenderer`):
- FR/AR language toggle (`_ar`), RTL handling, Cairo font for Arabic.
- Hero image gallery (generated images → product images → fallback).
- Stock: `outOfStock` blocks the order form with the rupture message; `lowStock` shows "Plus que N en stock".
- Plan gates: countdown timer (Pro), recent-clients ticker (Ultimate), sticky mobile CTA (Pro).
- Lead capture form (`/api/leads`).
- Inline `OrderFormFields` with `overridePrice` and `upsell`.
- DZD price + compare price, "Livraison 58 wilayas".

Beauty restyles these sections (Cormorant Garamond headings, blush/coral palette, luxury card treatment) but changes no logic, endpoints, or gating.

---

## Error / edge handling

- No products → Beauty hero + collections still render; products section shows the French empty state.
- No logo → brand mark fallback (initial in a coral tile), mirroring existing pattern.
- No hero/product image → tinted gradient placeholder.
- Unknown theme slug or missing template → dispatcher falls back to generic renderer (already the default path).
- Out-of-stock landing → order form replaced by rupture message (existing behavior).

## Testing / verification (no paid AI calls)

1. `npx tsc --noEmit` clean; `npx eslint` clean on new/changed files.
2. Live store home: `/store?store=nova` (nova uses `beauty-fashion`) — verify header/hero/products/order popup via preview `inspect`/`snapshot` (colors: blush `#FDEEEE`, Cormorant Garamond, coral `#E85D5D`; product click opens modal).
3. Live landing: an existing `beauty-fashion` landing page via `/store/p/[slug]?store=nova` — verify hero gallery, order form, stock message, footer.
4. Regression: a non-Beauty store still renders the generic templates unchanged.

## Rollout / future swap points

- Other 4 themes: add `beauty/`-style folders + register; no dispatcher changes needed.
- Later "editable editorial fields": replace `beautyDefaults` reads with `store.settings` fields + dashboard UI.
- `/theme-preview/beauty-fashion` may later render `BeautyStoreHome` with demo data instead of the standalone demo page (optional; out of scope here).

---

## Open decisions (confirmed with user)

- Collections = French default decorative tiles (no category data). ✔
- Brand marquee dropped, replaced by trust/payment badges. ✔
- About/stats = French defaults. ✔
- Editorial slots use French defaults now, editable fields later (Choice B). ✔
- Both surfaces in scope; Beauty first, then the other four. ✔
