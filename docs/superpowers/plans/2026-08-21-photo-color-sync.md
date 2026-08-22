# Photo ↔ Color Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a merchant tag each product photo with a color, so on the storefront clicking a photo selects its color and clicking a color jumps the gallery to a matching photo.

**Architecture:** One new JSONB column (`products.image_colors`, `imageUrl → colorName`) backs a small pure-function pair in `lib/variants.ts` (which color is this photo, which photo has this color) plus a tiny React hook (`useProductPhotoColorSync`) that both directions call into. The dashboard product editor gets a swatch row under each photo thumbnail to create the tags. Every storefront surface that renders a gallery next to `OrderFormFields` — `StandaloneProductView`, `LandingPageRenderer`, and the 5 niche theme landing pages (`BeautyLanding`, `SportLanding`, `CarLanding`, `TechLanding`, `HomeLanding`) — swaps its local gallery `useState` for the shared hook and passes color through a new optional controlled `color`/`onColorChange` pair on `OrderFormFields`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres/JSONB), Vitest (pure-function unit tests; no jsdom/testing-library in this repo, so hook/UI wiring is verified manually in the browser per project convention).

**Out of scope (per design doc):** filtering the thumbnail strip to one color, multi-color tags per photo, sizes. `src/components/OrderForm.tsx` + `src/app/product/[id]/page.tsx` are excluded — they're the legacy pre-multi-tenant "Le Mirage Textile" product page (different `Product` type from `@/types`, not `@/types/database`) and already implement their own per-variant image arrays; they're dead/unreachable code unrelated to the current `products` table.

---

### Task 1: Database migration + type

**Files:**
- Create: `Database/060_photo_color_sync.sql`
- Modify: `src/types/database.ts:258-259`

- [ ] **Step 1: Write the migration**

Create `Database/060_photo_color_sync.sql`:

```sql
-- ============================================================
-- 060 — Photo ↔ color tagging on products
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- WHY: photos and colors were unrelated arrays with no link between them.
-- Merchants can now tag each photo with the color it depicts so the
-- storefront gallery and color picker stay in sync (click a photo → its
-- color is selected; pick a color → the gallery jumps to a matching photo).
-- ============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_colors JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 2: Give the user the SQL to run**

Per project convention, paste the SQL above directly in chat (not just the file path) and ask the user to run it in Supabase → SQL Editor before continuing, since local tooling has no DB connection to run it automatically.

- [ ] **Step 3: Add the field to the `Product` type**

In `src/types/database.ts`, find:

```ts
  images: string[]
  colors: string[]
```

(around line 258-259). Replace with:

```ts
  images: string[]
  colors: string[]
  // Photo → color tag map (imageUrl -> colorName), sparse — only tagged
  // photos appear. Powers the storefront's photo/color two-way sync; see
  // lib/variants.ts (colorForImage/imageIndexForColor) and
  // lib/use-product-photo-color-sync.ts.
  image_colors: Record<string, string>
```

- [ ] **Step 4: Commit**

```bash
git add "Database/060_photo_color_sync.sql" "src/types/database.ts"
git commit -m "feat(products): add image_colors column for photo-color tagging"
```

---

### Task 2: Pure sync-logic helpers + tests

**Files:**
- Modify: `src/lib/variants.ts`
- Create: `src/lib/variants.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/variants.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { colorForImage, imageIndexForColor, firstAvailableColor } from './variants'

describe('colorForImage', () => {
  it('returns the tagged color for a photo', () => {
    const images = ['a.jpg', 'b.jpg']
    const imageColors = { 'a.jpg': 'Rouge' }
    expect(colorForImage(images, imageColors, 0)).toBe('Rouge')
  })

  it('returns undefined for an untagged photo', () => {
    const images = ['a.jpg', 'b.jpg']
    expect(colorForImage(images, {}, 1)).toBeUndefined()
  })

  it('returns undefined for an out-of-range index', () => {
    expect(colorForImage(['a.jpg'], { 'a.jpg': 'Rouge' }, 5)).toBeUndefined()
  })
})

describe('imageIndexForColor', () => {
  it('finds the first photo tagged with a color', () => {
    const images = ['a.jpg', 'b.jpg', 'c.jpg']
    const imageColors = { 'b.jpg': 'Bleu', 'c.jpg': 'Bleu' }
    expect(imageIndexForColor(images, imageColors, 'Bleu')).toBe(1)
  })

  it('returns -1 when no photo is tagged with that color', () => {
    expect(imageIndexForColor(['a.jpg'], {}, 'Vert')).toBe(-1)
  })
})

