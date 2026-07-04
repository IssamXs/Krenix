# AI Product Photo Generation — Design Spec

**Date:** 2026-06-30
**Status:** Approved (pending implementation plan)
**Author:** Claude + Issam

---

## Problem

The AI landing page generator does not create any product photos. It sends the
merchant's uploaded image to **Claude for copy only** — Claude *reads* the image
to write better text but never *generates* new images. The hero reuses the single
uploaded photo, and the "extra product images" block in `LandingPageRenderer`
(lines ~315–324) only renders images from a *linked product* (`product.images`).
AI-generated pages always have `product_id: null`, so that block is always empty.

Goal: replicate the ayor.ai experience — the merchant provides a product (by image
upload **or** supplier link) and the AI generates **multiple new photos of that same
product** (lifestyle, studio, in-use, detail) woven throughout the landing page.

---

## Decisions (locked)

| Decision | Value |
|---|---|
| Product input | Image upload **OR** paste a supplier link (both feed one pipeline) |
| Credit cost | **5 credits** per landing page (fixes existing 1→5 bug; Basic's 5 credits = exactly 1 page) |
| Photos by plan | Basic **1**, Pro **3**, Ultimate+ **5** — same 5 credits, more photos = upgrade incentive |
| Image model | `gemini-3.1-flash-image-preview` in **image-to-image** mode |
| Orchestration | Approach B — copy first (instant), then photos generated **sequentially**, revealed one-by-one |
| Photo charge | Photos are **included** in the 5 credits (no extra charge) |

Trade-off accepted: sequential generation means a 5-photo Ultimate page takes ~30–40s
wall-clock (copy in ~3s, photos drip in). This dodges Vercel serverless timeouts and
keeps DB writes race-free, at the cost of speed vs. a parallel approach.

---

## Architecture

### 1. Image-to-image engine — `lib/gemini.ts`

New function `generateProductShot()`. Unlike the existing `generateAdCreativeImage()`
(text prompt only), it feeds the **product image as input** so Gemini produces a new
scene of the *same* product:

```ts
export interface ProductShotInput {
  productImageBase64: string
  productImageMimeType: string   // 'image/jpeg' | 'image/png' | 'image/webp'
  productName: string
  scenePrompt: string            // from the scene director
}

export interface ProductShotResult {
  imageBase64: string
  mimeType: string
}

export async function generateProductShot(input: ProductShotInput): Promise<ProductShotResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' })
  // responseModalities not in @google/generative-ai 0.24.x types → cast as any
  const result = await (model.generateContent as any)({
    contents: [{
      role: 'user',
      parts: [
        { inlineData: { data: input.productImageBase64, mimeType: input.productImageMimeType } },
        { text: input.scenePrompt },
      ],
    }],
    generationConfig: { responseModalities: ['image'] },
  })
  const parts = result?.response?.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p: { inlineData?: unknown }) => p.inlineData)
  if (!imagePart?.inlineData) throw new Error('Gemini returned no image data')
  return { imageBase64: imagePart.inlineData.data, mimeType: imagePart.inlineData.mimeType || 'image/png' }
}
```

Every scene prompt MUST instruct Gemini to:
- Preserve the EXACT product from the input image (shape, color, logo, proportions, materials).
- Only change environment, lighting, camera angle, background.
- Bake in NO text or graphics (clean photos, not ads).
- Produce professional e-commerce photography quality.

### 2. Scene directors — `lib/landing-photos.ts` (new)

Ordered array; the first N are used based on plan. Single source of truth for art
direction (tunable later per premium theme).

```ts
import type { Plan } from '@/types/database'
import { PRO_PLANS, ULTIMATE_PLANS } from '@/types/database'

export interface PhotoScene {
  id: string
  label: string          // French, for UI skeleton labels
  prompt: string         // English scene direction appended to the preservation preamble
}

export const PHOTO_SCENES: PhotoScene[] = [
  { id: 'lifestyle_hero', label: 'Photo principale', prompt:
    'place it in an aspirational real-world lifestyle setting that fits the product, with soft cinematic lighting, shallow depth of field and a tasteful blurred background.' },
  { id: 'studio_podium', label: 'Photo studio', prompt:
    'place it centered on a premium podium / pedestal against a clean smooth gradient studio backdrop, with soft reflections and a subtle floor shadow.' },
  { id: 'in_use', label: "Photo d'usage", prompt:
    'show the product naturally in use — held in a person\'s hands or being used in its real context — focus on the product, person partially framed.' },
  { id: 'detail_macro', label: 'Gros plan détail', prompt:
    'an extreme close-up macro shot emphasising the material, texture, finish and build quality, with crisp focus on surface details.' },
  { id: 'feature_scene', label: 'Photo ambiance', prompt:
    'a second lifestyle angle in a different environment and composition from the first, warm inviting atmosphere, product clearly the focal point.' },
]

export const SCENE_PRESERVATION_PREAMBLE =
  'Generate a new professional product photograph. Keep the EXACT same product shown ' +
  'in the provided image — identical shape, colors, logo, proportions and materials. ' +
  'Do NOT alter the product. Only change the scene: '

export function getPhotoCount(plan: Plan): number {
  if (ULTIMATE_PLANS.includes(plan)) return 5
  if (PRO_PLANS.includes(plan)) return 3
  return 1 // basic
}

export function buildScenePrompt(scene: PhotoScene, productName: string): string {
  return `${SCENE_PRESERVATION_PREAMBLE}${scene.prompt} Product: "${productName}". ` +
    'No text, no watermarks, no graphics. Square 1:1 aspect ratio. E-commerce quality.'
}
```

### 3. Phase 1 — extend `POST /api/ai/landing-page`

- Guard: `if (store.ai_credits < 5) return 402`.
- Deduct **5** atomically: `.update({ ai_credits: store.ai_credits - 5 }).eq('ai_credits', store.ai_credits)`.
- On Claude failure or insert failure: refund all 5 (`.update({ ai_credits: store.ai_credits })`).
- Persist the source product image URL in `content._meta.imageUrl` (already happens) — Phase 2 reads it back.
- Return `{ landingPage }` as today. No photo generation in this request.

### 4. Phase 2 — `POST /api/ai/landing-page/photos` (new)

Request: `{ landingPageId: string, sceneIndex: number }`

1. Auth via server client; load the page joined to its store; verify the store's
   `owner_id === user.id` (ownership check — do NOT rely on RLS alone since we use admin client for storage).
2. Read source image from `content._meta.imageUrl`. If missing → 400 `{ error: 'Aucune image source' }`.
3. Validate `sceneIndex < getPhotoCount(store.plan)` and `< PHOTO_SCENES.length`. Else 400.
4. Fetch the source image bytes, convert to base64 + detect mime.
5. `buildScenePrompt(PHOTO_SCENES[sceneIndex], productName)` → `generateProductShot()`.
6. Upload result to `product-images/{store_id}/landing-photos/{slug}/{sceneIndex}.png` (admin client, `upsert: true`).
7. Append the public URL to `landing_pages.generated_images` (read current array, set slot `[sceneIndex]`, write back). Safe because the client calls this endpoint **sequentially**.
8. Return `{ imageUrl, sceneIndex }`. On Gemini failure → 500 `{ error }` (client continues to next scene; partial success is acceptable).

No credit deduction here (included in Phase 1's 5).

### 5. Link import — `POST /api/ai/import-product` (new)

Request: `{ url: string }`

1. Auth; resolve the user's store (for the storage path).
2. `fetch(url)` the HTML. Parse:
   - Image: `og:image` → `twitter:image` → first JSON-LD `Product.image`.
   - Title: `og:title` → `<title>`.
   - Price: JSON-LD `Offer.price` if present (optional).
3. If an image is found, fetch its bytes and **re-upload** to
   `product-images/{store_id}/imports/{timestamp}.png` (avoids supplier hotlink
   expiry / blocking). Return `{ imageUrl, title, price }` using the Supabase public URL.
4. If no image found → 422 `{ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }`.

Best-effort by design; merchants fall back to upload when a site blocks scraping.

### 6. UI — `dashboard/pages/new/page.tsx`

- Add an input-mode toggle at the top of the form: **"Uploader une photo"** | **"Importer un lien"**.
  - Link mode: URL input + "Importer" button → calls `/api/ai/import-product` → fills
    `imagePreview`/`imageUrl` and prefills `productName` + `price` when returned.
- Credits UI: change "Coût : 1 crédit IA" → "Coût : 5 crédits IA"; `noCredits` becomes
  `(store?.ai_credits ?? 0) < 5`; pre-generate guard updated likewise.
- Generate → Phase 1. On success, open the preview step showing copy + source image as
  hero + `getPhotoCount(plan)` grey skeleton tiles.
- Then loop `sceneIndex = 0 … N-1` **sequentially** (`await` each), calling the photos
  endpoint. As each URL returns, replace its skeleton and (for index 0) swap the hero.
  Button label: `Création des photos produit… (k/N)`. Failures leave that tile empty and continue.
- Local `genResult`/state holds the accumulating `generated_images` so the preview re-renders live.

### 7. Rendering — `LandingPageRenderer.tsx`

- Hero priority: `landingPage.generated_images?.[0]` → `product?.images?.[0]` → `meta?.imageUrl` → `raw.hero.background_image` → null.
- Replace the `product && product.images.length > 1` block with a **photo gallery**:
  render `generated_images.slice(1)` (and still support `product.images.slice(1,5)` when a
  product is linked) as a responsive grid/strip between the benefits and product-details sections.

### 8. Data model

- Migration `Database/011_landing_generated_images.sql`:
  ```sql
  ALTER TABLE landing_pages
    ADD COLUMN IF NOT EXISTS generated_images text[] NOT NULL DEFAULT '{}';
  ```
- `types/database.ts`: add `generated_images: string[]` to `LandingPage`.
- Add `generated_images` to the `select()` in:
  - `app/store/page.tsx` (landing pages fetch) — uses `*` so already covered.
  - `app/store/p/[slug]/page.tsx` — uses `*` so already covered.
  - `dashboard/pages/page.tsx`, `dashboard/pages/[id]/page.tsx` — uses `*` so already covered.
  (`select('*')` already returns new columns; verify no explicit column lists exclude it.)

---

## Files touched

| File | Change |
|---|---|
| `src/lib/gemini.ts` | Add `generateProductShot()` (image-to-image) |
| `src/lib/landing-photos.ts` | **New** — scenes, `getPhotoCount`, `buildScenePrompt` |
| `src/app/api/ai/landing-page/route.ts` | Deduct 5 credits (was 1); guard `< 5`; refund 5 |
| `src/app/api/ai/landing-page/photos/route.ts` | **New** — Phase 2 single-photo endpoint |
| `src/app/api/ai/import-product/route.ts` | **New** — link scrape + re-upload |
| `src/app/(platform)/dashboard/pages/new/page.tsx` | Input toggle, 5-credit UI, sequential Phase 2 |
| `src/components/store/LandingPageRenderer.tsx` | Hero from generated images + gallery section |
| `src/types/database.ts` | `LandingPage.generated_images: string[]` |
| `Database/011_landing_generated_images.sql` | **New** migration |

---

## Error handling

- **Insufficient credits:** Phase 1 returns 402; UI shows existing upgrade prompt.
- **Claude copy fails:** refund 5 credits, 500 with message; no page created.
- **Photo gen fails (one scene):** that tile stays empty, loop continues; page still publishes.
- **No source image at Phase 2:** 400; should not happen (Phase 1 always stores `_meta.imageUrl` when provided). If the merchant generated with no image at all, Basic/Pro/Ultimate simply skip photos (count still applies but there's nothing to transform) — Phase 2 short-circuits to 400 and UI shows copy-only page.
- **Link import fails / no image:** 422; UI instructs manual upload.
- **Storage bucket missing:** surfaced message pointing to `Database/005_storage.sql` (existing pattern).

## Out of scope (YAGNI)

- Parallel photo generation + `landing_page_photos` table (future speed optimization).
- Per-photo "retry"/"regenerate" buttons (v2).
- Background-queue orchestration.
- Editing/replacing individual generated photos in the page editor (v2).

## Testing

- `getPhotoCount` returns 1/3/5 for basic / pro / ultimate (+ growth/business/agency/enterprise/sur_mesure → 5).
- `buildScenePrompt` includes the preservation preamble and product name.
- Phase 1 deducts exactly 5 and refunds 5 on Claude failure (mock).
- Phase 2 rejects `sceneIndex >= getPhotoCount(plan)` and rejects non-owner stores.
- Import endpoint returns a Supabase URL (not the raw supplier URL) and 422 when no image.
- One real end-to-end generation (Pro store): copy appears, 3 photos drip in, page publishes and renders hero + gallery on the store.
