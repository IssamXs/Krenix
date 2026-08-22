# Homepage browsing: bordered back-link, manual product order, hero picker

## 1. Border on "Retour à la boutique"
`StandaloneProductView.tsx` renders the back-to-store link as bare text. Give it
the same bordered-pill treatment `ThemedLanding.tsx` already uses elsewhere,
using the store's theme `border` color/`card` background so it matches every
theme automatically.

## 2. Manual product order
- `database/060_product_position.sql`: adds `products.position INTEGER`,
  backfills existing rows (ordered by `created_at ASC` → 0, 1, 2, …) per store,
  and adds a `BEFORE INSERT` trigger that assigns new rows
  `COALESCE(MAX(position)+1, 0)` per store when `position` isn't supplied.
- `position` becomes the single order everywhere (dashboard list default,
  storefront grid, theme homes). The existing "active promo floats to top"
  sort is removed — merchants now fully control order by dragging, matching
  the "manual order wins" decision.
- Dashboard **Produits** page (`src/app/(platform)/dashboard/products/page.tsx`):
  drag-handle reordering, enabled only when search is empty and sort is the
  default (dragging while a text/price sort is applied would be misleading).
  On drop, persists new `position` values for the affected rows.
- Storefront queries (`src/app/(store)/page.tsx`, `src/app/store/page.tsx`)
  order by `position ASC` (fallback `created_at DESC` for any null positions
  before the migration runs).

## 3. "Nouvelle collection" hero picker
- `HomepageEditorSettings` gains `heroProductId?: string`.
- Dashboard Pro édition panel (`src/app/(platform)/dashboard/settings/page.tsx`)
  gets a product `<select>` next to the existing homepage toggles.
- The 5 niche theme homes (`beauty`, `tech`, `sport`, `car`, `home`) resolve
  `heroProduct` as: explicit `heroProductId` match → first product with a
  photo → first product → null (unchanged fallback chain, just with the
  explicit pick tried first).

## Out of scope
- No changes to the default (non-niche) `StoreHomepage.tsx` hero (it has no
  swipe/hero section).
- No migration needed for `heroProductId` — it lives in the existing
  `stores.settings` JSONB column.
