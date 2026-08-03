# Product Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Ultimate+ store owners manually tag products with one or more of 10 merchandising badges (Winner, Bestseller, En promo, etc.), shown on the storefront, with an optional store-wide toggle to include emojis.

**Architecture:** A fixed badge catalog (`src/lib/product-badges.ts`) is the single source of truth for id/label/emoji/color, consumed by both the dashboard picker and a shared `<ProductBadgeStack>` storefront component. Badges are stored as `products.badges TEXT[]`, gated server-side by a Postgres trigger that clears the array unless the owning store's plan is Ultimate+ (mirrors migration 025's column-protection pattern). The emoji toggle is a single boolean on `store.settings.showBadgeEmojis`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Tailwind, Vitest.

---

## Reference: full spec

See `docs/superpowers/specs/2026-08-03-product-badges-design.md` for the approved design (badge catalog table, gating rules, display scope).

---

### Task 1: Database migration — `badges` column + plan-enforcement trigger

**Files:**
- Create: `Database/042_product_badges.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- ============================================================
-- 042 — Product badges (Winner, Bestseller, etc.), Ultimate+ only
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: store owners on Ultimate+ can tag products with merchandising badges,
-- shown on the storefront. Client-side plan gating alone isn't enough (an
-- owner could write to the column via the browser console), so a trigger
-- clears `badges` on any INSERT/UPDATE unless the owning store's plan is
-- Ultimate+ — same pattern as 025_secure_store_columns.sql.
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS badges TEXT[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION enforce_product_badges_plan()
RETURNS TRIGGER AS $$
DECLARE
  owner_plan TEXT;
BEGIN
  IF NEW.badges IS NULL OR array_length(NEW.badges, 1) IS NULL THEN
    NEW.badges := '{}';
    RETURN NEW;
  END IF;

  SELECT plan INTO owner_plan FROM stores WHERE id = NEW.store_id;

  IF owner_plan IS NULL OR owner_plan NOT IN
     ('ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure')
  THEN
    NEW.badges := '{}';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_product_badges_plan ON products;
CREATE TRIGGER trg_enforce_product_badges_plan
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION enforce_product_badges_plan();
```

- [ ] **Step 2: Deliver the SQL to the user**

Per project convention, don't just reference the file path — paste the full SQL
above in chat (or as an artifact) so the user can run it in Supabase → SQL
Editor. This migration must be run against the live database before Task 5
(dashboard save) and Task 7+ (storefront reads) will work end-to-end; local
dev against a stale schema will otherwise silently no-op on `badges`.

- [ ] **Step 3: Commit**

```bash
git add Database/042_product_badges.sql
git commit -m "feat(db): add product badges column with Ultimate+ enforcement trigger"
```

---

### Task 2: Badge catalog + helpers

