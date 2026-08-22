# Photo ↔ Color Sync — Design

## Problem

Product photos and colors are currently unrelated arrays (`Product.images: string[]`,
`Product.colors: string[]`). On the storefront, the photo gallery and the color
swatch picker exist side by side but don't affect each other. The merchant wants
to tag each photo with the color it depicts, so that on the storefront:

- clicking a color swatch jumps the gallery to a matching photo
- clicking a photo (that's tagged with a color) selects that color

## Data model

Add one nullable JSONB column to `products`:

```sql
alter table products add column image_colors jsonb not null default '{}'::jsonb;
```

Shape: `Record<imageUrl, colorName>` — sparse, only tagged photos appear. Keyed
by the image's public URL (already unique per upload — see `handleImageUpload`
in the product editor), not by array index, so reordering photos in the editor
never desyncs the mapping. Deleting a photo must also delete its entry from the
map (both editor pages already have a `removeImage`/filter handler — extend it
to drop the corresponding map key).

`Product` type (`types/database.ts`) gets:

```ts
image_colors: Record<string, string>
```

Existing products get `{}` — no behavior change until a merchant tags a photo.

## Dashboard editor

Both `dashboard/products/new/page.tsx` and `dashboard/products/[id]/page.tsx`
share the same Images-grid structure (confirmed identical). Under each photo
thumbnail, add a row of small color-swatch dots — one per color already present
in `variants.colors` (the Variants section's client state, which the Images
section will read live). Styled like the existing swatch picker in
`VariantStockEditor.tsx` (filled circle, ring highlight when active, checkmark).

- Click an untagged swatch → tag the photo with that color (`image_colors[url] = colorName`).
- Click the already-active swatch → untag (delete the key).
- A photo can hold at most one color tag (selecting a different swatch replaces the previous tag).
- If `variants.colors` is empty, the swatch row doesn't render for any photo.

State lives alongside the existing `images` state in each page as
`imageColors: Record<string, string>`, included in the insert/update payload
next to `images` and `colors`.

## Storefront sync

**`OrderFormFields`** currently owns `form.color` as pure internal `useState`.
Make it optionally controlled:

```ts
interface Props {
  // ...existing
  color?: string
  onColorChange?: (color: string) => void
}
```

When `color`/`onColorChange` are omitted, behavior is unchanged (internal
state) — this keeps `StoreOrderModal` (no gallery, no need for sync) untouched.
When provided, the color swatch `onClick` calls `onColorChange` instead of
`setForm`, and the displayed selection reads from the `color` prop.

**Shared hook** — `lib/useProductPhotoColorSync.ts`:

```ts
function useProductPhotoColorSync(images: string[], imageColors: Record<string, string>) {
  const [activeIndex, setActiveIndexRaw] = useState(0)
  const [selectedColor, setSelectedColor] = useState('')

  const setActiveIndex = (idx: number) => {
    setActiveIndexRaw(idx)
    const tag = imageColors[images[idx]]
    if (tag) setSelectedColor(tag)
  }

  const selectColor = (color: string) => {
    setSelectedColor(color)
    const idx = images.findIndex(img => imageColors[img] === color)
    if (idx !== -1) setActiveIndexRaw(idx)
  }

  return { activeIndex, setActiveIndex, selectedColor, selectColor }
}
```

Initial `selectedColor` seeding (first in-stock color) stays the caller's
responsibility, same as `OrderFormFields`' current `firstAvailable` logic — the
hook doesn't own defaulting, just the two-way sync.

**Call sites** (all currently duplicate an `activeImageIndex` local-state
gallery next to `<OrderFormFields>`): `StandaloneProductView.tsx`,
`LandingPageRenderer.tsx`, and the 5 niche theme files (`BeautyLanding.tsx`,
`SportLanding.tsx`, `CarLanding.tsx`, `TechLanding.tsx`, `HomeLanding.tsx`).
Each swaps its local `useState` for the hook and passes:

```tsx
<gallery onClick={hook.setActiveIndex} activeIndex={hook.activeIndex} />
<OrderFormFields color={hook.selectedColor} onColorChange={hook.selectColor} ... />
```

Legacy `components/OrderForm.tsx` (standalone all-in-one, used by
`app/product/[id]/page.tsx`) gets the same hook wired in directly since it
already manages both gallery and `selectedColor` state itself.

## Out of scope

- Filtering the thumbnail strip to a single color (explicitly rejected — jump-only behavior).
- Multi-color tags per photo (one-or-none only).
- Sizes are unaffected — this feature is colors-only.