describe('firstAvailableColor', () => {
  it('returns the first in-stock color', () => {
    const vs = { colors: { Rouge: 0, Bleu: 5 } }
    expect(firstAvailableColor(['Rouge', 'Bleu'], vs)).toBe('Bleu')
  })

  it('falls back to the first color when all are sold out', () => {
    const vs = { colors: { Rouge: 0, Bleu: 0 } }
    expect(firstAvailableColor(['Rouge', 'Bleu'], vs)).toBe('Rouge')
  })

  it('returns the first color when stock is untracked', () => {
    expect(firstAvailableColor(['Rouge', 'Bleu'], null)).toBe('Rouge')
  })

  it('returns empty string when there are no colors', () => {
    expect(firstAvailableColor(undefined, null)).toBe('')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- variants.test.ts`
Expected: FAIL — `colorForImage`, `imageIndexForColor`, `firstAvailableColor` are not exported from `./variants`.

- [ ] **Step 3: Implement the helpers**

In `src/lib/variants.ts`, add at the end of the file (after `applyVariantDelta`):

```ts

/** The color tag (if any) attached to the photo at this index in `images`. */
export function colorForImage(images: string[], imageColors: Record<string, string>, index: number): string | undefined {
  const url = images[index]
  return url ? imageColors[url] : undefined
}

/** Index of the first photo tagged with `color`, or -1 if none is tagged. */
export function imageIndexForColor(images: string[], imageColors: Record<string, string>, color: string): number {
  return images.findIndex(url => imageColors[url] === color)
}

/** First in-stock color (falls back to the first color if all are sold out, or none are tracked). */
export function firstAvailableColor(colors: string[] | undefined, vs: VariantStock | null | undefined): string {
  if (!colors || colors.length === 0) return ''
  const inStock = colors.find(c => {
    const rem = colorRemaining(vs, c)
    return rem === null || rem > 0
  })
  return inStock ?? colors[0]
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- variants.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/variants.ts src/lib/variants.test.ts
git commit -m "feat(variants): add photo-color lookup helpers"
```

---

### Task 3: Shared React hook

**Files:**
- Create: `src/lib/use-product-photo-color-sync.ts`

- [ ] **Step 1: Write the hook**

Create `src/lib/use-product-photo-color-sync.ts`:

```ts
import { useState } from 'react'
import { colorForImage, imageIndexForColor } from './variants'

export interface ProductPhotoColorSync {
  activeIndex: number
  setActiveIndex: (index: number) => void
  selectedColor: string
  selectColor: (color: string) => void
}

// Two-way binding between a product's photo gallery and its color swatches:
// clicking a photo tagged with a color selects that color, and picking a
// color jumps the gallery to the first photo tagged with it. Untagged photos
// (lifestyle/generic shots) don't affect the selected color, and a color with
// no tagged photo just leaves the gallery where it was.
export function useProductPhotoColorSync(
  images: string[],
  imageColors: Record<string, string>,
  initialColor: string,
): ProductPhotoColorSync {
  const [activeIndex, setActiveIndexRaw] = useState(() => {
    const idx = imageIndexForColor(images, imageColors, initialColor)
    return idx !== -1 ? idx : 0
  })
  const [selectedColor, setSelectedColor] = useState(initialColor)

  const setActiveIndex = (index: number) => {
    setActiveIndexRaw(index)
    const tag = colorForImage(images, imageColors, index)
    if (tag) setSelectedColor(tag)
  }

  const selectColor = (color: string) => {
    setSelectedColor(color)
    const idx = imageIndexForColor(images, imageColors, color)
    if (idx !== -1) setActiveIndexRaw(idx)
  }

  return { activeIndex, setActiveIndex, selectedColor, selectColor }
}
```

No test file here — the hook is a thin `useState` wrapper around the already-tested pure functions from Task 2, and this repo has no jsdom/`@testing-library/react` set up (`vitest.config.ts` runs `environment: 'node'`, no other file in `src/` renders hooks). Adding that infra just for this one hook would be new project-wide tooling, not a scoped fix — verify the hook through the browser checks in Tasks 5-6 instead.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from this file (it isn't imported anywhere yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/use-product-photo-color-sync.ts
git commit -m "feat: add useProductPhotoColorSync hook"
```

---

### Task 4: `OrderFormFields` — controlled color prop

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx`

- [ ] **Step 1: Add the import**

In `src/components/store/OrderFormFields.tsx`, find:

```ts
import { colorHex, isLightHex, colorRemaining, sizeRemaining } from '@/lib/variants'
```

Replace with:

```ts
import { colorHex, isLightHex, colorRemaining, sizeRemaining, firstAvailableColor } from '@/lib/variants'
```

- [ ] **Step 2: Add the controlled props**

Find:

```ts
interface Props {
  product: Product | null
  store: Store
  landingPageId?: string
  overridePrice?: number
  isRTL?: boolean
  onSuccess?: () => void
  upsell?: { enabled: boolean; text: string | null; product_name: string | null; price: number | null }
}

export default function OrderFormFields({
  product, store, landingPageId, overridePrice, isRTL = false, onSuccess, upsell,
}: Props) {
```

Replace with:

```ts
interface Props {
  product: Product | null
  store: Store
  landingPageId?: string
  overridePrice?: number
  isRTL?: boolean
  onSuccess?: () => void
  upsell?: { enabled: boolean; text: string | null; product_name: string | null; price: number | null }
  // Optional controlled color selection, for callers that sync it with a
  // photo gallery (see useProductPhotoColorSync). Omit both for the default
  // uncontrolled behavior (internal state, defaults to the first in-stock color).
  color?: string
  onColorChange?: (color: string) => void
}

export default function OrderFormFields({
  product, store, landingPageId, overridePrice, isRTL = false, onSuccess, upsell,
  color: controlledColor, onColorChange,
}: Props) {
```

- [ ] **Step 3: Route the colors branch of `firstAvailable` through the shared helper**

Find:

```ts
  const variantStock = product?.variant_stock ?? null
  // Default to the first IN-STOCK variant (an untracked pool → treat every
  // option as available). Falls back to the first option if all are sold out.
  const firstAvailable = (names: string[] | undefined, kind: 'colors' | 'sizes'): string => {
    if (!names || names.length === 0) return ''
    const inStock = names.find(n => {
      const rem = kind === 'colors' ? colorRemaining(variantStock, n) : sizeRemaining(variantStock, n)
      return rem === null || rem > 0
    })
    return inStock ?? names[0]
  }
```

Replace with:

```ts
  const variantStock = product?.variant_stock ?? null
  // Default to the first IN-STOCK variant (an untracked pool → treat every
  // option as available). Falls back to the first option if all are sold out.
  const firstAvailable = (names: string[] | undefined, kind: 'colors' | 'sizes'): string => {
    if (kind === 'colors') return firstAvailableColor(names, variantStock)
    if (!names || names.length === 0) return ''
    const inStock = names.find(n => {
      const rem = sizeRemaining(variantStock, n)
      return rem === null || rem > 0
    })
    return inStock ?? names[0]
  }
```

- [ ] **Step 4: Replace the `form.color` field with a controlled/uncontrolled `selectedColor`**

Find:

```ts
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    wilaya: '',
    commune: '',
    color: firstAvailable(product?.colors, 'colors'),
    size: firstAvailable(product?.sizes, 'sizes'),
    quantity: 1,
    notes: '',
  })
```

Replace with:

```ts
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    wilaya: '',
    commune: '',
    size: firstAvailable(product?.sizes, 'sizes'),
    quantity: 1,
    notes: '',
  })
  // Controlled/uncontrolled hybrid: when the caller passes `color`, it's the
  // source of truth (kept in sync with a photo gallery elsewhere). Otherwise
  // this component manages its own selection, defaulting to the first
  // in-stock color — same as before this prop existed.
  const [uncontrolledColor, setUncontrolledColor] = useState(() => firstAvailable(product?.colors, 'colors'))
  const selectedColor = controlledColor ?? uncontrolledColor
  const handleColorSelect = (c: string) => {
    if (controlledColor === undefined) setUncontrolledColor(c)
    onColorChange?.(c)
    setForm(f => ({ ...f, quantity: 1 }))
  }
```

- [ ] **Step 5: Update the remaining `form.color` reads**

Find (around line 210-211):

```ts
  const colorMax = colorRemaining(variantStock, form.color)
  const sizeMax = sizeRemaining(variantStock, form.size)
```

Replace with:

```ts
  const colorMax = colorRemaining(variantStock, selectedColor)
  const sizeMax = sizeRemaining(variantStock, form.size)
```

Find (around line 305):

```ts
          color: form.color || null,
          size: form.size || null,
```

Replace with:

```ts
          color: selectedColor || null,
          size: form.size || null,
```

Find (around line 445):

```tsx
            {form.color && <span style={{ color: text }} className="normal-case tracking-normal font-semibold"> · {form.color}</span>}
```

Replace with:

```tsx
            {selectedColor && <span style={{ color: text }} className="normal-case tracking-normal font-semibold"> · {selectedColor}</span>}
```

Find:

```tsx
            {product.colors.map(c => {
              const rem = colorRemaining(variantStock, c)
              const soldOut = rem !== null && rem <= 0
              const selected = form.color === c
              const hex = colorHex(c)
              return (
                <button
                  key={c}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setForm(f => ({ ...f, color: c, quantity: 1 }))}
```

Replace with:

```tsx
            {product.colors.map(c => {
              const rem = colorRemaining(variantStock, c)
              const soldOut = rem !== null && rem <= 0
              const selected = selectedColor === c
              const hex = colorHex(c)
              return (
                <button
                  key={c}
                  type="button"
                  disabled={soldOut}
                  onClick={() => handleColorSelect(c)}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Existing callers like `StoreOrderModal` don't pass `color`/`onColorChange` — both are optional, so uncontrolled behavior is unchanged for them.)

- [ ] **Step 7: Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat(order-form): support controlled color selection"
```

---

### Task 5: Dashboard editor — "new product" page

**Files:**
- Modify: `src/app/(platform)/dashboard/products/new/page.tsx`
- Create: `src/components/dashboard/PhotoColorSwatches.tsx`

- [ ] **Step 1: Create the swatch-row component**

Create `src/components/dashboard/PhotoColorSwatches.tsx`:

```tsx
'use client'

import { colorHex, isLightHex } from '@/lib/variants'
import { Check } from 'lucide-react'

interface Props {
  colors: string[]
  activeColor: string | undefined
  onSelect: (color: string) => void
}

// Small swatch row under a product photo thumbnail so the merchant can tag
// which color that photo depicts. Mirrors VariantStockEditor's swatch
// styling. Renders nothing until the product has colors to tag with.
export default function PhotoColorSwatches({ colors, activeColor, onSelect }: Props) {
  if (colors.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 px-0.5 pt-1">
      {colors.map(name => {
        const selected = activeColor === name
        const hex = colorHex(name)
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            title={name}
            className={`relative w-4 h-4 rounded-full transition-transform hover:scale-110 ${selected ? 'ring-2 ring-dash-accent ring-offset-1 ring-offset-dash-surface' : ''}`}
            style={{ background: hex, border: isLightHex(hex) ? '1px solid rgba(0,0,0,0.15)' : 'none' }}
          >
            {selected && <Check size={9} className="absolute inset-0 m-auto" style={{ color: isLightHex(hex) ? '#111' : '#fff' }} />}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Add `imageColors` state and a toggle handler**

In `src/app/(platform)/dashboard/products/new/page.tsx`, find:

```ts
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
```

Replace with:

```ts
  const [images, setImages] = useState<string[]>([])
  const [imageColors, setImageColors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
```

Find:

```ts
  const moveImage = (from: number, to: number) => {
```

Insert before it:

```ts
  const toggleImageColor = (url: string, color: string) => {
    setImageColors(prev => {
      const next = { ...prev }
      if (next[url] === color) delete next[url]
      else next[url] = color
      return next
    })
  }

  const moveImage = (from: number, to: number) => {
```

- [ ] **Step 3: Wire the swatch row into the photo grid and clean up on delete**

Add the import at the top, alongside the other component imports:

```ts
import PhotoColorSwatches from '@/components/dashboard/PhotoColorSwatches'
```

Find:

```tsx
          {images.map((url, idx) => (
            <div key={idx} className={`relative w-20 h-20 rounded-xl overflow-hidden group ${idx === 0 ? 'ring-2 ring-dash-accent' : ''}`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
              {idx === 0 && (
                <div className="absolute top-0 inset-x-0 bg-dash-accent text-dash-surface text-[9px] font-bold uppercase tracking-wide text-center py-0.5 flex items-center justify-center gap-1">
                  <Star size={9} fill="currentColor" /> {t('productNew.firstPhoto')}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx - 1)}
                  disabled={idx === 0}
                  aria-label={t('productNew.moveLeft')}
                  className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx + 1)}
                  disabled={idx === images.length - 1}
                  aria-label={t('productNew.moveRight')}
                  className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                  aria-label={t('productNew.removePhoto')}
                  className="p-1 rounded text-white hover:bg-red-500/80 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
```

Replace with:

```tsx
          {images.map((url, idx) => (
            <div key={idx} className="w-20">
              <div className={`relative w-20 h-20 rounded-xl overflow-hidden group ${idx === 0 ? 'ring-2 ring-dash-accent' : ''}`}>
                <img src={url} alt="" className="w-full h-full object-cover" />
                {idx === 0 && (
                  <div className="absolute top-0 inset-x-0 bg-dash-accent text-dash-surface text-[9px] font-bold uppercase tracking-wide text-center py-0.5 flex items-center justify-center gap-1">
                    <Star size={9} fill="currentColor" /> {t('productNew.firstPhoto')}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                  <button
                    type="button"
                    onClick={() => moveImage(idx, idx - 1)}
                    disabled={idx === 0}
                    aria-label={t('productNew.moveLeft')}
                    className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(idx, idx + 1)}
                    disabled={idx === images.length - 1}
                    aria-label={t('productNew.moveRight')}
                    className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImages(prev => prev.filter((_, i) => i !== idx))
                      setImageColors(prev => {
                        const next = { ...prev }
                        delete next[url]
                        return next
                      })
                    }}
                    aria-label={t('productNew.removePhoto')}
                    className="p-1 rounded text-white hover:bg-red-500/80 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <PhotoColorSwatches colors={variants.colors} activeColor={imageColors[url]} onSelect={color => toggleImageColor(url, color)} />
            </div>
          ))}
```

- [ ] **Step 4: Include `image_colors` in the insert payload**

Find:

```ts
      images,
      colors: variants.colors,
```

Replace with:

```ts
      images,
      image_colors: imageColors,
      colors: variants.colors,
```

- [ ] **Step 5: Manually verify in the browser**

Start the dev server (`mcp__Claude_Browser__preview_start` with the project's dev config, or `npm run dev`), open `/dashboard/products/new`, add 2+ photos, add 2+ colors in the Variants section below, confirm a swatch row appears under each thumbnail, click a swatch to tag a photo (ring highlight appears), click it again to untag, delete a tagged photo and confirm no error.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(platform)/dashboard/products/new/page.tsx" src/components/dashboard/PhotoColorSwatches.tsx
git commit -m "feat(products): tag photos with colors in the new-product editor"
```

---

### Task 6: Dashboard editor — "edit product" page

**Files:**
- Modify: `src/app/(platform)/dashboard/products/[id]/page.tsx`

- [ ] **Step 1: Add `imageColors` state, load it, and add the toggle handler**

Find:

```ts
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
```

Replace with:

```ts
  const [images, setImages] = useState<string[]>([])
  const [imageColors, setImageColors] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
```

Find:

```ts
      setImages(data.images ?? [])
```

Replace with:

```ts
      setImages(data.images ?? [])
      setImageColors(data.image_colors ?? {})
```

Find:

```ts
  const moveImage = (from: number, to: number) => {
```

Insert before it:

```ts
  const toggleImageColor = (url: string, color: string) => {
    setImageColors(prev => {
      const next = { ...prev }
      if (next[url] === color) delete next[url]
      else next[url] = color
      return next
    })
  }

  const moveImage = (from: number, to: number) => {
```

- [ ] **Step 2: Wire the swatch row into the photo grid and clean up on delete**

Add the import at the top, alongside the other component imports:

```ts
import PhotoColorSwatches from '@/components/dashboard/PhotoColorSwatches'
```

Find:

```tsx
          {images.map((url, idx) => (
            <div key={idx} className={`relative w-20 h-20 rounded-xl overflow-hidden group ${idx === 0 ? 'ring-2 ring-dash-accent' : ''}`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
              {idx === 0 && (
                <div className="absolute top-0 inset-x-0 bg-dash-accent text-dash-surface text-[9px] font-bold uppercase tracking-wide text-center py-0.5 flex items-center justify-center gap-1">
                  <Star size={9} fill="currentColor" /> {t('productNew.firstPhoto')}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx - 1)}
                  disabled={idx === 0}
                  aria-label={t('productNew.moveLeft')}
                  className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx + 1)}
                  disabled={idx === images.length - 1}
                  aria-label={t('productNew.moveRight')}
                  className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                  aria-label={t('productNew.removePhoto')}
                  className="p-1 rounded text-white hover:bg-red-500/80 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
```

Replace with:

```tsx
          {images.map((url, idx) => (
            <div key={idx} className="w-20">
              <div className={`relative w-20 h-20 rounded-xl overflow-hidden group ${idx === 0 ? 'ring-2 ring-dash-accent' : ''}`}>
                <img src={url} alt="" className="w-full h-full object-cover" />
                {idx === 0 && (
                  <div className="absolute top-0 inset-x-0 bg-dash-accent text-dash-surface text-[9px] font-bold uppercase tracking-wide text-center py-0.5 flex items-center justify-center gap-1">
                    <Star size={9} fill="currentColor" /> {t('productNew.firstPhoto')}
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                  <button
                    type="button"
                    onClick={() => moveImage(idx, idx - 1)}
                    disabled={idx === 0}
                    aria-label={t('productNew.moveLeft')}
                    className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(idx, idx + 1)}
                    disabled={idx === images.length - 1}
                    aria-label={t('productNew.moveRight')}
                    className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ChevronRight size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setImages(prev => prev.filter((_, i) => i !== idx))
                      setImageColors(prev => {
                        const next = { ...prev }
                        delete next[url]
                        return next
                      })
                    }}
                    aria-label={t('productNew.removePhoto')}
                    className="p-1 rounded text-white hover:bg-red-500/80 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
              <PhotoColorSwatches colors={variants.colors} activeColor={imageColors[url]} onSelect={color => toggleImageColor(url, color)} />
            </div>
          ))}
```

- [ ] **Step 3: Include `image_colors` in the update payload**

Find:

```ts
      images,
      colors: variants.colors,
```

Replace with:

```ts
      images,
      image_colors: imageColors,
      colors: variants.colors,
```

- [ ] **Step 4: Manually verify in the browser**

Open an existing product's edit page, confirm previously untagged photos show the swatch row with nothing selected, tag one, save, reload the page, confirm the tag persisted.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(platform)/dashboard/products/[id]/page.tsx"
git commit -m "feat(products): tag photos with colors in the edit-product editor"
```

---

### Task 7: `StandaloneProductView` — wire the hook

**Files:**
- Modify: `src/components/store/StandaloneProductView.tsx`

- [ ] **Step 1: Update imports**

Find:

```ts
import { useState } from 'react'
import Image from 'next/image'
import type { Product, Store } from '@/types/database'
import OrderFormFields from './OrderFormFields'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
import GoogleFontLoader from './GoogleFontLoader'
import { getStoreLocale } from '@/lib/i18n/store'
```

Replace with:

```ts
import Image from 'next/image'
import type { Product, Store } from '@/types/database'
import OrderFormFields from './OrderFormFields'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
import GoogleFontLoader from './GoogleFontLoader'
import { getStoreLocale } from '@/lib/i18n/store'
import { firstAvailableColor } from '@/lib/variants'
import { useProductPhotoColorSync } from '@/lib/use-product-photo-color-sync'
```

(`useState` is dropped — after this task it's the only hook this file used.)

- [ ] **Step 2: Replace the local gallery state with the shared hook**

Find:

```ts
  const images = product.images || []
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const activeImage = images[activeImageIndex] || null
```

Replace with:

```ts
  const images = product.images || []
  const gallery = useProductPhotoColorSync(images, product.image_colors ?? {}, firstAvailableColor(product.colors, product.variant_stock))
  const activeImage = images[gallery.activeIndex] || null
```

- [ ] **Step 3: Wire the thumbnail clicks and highlight**

Find:

```tsx
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className="relative w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden transition-all hover:scale-105"
                    style={{ 
                      border: activeImageIndex === idx ? `2px solid ${primary}` : `1px solid ${border}`,
                      opacity: activeImageIndex === idx ? 1 : 0.6
                    }}
                  >
```

Replace with:

```tsx
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => gallery.setActiveIndex(idx)}
                    className="relative w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden transition-all hover:scale-105"
                    style={{ 
                      border: gallery.activeIndex === idx ? `2px solid ${primary}` : `1px solid ${border}`,
                      opacity: gallery.activeIndex === idx ? 1 : 0.6
                    }}
                  >
```

- [ ] **Step 4: Pass the controlled color into `OrderFormFields`**

Find:

```tsx
            <OrderFormFields
              product={product}
              store={store}
              isRTL={isRTL}
              onSuccess={() => {}}
            />
```

Replace with:

```tsx
            <OrderFormFields
              product={product}
              store={store}
              isRTL={isRTL}
              onSuccess={() => {}}
              color={gallery.selectedColor}
              onColorChange={gallery.selectColor}
            />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manually verify in the browser**

Open a store's standalone product page for a product with tagged photos (from Task 5/6). Click a thumbnail tagged with a color → confirm the matching color swatch highlights in the order form. Click a color swatch → confirm the gallery jumps to its tagged photo. Click an untagged photo → confirm the selected color doesn't change.

- [ ] **Step 7: Commit**

```bash
git add src/components/store/StandaloneProductView.tsx
git commit -m "feat(store): sync photo gallery with color selection"
```

---

### Task 8: Landing page renderer + 5 niche themes — wire the hook

These six files (`LandingPageRenderer.tsx` and the 5 theme `*Landing.tsx` files) share byte-identical `HeroGallery` / `heroImages` / `OrderFormFields` blocks (confirmed via diff while planning) — only their relative import path to `OrderFormFields` and unrelated cosmetic tokens (fonts) differ. Apply the same four edits to each of:

- `src/components/store/LandingPageRenderer.tsx` (import path: `./OrderFormFields`)
- `src/components/store/themes/beauty/BeautyLanding.tsx` (import path: `../../OrderFormFields`)
- `src/components/store/themes/sport/SportLanding.tsx` (import path: `../../OrderFormFields`)
- `src/components/store/themes/car/CarLanding.tsx` (import path: `../../OrderFormFields`)
- `src/components/store/themes/tech/TechLanding.tsx` (import path: `../../OrderFormFields`)
- `src/components/store/themes/home/HomeLanding.tsx` (import path: `../../OrderFormFields`)

- [ ] **Step 1: In each file, add the two new imports**

For `LandingPageRenderer.tsx`, find:

```ts
import OrderFormFields from './OrderFormFields'
```

Replace with:

```ts
import OrderFormFields from './OrderFormFields'
import { firstAvailableColor } from '@/lib/variants'
import { useProductPhotoColorSync } from '@/lib/use-product-photo-color-sync'
```

For each of the 5 theme files, find:

```ts
import OrderFormFields from '../../OrderFormFields'
```

Replace with:

```ts
import OrderFormFields from '../../OrderFormFields'
import { firstAvailableColor } from '@/lib/variants'
import { useProductPhotoColorSync } from '@/lib/use-product-photo-color-sync'
```

- [ ] **Step 2: In each of the 6 files, make `HeroGallery` a controlled component**

Find:

```tsx
function HeroGallery({ images, alt, primary, bg, border, isRTL }: {
  images: string[]; alt: string; primary: string; bg: string; border: string; isRTL: boolean
}) {
  const [active, setActive] = useState(0)
  const idx = Math.min(active, images.length - 1)
  return (
    <div style={{ background: bg }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
        <Image src={images[idx]} alt={alt} fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" priority />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}`}
              className="relative flex-shrink-0 rounded-xl overflow-hidden transition-all"
              style={{ width: 60, height: 60, border: `2px solid ${i === idx ? primary : border}`, opacity: i === idx ? 1 : 0.6 }}
            >
              <Image src={img} alt="" fill sizes="60px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

Replace with:

```tsx
function HeroGallery({ images, alt, primary, bg, border, isRTL, activeIndex, onSelect }: {
  images: string[]; alt: string; primary: string; bg: string; border: string; isRTL: boolean
  activeIndex: number; onSelect: (i: number) => void
}) {
  const idx = Math.min(activeIndex, images.length - 1)
  return (
    <div style={{ background: bg }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
        <Image src={images[idx]} alt={alt} fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" priority />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => onSelect(i)}
              aria-label={`Photo ${i + 1}`}
              className="relative flex-shrink-0 rounded-xl overflow-hidden transition-all"
              style={{ width: 60, height: 60, border: `2px solid ${i === idx ? primary : border}`, opacity: i === idx ? 1 : 0.6 }}
            >
              <Image src={img} alt="" fill sizes="60px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

This block is identical in all 6 files — apply the exact same replacement in each.

- [ ] **Step 3: In each of the 6 files, create the hook instance after `heroImages`**

Find:

```ts
  const heroImages: string[] = generatedImgs.length
    ? generatedImgs
    : product?.images?.length
      ? product.images
      : singleFallback
        ? [singleFallback]
        : []
  const comparePrice = product?.compare_price ?? null
```

Replace with:

```ts
  const heroImages: string[] = generatedImgs.length
    ? generatedImgs
    : product?.images?.length
      ? product.images
      : singleFallback
        ? [singleFallback]
        : []
  const gallery = useProductPhotoColorSync(heroImages, product?.image_colors ?? {}, firstAvailableColor(product?.colors, product?.variant_stock ?? null))
  const comparePrice = product?.compare_price ?? null
```

This block is identical in all 6 files — apply the exact same replacement in each.

- [ ] **Step 4: In each of the 6 files, pass the controlled index into `HeroGallery`**

Find:

```tsx
            ? <HeroGallery
                images={heroImages}
                alt={meta?.productName ?? product?.name ?? ''}
                primary={primary}
                bg={bg}
                border={border}
                isRTL={isRTL}
              />
```

Replace with:

```tsx
            ? <HeroGallery
                images={heroImages}
                alt={meta?.productName ?? product?.name ?? ''}
                primary={primary}
                bg={bg}
                border={border}
                isRTL={isRTL}
                activeIndex={gallery.activeIndex}
                onSelect={gallery.setActiveIndex}
              />
```

This block is identical in all 6 files — apply the exact same replacement in each.

- [ ] **Step 5: In each of the 6 files, pass the controlled color into `OrderFormFields`**

Find:

```tsx
              <OrderFormFields
                product={product}
                store={store}
                landingPageId={landingPage.id}
                // Only override the display price when there's no linked product (custom/meta price); a linked product's own price + active offer should flow through undisturbed.
                overridePrice={product ? undefined : Number(displayPrice)}
                isRTL={isRTL}
                upsell={{
                  enabled: landingPage.upsell_enabled,
                  text: landingPage.upsell_text,
                  product_name: landingPage.upsell_product_name,
                  price: landingPage.upsell_price,
                }}
              />
```

Replace with:

```tsx
              <OrderFormFields
                product={product}
                store={store}
                landingPageId={landingPage.id}
                // Only override the display price when there's no linked product (custom/meta price); a linked product's own price + active offer should flow through undisturbed.
                overridePrice={product ? undefined : Number(displayPrice)}
                isRTL={isRTL}
                color={gallery.selectedColor}
                onColorChange={gallery.selectColor}
                upsell={{
                  enabled: landingPage.upsell_enabled,
                  text: landingPage.upsell_text,
                  product_name: landingPage.upsell_product_name,
                  price: landingPage.upsell_price,
                }}
              />
```

This block is identical in all 6 files — apply the exact same replacement in each.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors across all 6 files.

- [ ] **Step 7: Manually verify in the browser**

Open a published AI landing page (or niche-theme storefront) for a product with tagged photos and no `generated_images` (so `heroImages` falls back to `product.images` — generated marketing shots were never tagged and won't sync, which is expected). Repeat the same click-photo / click-color checks as Task 7. Then spot-check one niche theme (e.g. Beauty) storefront home page the same way.

- [ ] **Step 8: Commit**

```bash
git add src/components/store/LandingPageRenderer.tsx src/components/store/themes/beauty/BeautyLanding.tsx src/components/store/themes/sport/SportLanding.tsx src/components/store/themes/car/CarLanding.tsx src/components/store/themes/tech/TechLanding.tsx src/components/store/themes/home/HomeLanding.tsx
git commit -m "feat(store): sync photo gallery with color selection on landing pages"
```

---

### Task 9: Final check

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new `variants.test.ts` cases.

- [ ] **Step 2: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors (in particular, no unused-import warning for `useState` in `StandaloneProductView.tsx`).

- [ ] **Step 4: Update dev notes**

Per `CLAUDE.md`, append a short entry to `dev-notes/Index.md` (via the `obsidian` MCP server) under `## Log`, newest-first: what shipped (photo↔color two-way sync on the storefront + dashboard tagging UI), and note the migration number (060) so a future session knows it needs to have been run.