**Files:**
- Create: `src/lib/product-badges.ts`
- Test: `src/lib/product-badges.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/product-badges.test.ts
import { describe, it, expect } from 'vitest'
import { BADGE_CATALOG, canUseBadges, getDisplayBadges, formatBadgeLabel } from './product-badges'

describe('canUseBadges', () => {
  it('allows ultimate and above', () => {
    expect(canUseBadges('ultimate')).toBe(true)
    expect(canUseBadges('growth')).toBe(true)
    expect(canUseBadges('enterprise')).toBe(true)
  })

  it('rejects basic and pro', () => {
    expect(canUseBadges('basic')).toBe(false)
    expect(canUseBadges('pro')).toBe(false)
  })
})

describe('getDisplayBadges', () => {
  it('returns an empty array for null/undefined/empty input', () => {
    expect(getDisplayBadges(null)).toEqual([])
    expect(getDisplayBadges(undefined)).toEqual([])
    expect(getDisplayBadges([])).toEqual([])
  })

  it('resolves ids to catalog defs in catalog priority order, regardless of input order', () => {
    const result = getDisplayBadges(['promo', 'winner'])
    expect(result.map(b => b.id)).toEqual(['winner', 'promo'])
  })

  it('ignores unknown ids', () => {
    const result = getDisplayBadges(['winner', 'not_a_real_badge'])
    expect(result.map(b => b.id)).toEqual(['winner'])
  })

  it('caps to `max` when provided', () => {
    const result = getDisplayBadges(['winner', 'bestseller', 'promo'], 2)
    expect(result.map(b => b.id)).toEqual(['winner', 'bestseller'])
  })
})

describe('formatBadgeLabel', () => {
  it('returns plain label when showEmojis is false', () => {
    const winner = BADGE_CATALOG.find(b => b.id === 'winner')!
    expect(formatBadgeLabel(winner, false)).toBe('Winner')
  })

  it('prefixes the emoji when showEmojis is true and the badge has one', () => {
    const winner = BADGE_CATALOG.find(b => b.id === 'winner')!
    expect(formatBadgeLabel(winner, true)).toBe('🏆 Winner')
  })

  it('falls back to plain label when showEmojis is true but the badge has no emoji', () => {
    const promo = BADGE_CATALOG.find(b => b.id === 'promo')!
    expect(promo.emoji).toBeNull()
    expect(formatBadgeLabel(promo, true)).toBe('En promo')
  })
})

describe('BADGE_CATALOG', () => {
  it('has exactly 10 badges with unique ids', () => {
    expect(BADGE_CATALOG).toHaveLength(10)
    expect(new Set(BADGE_CATALOG.map(b => b.id)).size).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- product-badges`
Expected: FAIL with "Cannot find module './product-badges'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/product-badges.ts

export type BadgeId =
  | 'winner' | 'bestseller' | 'promo' | 'new' | 'limited_edition'
  | 'staff_pick' | 'trending' | 'low_stock' | 'exclusive' | 'expert_choice'

export interface BadgeDef {
  id: BadgeId
  label: string
  emoji: string | null
  color: string
}

// Order is also display-priority order — used to cap small cards to the top N.
export const BADGE_CATALOG: BadgeDef[] = [
  { id: 'winner', label: 'Winner', emoji: '🏆', color: '#D4AF37' },
  { id: 'bestseller', label: 'Meilleure vente', emoji: '🔥', color: '#DC2626' },
  { id: 'promo', label: 'En promo', emoji: null, color: '#E11D48' },
  { id: 'new', label: 'Nouveau', emoji: '✨', color: '#2563EB' },
  { id: 'limited_edition', label: 'Édition limitée', emoji: null, color: '#7C3AED' },
  { id: 'staff_pick', label: 'Coup de cœur', emoji: '❤️', color: '#DB2777' },
  { id: 'trending', label: 'Tendance', emoji: '📈', color: '#EA580C' },
  { id: 'low_stock', label: 'Stock limité', emoji: '⚡', color: '#D97706' },
  { id: 'exclusive', label: 'Exclusif', emoji: '💎', color: '#4F46E5' },
  { id: 'expert_choice', label: 'Choix des experts', emoji: '✅', color: '#16A34A' },
]

export const ULTIMATE_PLANS = ['ultimate', 'growth', 'business', 'agency', 'enterprise', 'sur_mesure']

export function canUseBadges(plan: string): boolean {
  return ULTIMATE_PLANS.includes(plan)
}

// Resolves raw badge ids (unordered, possibly containing unknown/stale ids)
// into catalog defs, in catalog priority order. `max` caps the result for
// small grid cards; omit it to return every matched badge.
export function getDisplayBadges(badges: string[] | null | undefined, max?: number): BadgeDef[] {
  if (!badges || badges.length === 0) return []
  const set = new Set(badges)
  const ordered = BADGE_CATALOG.filter(b => set.has(b.id))
  return typeof max === 'number' ? ordered.slice(0, max) : ordered
}

