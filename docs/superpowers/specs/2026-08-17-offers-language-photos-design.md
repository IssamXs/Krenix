# Design: Product Offers, AI Landing Page Language, Larger Storefront Photos

Date: 2026-08-17

## 1. Product Offers

### Goal
Store owners can attach one promotional offer (e.g. "buy 2 get 1 free", "buy 2 for -20%") to a product, chosen from 10 curated preset suggestions, and have it automatically applied on the storefront — both as marketing display and as the actual charged price.

### Data model
Add columns to `products` table (new migration, next available number):
- `offer_type text` — one of: `buy_x_get_y_free`, `buy_x_get_percent_off`, `nth_item_percent_off`, `bundle_fixed_price`, `flat_percent_off`, `tiered_discount`, or `NULL` (no offer)
- `offer_config jsonb` — type-specific parameters (see below)
- `offer_label text` — display badge text (auto-filled from preset copy, editable)
- `offer_active boolean default false`

Only one offer can be active per product at a time (setting a new one replaces the old).

### The 6 calculation types (backing the 10 presets)
| type | config shape | meaning |
|---|---|---|
| `buy_x_get_y_free` | `{buyQty, freeQty}` | every `buyQty` paid items, add `freeQty` free items |
| `buy_x_get_percent_off` | `{buyQty, percentOff}` | if quantity ≥ `buyQty`, apply `percentOff` to the whole order |
| `nth_item_percent_off` | `{nth, percentOff}` | every `nth`-th unit is discounted by `percentOff` |
| `bundle_fixed_price` | `{bundleQty, bundlePrice}` | every `bundleQty` units sold together cost a flat `bundlePrice` |
| `flat_percent_off` | `{percentOff}` | flat discount regardless of quantity |
| `tiered_discount` | `{tiers: [{minQty, percentOff}]}` | highest tier whose `minQty` is met applies |

### The 10 preset suggestions (dashboard UI)
1. Achetez 2, obtenez 1 gratuit — `buy_x_get_y_free` {2,1}
2. Achetez 3, obtenez 1 gratuit — `buy_x_get_y_free` {3,1}
3. 2ème article à -50% — `nth_item_percent_off` {2,50}
4. -20% dès 2 articles achetés — `buy_x_get_percent_off` {2,20}
5. -30% dès 3 articles achetés — `buy_x_get_percent_off` {3,30}
6. Pack de 2 à prix fixe — `bundle_fixed_price` {2, owner sets price}
7. Pack de 3 à prix fixe — `bundle_fixed_price` {3, owner sets price}
8. -15% sur cet article — `flat_percent_off` {15}
9. -25% sur cet article — `flat_percent_off` {25}
10. Réduction par palier (3+: -10%, 5+: -20%) — `tiered_discount` {[{3,10},{5,20}]}

Presets are defined once in `src/lib/offers.ts` as a constant array with default `offer_config` values and French label copy. The dashboard product create/edit page shows them as selectable cards; selecting one reveals editable number fields pre-filled with the preset defaults (quantity thresholds, %, or bundle price), plus an "Appliquer" button and a disable toggle.

### Shared pricing function
`src/lib/offers.ts` exports `computeOfferPrice(unitPrice, quantity, offerType, offerConfig) → { payableQty, freeQty, unitPriceAfterOffer, totalPrice }`. This is the single reference implementation, used:
- **Client-side** in `OrderFormFields.tsx` for the live quantity stepper and subtotal display (`OrderFormFields.tsx:215`, `:510-519`) — quantity stepper snaps to offer-aware steps and shows bonus units (e.g. "3 (dont 1 gratuit)").
- **Server-side** as a mirrored PL/pgSQL function, called from the existing `validate_order_insert` trigger (`database/036_authorization_hardening.sql:100-152`), which already re-derives `unit_price`/`total_price` from the `products` table and discards client-submitted values. The trigger is extended to also read `offer_type`/`offer_config`/`offer_active` and apply the same formula before writing `NEW.unit_price`/`NEW.total_price`.

Both implementations must produce identical results for the same inputs. Because all 6 formulas are simple arithmetic (no external state), this is kept in sync by writing the TS version first as the reference and transliterating it directly to PL/pgSQL, with a shared code comment in both files pointing at each other.

### Storefront display
- Offer badge (`offer_label`) shown on product cards (`ProductCardImage.tsx` overlay) and on the landing page renderer, wherever `compare_price`/badges currently render.
- `OrderFormFields.tsx` quantity control becomes offer-aware per above.

### Out of scope
- Stacking multiple simultaneous offers on one product.
- AI-generated offer copy/suggestions (presets are fixed, not AI-generated).
- Offers scoped to landing pages independently of the underlying product (the product is the single source of truth, matching the existing "publish landing page → creates product" model).

---

## 2. Arabic/French language for AI landing pages

**Already implemented** in the codebase:
- `LandingPageLanguage = 'fr' | 'ar' | 'both'` (`src/lib/claude.ts:15`)
- `generateLandingPage()` builds distinct FR/AR prompts and JSON schemas, handles `'both'` by requesting bilingual JSON and storing Arabic under `content._ar` (`src/lib/claude.ts:94-260`)
- `/api/ai/landing-page` route accepts `language` param, stores `content._meta.lang` (`src/app/api/ai/landing-page/route.ts`)
- Language picker UI already in `dashboard/pages/new/page.tsx:51,727-750`
- `LandingPageRenderer.tsx` renders RTL for Arabic content (`~line 151`)

**Action**: no new build. Verify end-to-end in the browser — generate a page in FR, in AR, and in "both" — confirm RTL rendering, language switcher, and credit deduction all work correctly. Fix any bugs found during verification; do not re-architect.

---

## 3. Larger storefront product photos

- `StoreHomepage.tsx:204` grid: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4` → `grid-cols-2 sm:grid-cols-3 md:grid-cols-3` (drop desktop from 4 to 3 columns; keep 4:5 aspect ratio and existing `gap-4`). Apply the same column change consistently across the 5 niche theme homepages (`themes/{beauty,car,home,sport,tech}/*StoreHome.tsx`) and `AutoCatalog.tsx`, which currently mirror the same 4-column pattern.
- `StoreHomepage.tsx:143-151` mini-carousel: currently `w-48` (192px) card with a squashed `h-28` (112px) image wrapper. Change the image wrapper to a proper aspect ratio (e.g. `aspect-[4/5]` matching the main grid, sized to the card width) instead of a fixed disproportionate height.

**Out of scope**: landing page hero image (`LandingPageRenderer.tsx:147-148`, already 1:1 fill) and dashboard product-list row thumbnails (`dashboard/products/page.tsx:166-168`, intentionally small for a list view) — both left unchanged.

---

## Testing approach
- Offers: unit-test `computeOfferPrice` in `src/lib/offers.ts` against all 6 types with edge cases (quantity below threshold, exact threshold, above threshold, tier boundaries). Manually verify the SQL trigger mirrors the same results via a test order insert for each offer type.
- Language: manual browser verification only (existing feature, no new automated tests needed).
- Photos: visual verification in the browser at mobile/tablet/desktop breakpoints across at least 2 niche themes plus the generic homepage.
