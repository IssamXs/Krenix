# Product Badges (Ultimate+) — Design Spec

## Goal
Let store owners on Ultimate+ plans manually tag products with merchandising badges
(Winner, Bestseller, On Sale, etc.) shown on the storefront, so they have full
control over which products get highlighted — instead of the current automatic
"PROMO" badge that only reacts to `compare_price`.

## Badge catalog
Single source of truth: `src/lib/product-badges.ts`. Fixed list of 10 badges, each
with an id, a plain-text French label, an optional emoji, and a fixed hex color
(not theme-tokenized, so a badge reads the same regardless of the active niche
theme — same approach the current auto "PROMO" badge already uses).

| id | Label (FR) | Emoji (optional) | Color |
|---|---|---|---|
| `winner` | Winner | 🏆 | gold |
| `bestseller` | Meilleure vente | 🔥 | red |
| `promo` | En promo | — | rose |
| `new` | Nouveau | ✨ | blue |
| `limited_edition` | Édition limitée | — | purple |
| `staff_pick` | Coup de cœur | ❤️ | pink |
| `trending` | Tendance | 📈 | orange |
| `low_stock` | Stock limité | ⚡ | amber |
| `exclusive` | Exclusif | 💎 | indigo |
| `expert_choice` | Choix des experts | ✅ | green |

Labels are plain text by default (no emoji baked in). Emojis only render when the
store owner opts in — see "Emoji toggle" below.

## Emoji toggle
A single store-wide setting, `store.settings.showBadgeEmojis` (boolean, default
`false`), controlled by a toggle in the dashboard's badge picker section. When on,
every rendered badge is prefixed with its catalog emoji (badges without an emoji
in the catalog are unaffected). This keeps the data model simple — badges stay a
plain `string[]` of ids, no per-badge-instance emoji state.

## Data model
- Migration `042_product_badges.sql`:
  - `ALTER TABLE products ADD COLUMN badges TEXT[] NOT NULL DEFAULT '{}';`
  - A `BEFORE INSERT OR UPDATE` trigger on `products` that looks up the owning
    store's `plan` and forces `NEW.badges := '{}'` unless the plan is in
    `ULTIMATE_PLANS` (`ultimate, growth, business, agency, enterprise, sur_mesure`).
    This mirrors migration 025's store-column-security pattern: client-side gating
    alone isn't enough since owners can write directly via the browser console.
- `Product` type gains `badges: string[]`.

## Dashboard
- **Product edit page** (`dashboard/products/[id]/page.tsx`): new "Badges" section
  — multi-select toggle chips (color-coded, label only unless emoji toggle is on),
  any combination allowed. Includes the store-wide "Afficher les emojis" toggle.
  Shown only when `store.plan` ∈ `ULTIMATE_PLANS`; otherwise render
  `<LockedFeatureCard title="Badges produits" requiredPlan="ultimate" />`.
- **Products list** (`dashboard/products/page.tsx`): small read-only colored chip
  row per product showing its active badges.

## Storefront
- New shared component `<ProductBadgeStack badges={...} showEmojis={...} />` —
  renders a small stacked-pill cluster, top-left of the product image.
- Replaces the existing hardcoded "PROMO on `compare_price`" badge everywhere it
  currently appears:
  - `StoreHomepage.tsx` (legacy/default theme)
  - 5 niche `*StoreHome.tsx` files (tech, sport, home, car, beauty)
  - `StandaloneProductView.tsx` (product detail page)
  - 5 niche `*Landing.tsx` files
  - `LandingPageRenderer.tsx`
- Grid/card views show the top 2 badges (by catalog priority order) to avoid
  clutter on small cards; product detail/landing pages show all selected badges.
- Storefront components additionally check `store.plan` ∈ `ULTIMATE_PLANS` before
  rendering the badge stack at all, so a downgraded store's stale badge data
  (written before downgrade, not yet cleared by the trigger) also stops showing
  immediately — not just on the product's next edit.
- The old automatic "PROMO on `compare_price`" badge is removed; `promo` is now a
  manually-applied tag like the other 9.

## Pricing page
- Add a line "Badges produits (Winner, Bestseller, etc.)" to the Ultimate plan's
  feature list in `src/app/(platform)/pricing/page.tsx`. Inherited by
  Growth/Business/Agency/Enterprise via their existing "Tout ce qu'il y a dans X"
  copy — no separate line needed on those tiers.

## Out of scope
- No automatic/computed badges (e.g. bestseller derived from real order counts) —
  everything here is manually set by the owner.
- No custom/user-defined badges beyond the fixed catalog of 10.
- No per-badge-instance emoji override — emoji visibility is a single store-wide
  toggle.