export function formatBadgeLabel(badge: BadgeDef, showEmojis: boolean): string {
  return showEmojis && badge.emoji ? `${badge.emoji} ${badge.label}` : badge.label
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- product-badges`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/product-badges.ts src/lib/product-badges.test.ts
git commit -m "feat: add product badge catalog and display helpers"
```

---

### Task 3: Type updates

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add `badges` to `Product`**

In the `Product` interface (starts at `src/types/database.ts:215`), add the field
right after `custom_note_placeholder`:

```typescript
  custom_note_placeholder: string | null
  // Merchandising tags (Ultimate+). Ids reference BADGE_CATALOG in
  // lib/product-badges.ts. Empty for stores below Ultimate — enforced by the
  // enforce_product_badges_plan DB trigger, not just client-side gating.
  badges: string[]
  created_at: string
```

- [ ] **Step 2: Add `showBadgeEmojis` to `StoreSettings`**

In the `StoreSettings` interface (starts at `src/types/database.ts:89`), add the
field right after `notifyStockAlerts`:

```typescript
  notifyStockAlerts?: boolean
  // Store-wide toggle: prefix rendered product badges with their catalog
  // emoji (Ultimate+ feature; see lib/product-badges.ts). Absent = off.
  showBadgeEmojis?: boolean
}
```

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add badges and showBadgeEmojis to Product/StoreSettings types"
```

---

### Task 4: Shared storefront badge component

**Files:**
- Create: `src/components/store/ProductBadgeStack.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { getDisplayBadges, formatBadgeLabel } from '@/lib/product-badges'

interface Props {
  badges: string[] | null | undefined
  showEmojis: boolean
  max?: number
  size?: 'sm' | 'md'
}

// Small stacked-pill cluster, meant to sit `absolute top-2 left-2` (or `top-4
// left-4` on larger detail views) over a product image. Renders nothing when
// there are no badges to show — callers don't need to guard.
export default function ProductBadgeStack({ badges, showEmojis, max, size = 'sm' }: Props) {
  const list = getDisplayBadges(badges, max)
  if (list.length === 0) return null

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'

  return (
    <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-[1] pointer-events-none">
      {list.map(b => (
        <span
          key={b.id}
          className={`${padding} rounded-lg font-bold shadow-sm whitespace-nowrap`}
          style={{ background: b.color, color: '#fff' }}
        >
          {formatBadgeLabel(b, showEmojis)}
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/store/ProductBadgeStack.tsx
git commit -m "feat: add shared ProductBadgeStack storefront component"
```

---

### Task 5: Dashboard product edit page — badge picker

**Files:**
- Modify: `src/app/(platform)/dashboard/products/[id]/page.tsx`

- [ ] **Step 1: Add imports and state**

Replace the import block at the top:

```typescript
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, Plus, Trash2, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react'
import PriceSuggestion from '@/components/dashboard/PriceSuggestion'
import VariantStockEditor, { type VariantState } from '@/components/dashboard/VariantStockEditor'
import { sumStock } from '@/lib/variants'
import type { DeliveryProvider, StoreSettings } from '@/types/database'
import { COURIERS } from '@/lib/couriers'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { BADGE_CATALOG, canUseBadges, formatBadgeLabel } from '@/lib/product-badges'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
```

Add new state alongside the existing `useState` declarations (right after
`const [preferredProvider, setPreferredProvider] = useState<DeliveryProvider | ''>('')`):

```typescript
  const [storePlan, setStorePlan] = useState<string | null>(null)
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [badges, setBadges] = useState<string[]>([])
  const [showBadgeEmojis, setShowBadgeEmojis] = useState(false)
```

- [ ] **Step 2: Load store plan/settings and product badges**

Add a new `useEffect` right after the existing delivery-connections `useEffect`
(after the `}, [])` that closes the `fetch('/api/integrations/delivery')` effect):

```typescript
  useEffect(() => {
    if (!storeId) return
    const supabase = createClient()
    supabase.from('stores').select('plan, settings').eq('id', storeId).single().then(({ data }) => {
      if (!data) return
      setStorePlan(data.plan)
      setStoreSettings(data.settings)
      setShowBadgeEmojis(!!data.settings?.showBadgeEmojis)
    })
  }, [storeId])
```

In the existing product-loading `useEffect`, add `setBadges(data.badges ?? [])`
right after the `setCustomNoteRequired(!!data.custom_note_required)` line.

- [ ] **Step 3: Include `badges` in the save payload**

In `handleSave`, add `badges,` to the `.update({ ... })` call, right after
`preferred_delivery_provider: preferredProvider || null,`:

```typescript
      preferred_delivery_provider: preferredProvider || null,
      badges,
    }).eq('id', productId)
```

Right after the existing `if (updateError) { ... return }` block in `handleSave`
(before `router.push('/dashboard/products')`), persist the emoji toggle if it
changed — this is a store-wide setting, not a product field, so it's a
separate write that preserves every other settings key:

```typescript
    if (storeId && storeSettings && storePlan && canUseBadges(storePlan) && showBadgeEmojis !== !!storeSettings.showBadgeEmojis) {
      await supabase.from('stores')
        .update({ settings: { ...storeSettings, showBadgeEmojis } })
        .eq('id', storeId)
    }

    router.push('/dashboard/products')
```

- [ ] **Step 4: Add the Badges section to the form**

Insert this new section between the "Variants" section and the delivery
`connectedProviders.length > 0 &&` section:

```tsx
      {/* Badges */}
      {storePlan && canUseBadges(storePlan) ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-dash-ink font-semibold text-sm">Badges produits</h3>
            <button
              type="button"
              onClick={() => setShowBadgeEmojis(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                showBadgeEmojis
                  ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-faint'
              }`}
            >
              {showBadgeEmojis ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              Afficher les emojis
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {BADGE_CATALOG.map(b => {
              const active = badges.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBadges(prev => active ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    active ? 'text-white border-transparent' : 'border-dash-border text-dash-ink-soft hover:border-dash-ink-faint/40'
                  }`}
                  style={active ? { background: b.color } : {}}
                >
                  {formatBadgeLabel(b, showBadgeEmojis)}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-dash-ink-faint">
            Les 2 badges les plus prioritaires s&apos;affichent sur les vignettes produit ; tous s&apos;affichent sur la fiche produit.
          </p>
        </div>
      ) : storePlan ? (
        <LockedFeatureCard title="Badges produits" requiredPlan="Ultimate" />
      ) : null}
```

- [ ] **Step 5: Commit**

```bash
git add "src/app/(platform)/dashboard/products/[id]/page.tsx"
git commit -m "feat: add product badge picker to dashboard product edit page"
```

---

### Task 6: Dashboard product list — badge chips

**Files:**
- Modify: `src/app/(platform)/dashboard/products/page.tsx`

- [ ] **Step 1: Add the import**

Add to the existing imports:

```typescript
import { getDisplayBadges, formatBadgeLabel } from '@/lib/product-badges'
```

- [ ] **Step 2: Render chips under the product name**

In the table body, the product-name cell is:

```tsx
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {product.images?.[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.images[0]} alt={product.name} loading="lazy" className="w-10 h-10 rounded-lg object-cover bg-dash-surface-2 flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-dash-surface-2 flex items-center justify-center flex-shrink-0">
                              <Package size={14} className="text-dash-ink-faint" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-dash-ink font-semibold truncate max-w-[180px]">{product.name}</p>
                            <p className="text-dash-ink-faint text-xs truncate">{product.slug}</p>
                          </div>
                        </div>
                      </td>
```

Replace the `<div className="min-w-0">...</div>` block with:

```tsx
                          <div className="min-w-0">
                            <p className="text-dash-ink font-semibold truncate max-w-[180px]">{product.name}</p>
                            <p className="text-dash-ink-faint text-xs truncate">{product.slug}</p>
                            {getDisplayBadges(product.badges).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {getDisplayBadges(product.badges).map(b => (
                                  <span key={b.id} className="px-1.5 py-0.5 rounded text-[9px] font-bold text-white" style={{ background: b.color }}>
                                    {formatBadgeLabel(b, false)}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
```

(Emojis are intentionally omitted here — this is a compact reference table row,
not the customer-facing storefront, so the per-store emoji toggle doesn't apply.)

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/products/page.tsx"
git commit -m "feat: show product badge chips in the dashboard products list"
```

---

### Task 7: Wire badges into the legacy storefront + product detail page

**Files:**
- Modify: `src/components/store/StoreHomepage.tsx`
- Modify: `src/components/store/StandaloneProductView.tsx`

- [ ] **Step 1: Import in `StoreHomepage.tsx`**

Add to the imports:

```typescript
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
```

- [ ] **Step 2: Replace the auto-PROMO badge in `StoreHomepage.tsx`**

Find (around line 197):

```tsx
                  {product.compare_price && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: '#EF4444', color: '#fff' }}>
                      PROMO
                    </div>
                  )}
```

Replace with:

```tsx
                  <ProductBadgeStack
                    badges={canUseBadges(store.plan) ? product.badges : []}
                    showEmojis={!!store.settings?.showBadgeEmojis}
                    max={2}
                  />
```

- [ ] **Step 3: Import in `StandaloneProductView.tsx`**

Add to the imports:

```typescript
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
```

- [ ] **Step 4: Replace the auto-PROMO badge in `StandaloneProductView.tsx`**

Find (around line 62):

```tsx
              {product.compare_price && (
                <span className="absolute top-4 left-4 px-3 py-1 rounded-xl text-sm font-bold shadow-lg" style={{ background: primary, color: '#fff' }}>
                  PROMO
                </span>
              )}
```

Replace with:

```tsx
              <ProductBadgeStack
                badges={canUseBadges(store.plan) ? product.badges : []}
                showEmojis={!!store.settings?.showBadgeEmojis}
                size="md"
              />
```

(No `max` — the product detail page shows every selected badge, per spec.)

- [ ] **Step 5: Commit**

```bash
git add src/components/store/StoreHomepage.tsx src/components/store/StandaloneProductView.tsx
git commit -m "feat: render product badges on legacy storefront and product detail page"
```

---

### Task 8: Wire badges into the 5 niche theme store-home grids

**Files:**
- Modify: `src/components/store/themes/tech/TechStoreHome.tsx`
- Modify: `src/components/store/themes/sport/SportStoreHome.tsx`
- Modify: `src/components/store/themes/home/HomeStoreHome.tsx`
- Modify: `src/components/store/themes/car/CarStoreHome.tsx`
- Modify: `src/components/store/themes/beauty/BeautyStoreHome.tsx`

Each file has the same shape: a per-card `{product.compare_price && <span className="absolute top-2 left-2 ...">...</span>}` PROMO badge. Add the same two imports to each file, and replace that one line.

- [ ] **Step 1: TechStoreHome.tsx**

Add imports (after the existing `import { TECH_TOKENS, TECH_DEFAULTS } from './techDefaults'`):

```typescript
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from '../../ProductBadgeStack'
```

Find (line 171):

```tsx
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: c.secondary, color: '#fff' }}>PROMO</span>}
```

Replace with:

```tsx
                  <ProductBadgeStack badges={canUseBadges(store.plan) ? product.badges : []} showEmojis={!!store.settings?.showBadgeEmojis} max={2} />
```

- [ ] **Step 2: SportStoreHome.tsx**

Add the same two imports (matching that file's relative path to `techDefaults`-equivalent import block).

Find (line 181):

```tsx
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-extrabold uppercase" style={{ background: c.primary, color: '#111' }}>Promo</span>}
```

Replace with:

```tsx
                  <ProductBadgeStack badges={canUseBadges(store.plan) ? product.badges : []} showEmojis={!!store.settings?.showBadgeEmojis} max={2} />
```

- [ ] **Step 3: HomeStoreHome.tsx**

Add the same two imports.

Find (line 184):

```tsx
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: c.primary, color: '#fff' }}>Promo</span>}
```

Replace with:

```tsx
                  <ProductBadgeStack badges={canUseBadges(store.plan) ? product.badges : []} showEmojis={!!store.settings?.showBadgeEmojis} max={2} />
```

- [ ] **Step 4: CarStoreHome.tsx**

Add the same two imports.

Find (line 182):

```tsx
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-extrabold uppercase" style={{ background: c.primary, color: '#fff' }}>Promo</span>}
```

Replace with:

```tsx
                  <ProductBadgeStack badges={canUseBadges(store.plan) ? product.badges : []} showEmojis={!!store.settings?.showBadgeEmojis} max={2} />
```

- [ ] **Step 5: BeautyStoreHome.tsx**

Add the same two imports.

Find (line 172):

```tsx
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: c.primary, color: '#fff' }}>PROMO</span>}
```

Replace with:

```tsx
                  <ProductBadgeStack badges={canUseBadges(store.plan) ? product.badges : []} showEmojis={!!store.settings?.showBadgeEmojis} max={2} />
```

- [ ] **Step 6: Verify the import path resolves**

`ProductBadgeStack` lives at `src/components/store/ProductBadgeStack.tsx`; these
theme files live at `src/components/store/themes/<theme>/<Theme>StoreHome.tsx`,
two directories deeper, hence `'../../ProductBadgeStack'`.

Run: `npx tsc --noEmit`
Expected: no new errors referencing these 5 files.

- [ ] **Step 7: Commit**

```bash
git add src/components/store/themes/tech/TechStoreHome.tsx src/components/store/themes/sport/SportStoreHome.tsx src/components/store/themes/home/HomeStoreHome.tsx src/components/store/themes/car/CarStoreHome.tsx src/components/store/themes/beauty/BeautyStoreHome.tsx
git commit -m "feat: render product badges on all 5 niche theme storefront grids"
```

---

### Task 9: Wire badges into landing page renderers

**Files:**
- Modify: `src/components/store/LandingPageRenderer.tsx`
- Modify: `src/components/store/themes/tech/TechLanding.tsx`
- Modify: `src/components/store/themes/sport/SportLanding.tsx`
- Modify: `src/components/store/themes/home/HomeLanding.tsx`
- Modify: `src/components/store/themes/car/CarLanding.tsx`
- Modify: `src/components/store/themes/beauty/BeautyLanding.tsx`

All 6 files share the same hero layout: a `{/* Urgency badge */}` block
followed by the `<h1>` headline. There is no existing badge markup here (these
pages currently show no PROMO badge at all) — insert a new badge row directly
above the urgency badge, using the already-destructured `product` and `store`
variables (confirmed present in every one of these files).

- [ ] **Step 1: LandingPageRenderer.tsx**

This insertion point sits in the text flow below the hero gallery image (see
`src/components/store/LandingPageRenderer.tsx:263-277`), not overlaid on it —
so this uses a plain inline pill row (matching the urgency badge's visual
style) rather than the `absolute`-positioned `ProductBadgeStack` used on grid
cards and the product detail page.

Add imports:

```typescript
import { canUseBadges, getDisplayBadges, formatBadgeLabel } from '@/lib/product-badges'
```

Find:

```tsx
          {/* Urgency badge */}
```

Replace with:

```tsx
          {canUseBadges(store.plan) && getDisplayBadges(product?.badges).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {getDisplayBadges(product?.badges).map(b => (
                <span key={b.id} className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: b.color }}>
                  {formatBadgeLabel(b, !!store.settings?.showBadgeEmojis)}
                </span>
              ))}
            </div>
          )}

          {/* Urgency badge */}
```

- [ ] **Step 2: Apply the identical change to the 5 niche `*Landing.tsx` files**

Each of `TechLanding.tsx`, `SportLanding.tsx`, `HomeLanding.tsx`, `CarLanding.tsx`,
`BeautyLanding.tsx` has the identical `{/* Urgency badge */}` anchor (confirmed
via grep — all at the same relative position, using the same `product`/`store`
variable names). For each file:

1. Add the import: `import { canUseBadges, getDisplayBadges, formatBadgeLabel } from '@/lib/product-badges'`
2. Find `{/* Urgency badge */}`
3. Insert immediately above it:

```tsx
          {canUseBadges(store.plan) && getDisplayBadges(product?.badges).length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {getDisplayBadges(product?.badges).map(b => (
                <span key={b.id} className="px-3 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: b.color }}>
                  {formatBadgeLabel(b, !!store.settings?.showBadgeEmojis)}
                </span>
              ))}
            </div>
          )}

          {/* Urgency badge */}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing these 6 files.

- [ ] **Step 4: Commit**

```bash
git add src/components/store/LandingPageRenderer.tsx src/components/store/themes/tech/TechLanding.tsx src/components/store/themes/sport/SportLanding.tsx src/components/store/themes/home/HomeLanding.tsx src/components/store/themes/car/CarLanding.tsx src/components/store/themes/beauty/BeautyLanding.tsx
git commit -m "feat: render product badges on landing pages (generic + all 5 niche themes)"
```

---

### Task 10: Pricing page copy

**Files:**
- Modify: `src/app/(platform)/pricing/page.tsx`

- [ ] **Step 1: Add the feature line to the Ultimate plan**

Find the `ultimate` entry in `STANDARD_PLANS` (around line 44-59):

```typescript
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: '9 000',
    period: '/mois',
    badge: 'Recommandé',
    features: [
      '100 crédits IA/mois',
      'Chatbot IA en Darja',
      '150 messages/jour',
      "Tout ce qu'il y a dans Pro",
      'Intégrations livraison',
      'Support prioritaire',
    ],
    highlight: true,
    cta: 'Choisir Ultimate',
  },
```

Add the new line to the `features` array (order matches how the other lines
read — capability first, "inherits everything below" line stays last):

```typescript
    features: [
      '100 crédits IA/mois',
      'Chatbot IA en Darja',
      '150 messages/jour',
      'Badges produits (Winner, Bestseller, etc.)',
      "Tout ce qu'il y a dans Pro",
      'Intégrations livraison',
      'Support prioritaire',
    ],
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/(platform)/pricing/page.tsx"
git commit -m "feat: list product badges as an Ultimate plan feature on pricing page"
```

---

### Task 11: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `product-badges.test.ts` suite.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Start the dev server and open the dashboard**

Use the `run` skill or `npm run dev`, then in a browser:
1. Log in as a test store on the `ultimate` plan (or temporarily set a test
   store's `plan` to `'ultimate'` via Supabase for this check).
2. Go to `/dashboard/products/[id]` for an existing product. Confirm the
   "Badges produits" section appears (not the locked card), toggle a few
   badges on, toggle "Afficher les emojis" on, save.
3. Reload the edit page — confirm the selected badges and emoji toggle
   persisted.
4. Go to `/dashboard/products` — confirm the badge chips show under the
   product name (no emojis, per Task 6's design).

- [ ] **Step 4: Verify storefront rendering**

1. Visit the store's public homepage (`/store?store=<slug>` in dev). Confirm
   the badge stack renders top-left on the tagged product's card, capped to 2,
   in priority order, with emojis if enabled.
2. Open that product's detail page — confirm all selected badges show (no cap).
3. If the product has a published landing page, open it — confirm the badge
   row renders above the urgency/headline area.

- [ ] **Step 5: Verify plan gating**

1. Temporarily set the test store's plan to `'pro'` in Supabase.
2. Reload `/dashboard/products/[id]` — confirm the section is now the
   `LockedFeatureCard` ("Disponible à partir du plan Ultimate"), not the picker.
3. Reload the storefront — confirm badges no longer render (the trigger clears
   `badges` server-side on the next product write; for an immediate check
   without writing, confirm the storefront's own `canUseBadges(store.plan)`
   check hides them even if stale data is still in the row).
4. Set the plan back to `'ultimate'` when done.

- [ ] **Step 6: Confirm pricing page copy**

Visit `/pricing` and confirm "Badges produits (Winner, Bestseller, etc.)"
appears in the Ultimate plan's feature list.
