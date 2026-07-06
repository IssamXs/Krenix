# AI Product Photo Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI landing-page generator produce multiple new on-brand photos of the merchant's actual product (lifestyle, studio, in-use, detail shots) instead of just reusing the one uploaded image, matching the ayor.ai experience, and let merchants supply the product via an upload **or** a supplier link.

**Architecture:** Two-phase generation. Phase 1 (existing `/api/ai/landing-page` route) writes the copy with Claude and now correctly deducts 5 credits (fixing an existing 1-credit bug). Phase 2 (new `/api/ai/landing-page/photos` route) is called once per photo, sequentially from the client, and uses a new Gemini image-to-image function (`generateProductShot`) seeded with the merchant's product image plus a scene prompt from a new scene-director module (`lib/landing-photos.ts`). Generated photo URLs accumulate on `landing_pages.generated_images` (new column) and are read by `LandingPageRenderer` for the hero image and a new gallery section. A new `/api/ai/import-product` route lets merchants paste a supplier link instead of uploading, scraping `og:image`/`og:title` and re-hosting the image in Supabase Storage.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS only, Supabase (admin client for service-role writes, server client for session auth), `@google/generative-ai` (`gemini-3.1-flash-image-preview`), `@anthropic-ai/sdk` (`claude-sonnet-4-6`, unchanged).

**On testing:** this repo has no test runner installed (no jest/vitest/playwright in `package.json`, no `*.test.ts` files outside `node_modules`). Adding one is out of scope for this feature (YAGNI — a feature plan is not the place to bootstrap project-wide test infra). Each task below substitutes automated unit tests with: (a) `npx tsc --noEmit` to catch type errors, and (b) a concrete manual verification step (a `curl`/PowerShell `Invoke-RestMethod` call against the dev server, or a browser check) with an exact expected result. This mirrors how every other feature in this codebase has been verified so far.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `Database/011_landing_generated_images.sql` | New | Adds `generated_images text[]` column to `landing_pages` |
| `src/types/database.ts` | Modify | `LandingPage.generated_images: string[]` |
| `src/lib/landing-photos.ts` | New | Scene director: `PHOTO_SCENES`, `getPhotoCount`, `buildScenePrompt` — pure functions, no I/O |
| `src/lib/gemini.ts` | Modify | Add `generateProductShot()` (image-to-image) |
| `src/app/api/ai/landing-page/route.ts` | Modify | Deduct/refund 5 credits instead of 1 |
| `src/app/api/ai/landing-page/photos/route.ts` | New | Phase 2 — generate one photo, append to `generated_images` |
| `src/app/api/ai/import-product/route.ts` | New | Scrape a supplier link, re-host the image |
| `src/app/(platform)/dashboard/pages/new/page.tsx` | Modify | Upload/link toggle, 5-credit display, sequential photo loop UI |
| `src/components/store/LandingPageRenderer.tsx` | Modify | Hero priority chain + real photo gallery (replaces dead block) |

---

### Task 1: Database migration — `generated_images` column

**Files:**
- Create: `Database/011_landing_generated_images.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ================================================================
-- 011_landing_generated_images.sql — AI-generated product photos
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ================================================================

ALTER TABLE landing_pages
  ADD COLUMN IF NOT EXISTS generated_images text[] NOT NULL DEFAULT '{}';
```

- [ ] **Step 2: Run it in Supabase**

Open Supabase Studio → SQL Editor → paste the file contents → Run. Tell the user to do this manually (same pattern as every prior `Database/0xx_*.sql` file in this repo — there is no automated migration runner).

Expected: `ALTER TABLE` succeeds, no rows affected message is fine (it's a schema change).

- [ ] **Step 3: Verify the column exists**

In the SQL Editor run:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'landing_pages' AND column_name = 'generated_images';
```
Expected: one row, `data_type = ARRAY`, `column_default = '{}'::text[]`.

- [ ] **Step 4: Commit**

This repo is not a git repository (confirmed earlier in this project — `git status` fails / "Is a git repository: false"). Skip commit steps for every task in this plan; just save the files. If the user initializes git later, all these files are picked up in the first commit naturally.

---

### Task 2: Type update — `LandingPage.generated_images`

**Files:**
- Modify: `src/types/database.ts:202-223`

- [ ] **Step 1: Add the field to the `LandingPage` interface**

In `src/types/database.ts`, find the `LandingPage` interface (starts at line 202):

```ts
export interface LandingPage {
  id: string
  store_id: string
  product_id: string | null
  title: string
  slug: string
  content: LandingPageContent
  theme_id: string | null
  is_active: boolean
  views: number
  orders_count: number
  // Upsell
  upsell_enabled: boolean
  upsell_product_name: string | null
  upsell_text: string | null
  upsell_price: number | null
  created_at: string
  updated_at: string
  // Joined fields
  product?: Product
  theme?: Theme
}
```

Change it to add `generated_images` right after `orders_count`:

```ts
export interface LandingPage {
  id: string
  store_id: string
  product_id: string | null
  title: string
  slug: string
  content: LandingPageContent
  theme_id: string | null
  is_active: boolean
  views: number
  orders_count: number
  generated_images: string[]
  // Upsell
  upsell_enabled: boolean
  upsell_product_name: string | null
  upsell_text: string | null
  upsell_price: number | null
  created_at: string
  updated_at: string
  // Joined fields
  product?: Product
  theme?: Theme
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: this alone won't fail yet (no code reads/writes the field), but it confirms the file still parses. If it errors, you mistyped the edit — fix and re-run.

- [ ] **Step 3: Commit**

Skipped (no git repo) — see Task 1 Step 4.

---

### Task 3: Scene director module — `lib/landing-photos.ts`

**Files:**
- Create: `src/lib/landing-photos.ts`

This is a pure-logic module (no network calls), so it's the easiest place to verify behavior in isolation before wiring it into routes.

- [ ] **Step 1: Write the module**

```ts
// ============================================================
// KRENIX — AI Product Photo Scene Director
// Single source of truth for what photos get generated and in
// what order. Used by /api/ai/landing-page/photos.
// ============================================================

import type { Plan } from '@/types/database'
import { PRO_PLANS, ULTIMATE_PLANS } from '@/types/database'

export interface PhotoScene {
  id: string
  label: string          // French, for UI skeleton labels
  prompt: string         // English scene direction appended to the preservation preamble
}

export const PHOTO_SCENES: PhotoScene[] = [
  {
    id: 'lifestyle_hero',
    label: 'Photo principale',
    prompt: 'place it in an aspirational real-world lifestyle setting that fits the product, with soft cinematic lighting, shallow depth of field and a tasteful blurred background.',
  },
  {
    id: 'studio_podium',
    label: 'Photo studio',
    prompt: 'place it centered on a premium podium / pedestal against a clean smooth gradient studio backdrop, with soft reflections and a subtle floor shadow.',
  },
  {
    id: 'in_use',
    label: "Photo d'usage",
    prompt: 'show the product naturally in use — held in a person\'s hands or being used in its real context — focus on the product, person partially framed.',
  },
  {
    id: 'detail_macro',
    label: 'Gros plan détail',
    prompt: 'an extreme close-up macro shot emphasising the material, texture, finish and build quality, with crisp focus on surface details.',
  },
  {
    id: 'feature_scene',
    label: 'Photo ambiance',
    prompt: 'a second lifestyle angle in a different environment and composition from the first, warm inviting atmosphere, product clearly the focal point.',
  },
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

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS, no errors referencing `landing-photos.ts`.

- [ ] **Step 3: Manually verify the logic with a scratch script**

Create a throwaway file `scratch-verify-photos.mjs` in the project root (NOT under `src/`, so it's never imported):

```js
// scratch-verify-photos.mjs — throwaway, delete after running
import { getPhotoCount, buildScenePrompt, PHOTO_SCENES } from './src/lib/landing-photos.ts'

console.log('basic →', getPhotoCount('basic'))       // expect 1
console.log('pro →', getPhotoCount('pro'))            // expect 3
console.log('ultimate →', getPhotoCount('ultimate'))  // expect 5
console.log('growth →', getPhotoCount('growth'))      // expect 5
console.log('enterprise →', getPhotoCount('enterprise')) // expect 5

const prompt = buildScenePrompt(PHOTO_SCENES[0], 'Gourde Premium')
console.log('includes preamble:', prompt.includes('Keep the EXACT same product'))
console.log('includes product name:', prompt.includes('Gourde Premium'))
```

Run: `npx tsx scratch-verify-photos.mjs`

Expected output:
```
basic → 1
pro → 3
ultimate → 5
growth → 5
enterprise → 5
includes preamble: true
includes product name: true
```

If `npx tsx` fails to resolve (no internet for the one-off download, or path alias `@/` not resolved by tsx outside the Next.js build), skip running it and instead eyeball-verify: `ULTIMATE_PLANS` includes `ultimate, growth, business, agency, enterprise, sur_mesure` and `PRO_PLANS` includes `pro` plus everything in `ULTIMATE_PLANS` (confirmed in `src/types/database.ts:9-10`), so the `if/if/return 1` order in `getPhotoCount` is correct by inspection. Either way, delete `scratch-verify-photos.mjs` before moving on — it must not be committed/left in the repo.

- [ ] **Step 4: Delete the scratch file**

Run: `rm scratch-verify-photos.mjs` (or delete it via the file tool). Confirm `src/lib/landing-photos.ts` is the only new file left from this task.

- [ ] **Step 5: Commit**

Skipped (no git repo).

---

### Task 4: Image-to-image engine — `generateProductShot()` in `lib/gemini.ts`

**Files:**
- Modify: `src/lib/gemini.ts` (add after `generateAdCreativeImage`, i.e. after line 222)

- [ ] **Step 1: Add the new function**

Insert this block into `src/lib/gemini.ts` right after the closing brace of `generateAdCreativeImage` (after line 222, before the `COST ESTIMATES` section comment at line 224):

```ts
// ============================================================
// PRODUCT SHOT GENERATION (image-to-image)
// Unlike generateAdCreativeImage (text-prompt-only), this feeds
// the merchant's product photo as input so Gemini produces a NEW
// scene of the SAME product instead of an unrelated image.
// ============================================================
export interface ProductShotInput {
  productImageBase64: string
  productImageMimeType: string   // 'image/jpeg' | 'image/png' | 'image/webp'
  productName: string
  scenePrompt: string            // from buildScenePrompt() in lib/landing-photos.ts
}

export interface ProductShotResult {
  imageBase64: string
  mimeType: string
}

export async function generateProductShot(input: ProductShotInput): Promise<ProductShotResult> {
  const model = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' })

  // responseModalities is not yet in @google/generative-ai 0.24.x types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> =
    result?.response?.candidates?.[0]?.content?.parts ?? []

  const imagePart = parts.find(p => p.inlineData)
  if (!imagePart?.inlineData) {
    throw new Error('Gemini n\'a retourné aucune image')
  }

  return {
    imageBase64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/png',
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If TypeScript complains about the `any` cast, confirm the `eslint-disable` comment line was copied (it suppresses lint, not the type system — the `as any` cast itself is what satisfies `tsc`, matching the existing `generateAdCreativeImage` pattern at `src/lib/gemini.ts:205`).

- [ ] **Step 3: Manual smoke test against the real Gemini API**

This needs a real API key (`GOOGLE_GENERATIVE_AI_API_KEY` in `.env.local`) and network access, so defer the live call to Task 6's end-to-end check rather than testing it standalone here — calling it in isolation would just duplicate that work. For now, confirm the function compiles and its exported types (`ProductShotInput`, `ProductShotResult`) match what Task 6 will import.

- [ ] **Step 4: Commit**

Skipped (no git repo).

---

### Task 5: Fix Phase 1 credit deduction (1 → 5)

**Files:**
- Modify: `src/app/api/ai/landing-page/route.ts:26,31,53,91`

The current code deducts/refunds **1** credit; CLAUDE.md and the approved spec both say landing page generation costs **5** credits (Basic plan's 5 one-time credits should buy exactly one page). This task only fixes the credit math — no photo generation happens in this route (that's Task 6).

- [ ] **Step 1: Update the guard**

In `src/app/api/ai/landing-page/route.ts`, line 26 currently reads:

```ts
    if (store.ai_credits <= 0) return NextResponse.json({ error: 'Crédits insuffisants' }, { status: 402 })
```

Change to:

```ts
    if (store.ai_credits < 5) return NextResponse.json({ error: 'Crédits insuffisants (5 requis)' }, { status: 402 })
```

- [ ] **Step 2: Update the atomic deduction**

Lines 28-39 currently read:

```ts
    // Atomic credit deduction — optimistic lock
    const { data: updatedStore, error: deductError } = await supabase
      .from('stores')
      .update({ ai_credits: store.ai_credits - 1 })
      .eq('id', store.id)
      .eq('ai_credits', store.ai_credits)
      .select('id')
      .single()
```

Change `store.ai_credits - 1` to `store.ai_credits - 5`:

```ts
    // Atomic credit deduction — optimistic lock (5 credits per landing page)
    const { data: updatedStore, error: deductError } = await supabase
      .from('stores')
      .update({ ai_credits: store.ai_credits - 5 })
      .eq('id', store.id)
      .eq('ai_credits', store.ai_credits)
      .select('id')
      .single()
```

- [ ] **Step 3: Update both refund call sites**

Line 53 (on Claude failure) and line 91 (on insert failure) both currently read:

```ts
      await supabase.from('stores').update({ ai_credits: store.ai_credits }).eq('id', store.id)
```

These are already correct as-is — they reset to `store.ai_credits` (the pre-deduction value captured at line 19-23), not a hardcoded delta, so they automatically refund the full 5 once Step 2 changes the deduction amount. **No edit needed here** — just confirm by reading the two lines that they reference `store.ai_credits` (the original snapshot) and not a literal number.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Manual verification against the dev server**

Start the dev server if not running: `npm run dev` (background).

Using a test store with `ai_credits` known (e.g. set to 12 via Supabase Studio), call the route while logged in as that store's owner (use the browser preview, logged into the dashboard, then in the browser console or via the form at `/dashboard/pages/new`). After one successful generation:

```sql
SELECT ai_credits FROM stores WHERE id = '<store-id>';
```
Expected: `12 - 5 = 7`.

Then force a failure (e.g. temporarily rename `ANTHROPIC_API_KEY` in `.env.local` to break Claude, restart dev server, try generating again) and confirm credits are unchanged after the 500 response (refund worked), then restore the real key.

- [ ] **Step 6: Commit**

Skipped (no git repo).

---

### Task 6: Phase 2 route — `POST /api/ai/landing-page/photos`

**Files:**
- Create: `src/app/api/ai/landing-page/photos/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateProductShot } from '@/lib/gemini'
import { PHOTO_SCENES, getPhotoCount, buildScenePrompt } from '@/lib/landing-photos'
import type { Plan } from '@/types/database'

export async function POST(req: NextRequest) {
  try {
    const { landingPageId, sceneIndex } = await req.json() as {
      landingPageId?: string
      sceneIndex?: number
    }

    if (!landingPageId || typeof sceneIndex !== 'number') {
      return NextResponse.json({ error: 'landingPageId et sceneIndex requis' }, { status: 400 })
    }

    // Auth — session-bound client, not the admin client, for the ownership check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { data: store } = await supabase
      .from('stores')
      .select('id, plan, owner_id, slug')
      .eq('owner_id', user.id)
      .single()
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const { data: landingPage } = await supabase
      .from('landing_pages')
      .select('id, slug, content, generated_images')
      .eq('id', landingPageId)
      .eq('store_id', store.id)
      .single()
    if (!landingPage) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

    const maxPhotos = getPhotoCount(store.plan as Plan)
    if (sceneIndex >= maxPhotos || sceneIndex >= PHOTO_SCENES.length) {
      return NextResponse.json({ error: 'Index de scène invalide pour ce plan' }, { status: 400 })
    }

    const sourceImageUrl = landingPage.content?._meta?.imageUrl
    if (!sourceImageUrl) {
      return NextResponse.json({ error: 'Aucune image source' }, { status: 400 })
    }

    // Fetch source image bytes
    const imgRes = await fetch(sourceImageUrl)
    if (!imgRes.ok) {
      return NextResponse.json({ error: 'Image source inaccessible' }, { status: 400 })
    }
    const contentType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
    const buffer = await imgRes.arrayBuffer()
    const productImageBase64 = Buffer.from(buffer).toString('base64')

    const productName = landingPage.content?._meta?.productName ?? 'Produit'
    const scene = PHOTO_SCENES[sceneIndex]
    const scenePrompt = buildScenePrompt(scene, productName)

    let shot
    try {
      shot = await generateProductShot({
        productImageBase64,
        productImageMimeType: contentType,
        productName,
        scenePrompt,
      })
    } catch (genError) {
      const msg = genError instanceof Error ? genError.message : 'Erreur de génération photo'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    // Upload via admin client (service role — bypasses RLS for storage)
    const admin = createAdminClient()
    const ext = shot.mimeType.includes('jpeg') ? 'jpg' : 'png'
    const path = `${store.id}/landing-photos/${landingPage.slug}/${sceneIndex}.${ext}`
    const imageBuffer = Buffer.from(shot.imageBase64, 'base64')

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(path, imageBuffer, { contentType: shot.mimeType, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: 'Erreur de stockage de l\'image' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from('product-images').getPublicUrl(path)

    // Append to generated_images at the correct slot (sequential calls — safe to read-then-write)
    const current = [...(landingPage.generated_images ?? [])]
    current[sceneIndex] = publicUrl
    await admin
      .from('landing_pages')
      .update({ generated_images: current })
      .eq('id', landingPageId)

    return NextResponse.json({ imageUrl: publicUrl, sceneIndex })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If `landingPage.content?._meta?.imageUrl` errors because `content` is typed as `LandingPageContent` (not nullable from a `select`), that's fine — Supabase's generic client types columns loosely; if `tsc` complains about possibly-undefined chains, the optional chaining (`?.`) already handles it. A real error here would be a typo in an imported name (`PHOTO_SCENES`, `getPhotoCount`, `buildScenePrompt`, `generateProductShot`) — double check those four imports match the exact export names from Tasks 3 and 4.

- [ ] **Step 3: Manual verification — reject wrong owner**

With the dev server running, log in as Store A's owner in the browser, then call the endpoint for a `landingPageId` belonging to a different store (Store B) — e.g. via the browser console while on the dashboard:

```js
fetch('/api/ai/landing-page/photos', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ landingPageId: '<store-B-page-id>', sceneIndex: 0 }),
}).then(r => r.json()).then(console.log)
```
Expected: `{"error":"Page introuvable"}` with a 404 (the `.eq('store_id', store.id)` filter excludes it — this is the ownership check called out in the spec).

- [ ] **Step 4: Manual verification — reject scene index over plan limit**

For a Basic-plan store (`getPhotoCount` → 1), call with `sceneIndex: 1`:
Expected: `{"error":"Index de scène invalide pour ce plan"}`, 400.

- [ ] **Step 5: Manual verification — happy path**

For a Pro-plan store with a landing page that has `content._meta.imageUrl` set (generate one first via the existing form), call with `sceneIndex: 0`:
Expected: `{"imageUrl":"https://...supabase.co/storage/v1/object/public/product-images/<store_id>/landing-photos/<slug>/0.png","sceneIndex":0}`, 200. Then in Supabase Studio:
```sql
SELECT generated_images FROM landing_pages WHERE id = '<page-id>';
```
Expected: array with one URL at index 0 matching the returned `imageUrl`.

- [ ] **Step 6: Commit**

Skipped (no git repo).

---

### Task 7: Link import route — `POST /api/ai/import-product`

**Files:**
- Create: `src/app/api/ai/import-product/route.ts`

No HTML-parsing library exists in this repo's dependencies (no cheerio, no node-html-parser) — adding one for three regex extractions would be over-engineering for a "best-effort" feature per the spec. Use targeted regexes against the raw HTML instead.

- [ ] **Step 1: Write the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

function extractMeta(html: string, property: string): string | null {
  // Matches <meta property="og:image" content="..."> in either attribute order
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null
}

function extractTitle(html: string): string | null {
  const ogTitle = extractMeta(html, 'og:title')
  if (ogTitle) return ogTitle
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return titleTag?.[1]?.trim() ?? null
}

function extractPrice(html: string): number | null {
  // Best-effort: look for JSON-LD "price":"X" or "price":X
  const match = html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i)
  return match ? Number(match[1]) : null
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json() as { url?: string }
    if (!url) return NextResponse.json({ error: 'URL requise' }, { status: 400 })

    let validUrl: URL
    try {
      validUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
    }
    if (validUrl.protocol !== 'http:' && validUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { data: store } = await supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    let html: string
    try {
      const pageRes = await fetch(validUrl.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KrenixBot/1.0)' },
      })
      if (!pageRes.ok) throw new Error('fetch failed')
      html = await pageRes.text()
    } catch {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    const ogImage = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image')
    if (!ogImage) {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    const imageAbsoluteUrl = new URL(ogImage, validUrl).toString()

    let imageBuffer: ArrayBuffer
    let contentType = 'image/jpeg'
    try {
      const imgRes = await fetch(imageAbsoluteUrl)
      if (!imgRes.ok) throw new Error('image fetch failed')
      contentType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
      imageBuffer = await imgRes.arrayBuffer()
    } catch {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    const admin = createAdminClient()
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const path = `${store.id}/imports/${Date.now()}.${ext}`

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(path, Buffer.from(imageBuffer), { contentType, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: 'Erreur de stockage de l\'image' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from('product-images').getPublicUrl(path)

    return NextResponse.json({
      imageUrl: publicUrl,
      title: extractTitle(html),
      price: extractPrice(html),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Manual verification — happy path**

With the dev server running and logged in, from the browser console on any dashboard page:

```js
fetch('/api/ai/import-product', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: 'https://example.com/some-product-page' }),
}).then(r => r.json()).then(console.log)
```
Use a real product page URL with an `og:image` tag you have access to (e.g. a public AliExpress/Shein product page, or any site with Open Graph tags). Expected: `{"imageUrl":"https://...supabase.co/storage/...","title":"...","price":...}` where `imageUrl` points at **your own** Supabase storage, not the original supplier domain.

- [ ] **Step 4: Manual verification — no image found**

Call with a URL known to have no `og:image` (e.g. a bare text page, or `https://example.com`):
Expected: `{"error":"Image introuvable sur ce lien. Uploadez une photo manuellement."}`, 422.

- [ ] **Step 5: Manual verification — invalid URL**

Call with `{"url": "not-a-url"}`:
Expected: `{"error":"URL invalide"}`, 400.

- [ ] **Step 6: Commit**

Skipped (no git repo).

---

### Task 8: UI — `dashboard/pages/new/page.tsx`

**Files:**
- Modify: `src/app/(platform)/dashboard/pages/new/page.tsx`

This task has the most moving parts: an input-mode toggle, updated credit copy, and the sequential photo-generation loop with live preview updates. Breaking it into sub-steps.

- [ ] **Step 1: Add link-import state and mode toggle**

In `src/app/(platform)/dashboard/pages/new/page.tsx`, after the existing form-field state block (after line 40, `const [imagePreview, setImagePreview] = useState('')`), add:

```ts
  const [inputMode, setInputMode] = useState<'upload' | 'link'>('upload')
  const [productLink, setProductLink] = useState('')
  const [importing, setImporting] = useState(false)
```

And after the UI state block (after line 47, `const [error, setError] = useState('')`), add photo-generation state:

```ts
  const [photosTotal, setPhotosTotal] = useState(0)
  const [photosDone, setPhotosDone] = useState(0)
  const [generatedImages, setGeneratedImages] = useState<string[]>([])
```

- [ ] **Step 2: Add the link-import handler**

After `handleImageUpload` (after line 79), add:

```ts
  const handleImportLink = async () => {
    if (!productLink.trim()) { setError('Collez un lien produit.'); return }
    setImporting(true)
    setError('')
    const res = await fetch('/api/ai/import-product', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: productLink.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error || 'Import impossible. Uploadez une photo manuellement.')
      setImporting(false)
      return
    }
    setImageUrl(data.imageUrl)
    setImagePreview(data.imageUrl)
    if (data.title && !productName.trim()) setProductName(data.title)
    if (data.price && !price.trim()) setPrice(String(data.price))
    setImporting(false)
  }
```

- [ ] **Step 3: Type-check after Steps 1-2**

Run: `npx tsc --noEmit`
Expected: PASS. `price` is typed as `string` from `useState('')` so `price.trim()` and `String(data.price)` are valid.

- [ ] **Step 4: Add the photo-generation loop to `handleGenerate`**

Replace the credit-guard line at line 84:

```ts
    if ((store?.ai_credits ?? 0) <= 0) { setError('Vous n\'avez plus de crédits IA.'); return }
```

with:

```ts
    if ((store?.ai_credits ?? 0) < 5) { setError('Vous n\'avez plus assez de crédits IA (5 requis).'); return }
```

Then replace the success branch (lines 115-120):

```ts
    const { landingPage } = await res.json()
    setGeneratedPage(landingPage as LandingPage)
    // Deduct credit locally so the sidebar counter reflects it
    if (store) setStore({ ...store, ai_credits: store.ai_credits - 1 })
    setStep('preview')
    setGenerating(false)
```

with:

```ts
    const { landingPage } = await res.json()
    setGeneratedPage(landingPage as LandingPage)
    // Deduct credits locally so the sidebar counter reflects it
    if (store) setStore({ ...store, ai_credits: store.ai_credits - 5 })
    setStep('preview')
    setGenerating(false)

    // Phase 2 — generate photos sequentially (only if a source image was provided)
    if (imageUrl && store) {
      const planPhotoCount = getPhotoCount(store.plan)
      setPhotosTotal(planPhotoCount)
      setPhotosDone(0)
      setGeneratedImages([])
      for (let sceneIndex = 0; sceneIndex < planPhotoCount; sceneIndex++) {
        try {
          const photoRes = await fetch('/api/ai/landing-page/photos', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ landingPageId: (landingPage as LandingPage).id, sceneIndex }),
          })
          if (photoRes.ok) {
            const { imageUrl: photoUrl } = await photoRes.json()
            setGeneratedImages(prev => {
              const next = [...prev]
              next[sceneIndex] = photoUrl
              return next
            })
          }
        } catch {
          // Network failure on this scene — leave its slot empty, continue to next
        }
        setPhotosDone(sceneIndex + 1)
      }
    }
```

Add the import for `getPhotoCount` at the top of the file, next to the existing imports (after line 6, `import type { Store, LandingPage } from '@/types/database'`):

```ts
import { getPhotoCount } from '@/lib/landing-photos'
```

- [ ] **Step 5: Surface progress + gallery in the preview step**

In the preview-step JSX, find the publish action bar's title block (lines 159-167):

```tsx
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{generatedPage.title}</p>
            {isBilingual && (
              <p className="text-[10px] text-[#3B82F6]">
                <Globe size={9} className="inline mr-1" />
                Bilingue FR + عربي
              </p>
            )}
          </div>
```

Add a photo-progress line right after the `isBilingual` block, still inside the same `<div>`:

```tsx
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm truncate">{generatedPage.title}</p>
            {isBilingual && (
              <p className="text-[10px] text-[#3B82F6]">
                <Globe size={9} className="inline mr-1" />
                Bilingue FR + عربي
              </p>
            )}
            {photosTotal > 0 && photosDone < photosTotal && (
              <p className="text-[10px] text-gray-500 flex items-center gap-1">
                <Loader2 size={9} className="animate-spin" />
                Création des photos produit… ({photosDone}/{photosTotal})
              </p>
            )}
          </div>
```

The renderer (`LandingPageRenderer`) reads photos off `landingPage.generated_images`, so the live preview needs `generatedPage` to reflect the accumulating array. Update the `setGeneratedImages` calls in Step 4 to also patch `generatedPage` — replace the `setGeneratedImages(prev => {...})` block from Step 4 with:

```ts
          if (photoRes.ok) {
            const { imageUrl: photoUrl } = await photoRes.json()
            setGeneratedPage(prev => {
              if (!prev) return prev
              const next = [...(prev.generated_images ?? [])]
              next[sceneIndex] = photoUrl
              return { ...prev, generated_images: next }
            })
          }
```

(This replaces the `setGeneratedImages` state entirely — drop the `generatedImages`/`setGeneratedImages` declaration added in Step 1's second block since `generatedPage.generated_images` is now the single source of truth. Keep `photosTotal`/`photosDone` for the progress label.)

- [ ] **Step 6: Add the input-mode toggle to the form UI**

In the form-step JSX, find the "Photo" field block (lines 285-314), which starts with:

```tsx
        {/* Photo */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">
            Photo du produit <span className="text-gray-600 normal-case">(optionnel — améliore la qualité)</span>
          </label>
```

Replace the whole block (lines 285-314) with a version that adds the toggle above the existing upload UI and a link-input branch:

```tsx
        {/* Photo */}
        <div>
          <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">
            Photo du produit <span className="text-gray-600 normal-case">(optionnel — améliore la qualité)</span>
          </label>

          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setInputMode('upload')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                inputMode === 'upload' ? 'border-[#3B82F6]/50 bg-[#3B82F6]/5 text-[#3B82F6]' : 'border-white/10 text-gray-400'
              }`}
            >
              Uploader une photo
            </button>
            <button
              onClick={() => setInputMode('link')}
              className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-all ${
                inputMode === 'link' ? 'border-[#3B82F6]/50 bg-[#3B82F6]/5 text-[#3B82F6]' : 'border-white/10 text-gray-400'
              }`}
            >
              Importer un lien
            </button>
          </div>

          {inputMode === 'link' && !imagePreview && (
            <div className="flex gap-2 mb-3">
              <input
                value={productLink}
                onChange={e => setProductLink(e.target.value)}
                placeholder="https://fournisseur.com/produit"
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
              />
              <button
                onClick={handleImportLink}
                disabled={importing || !productLink.trim()}
                className="px-4 rounded-xl bg-[#3B82F6]/15 border border-[#3B82F6]/30 text-[#3B82F6] text-sm font-semibold disabled:opacity-50"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : 'Importer'}
              </button>
            </div>
          )}

          {imagePreview ? (
            <div className="relative">
              <img src={imagePreview} alt="Aperçu" className="w-full h-44 object-cover rounded-xl" />
              <button
                onClick={() => { setImageUrl(''); setImagePreview(''); setProductLink('') }}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 flex items-center justify-center text-white hover:bg-black/80 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          ) : inputMode === 'upload' ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-32 rounded-xl border border-dashed border-white/15 flex flex-col items-center justify-center gap-2 hover:border-[#3B82F6]/40 hover:bg-[#3B82F6]/5 transition-all"
            >
              {uploading ? <Loader2 size={22} className="animate-spin text-gray-500" /> : (
                <>
                  <ImageIcon size={22} className="text-gray-600" />
                  <span className="text-gray-500 text-xs">Cliquez pour uploader une photo</span>
                  <span className="text-gray-600 text-[10px]">PNG, JPG — max 5 MB</span>
                </>
              )}
            </button>
          ) : null}
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </div>
```

- [ ] **Step 7: Update the credit-cost display**

Find the credits-info block (lines 405-412):

```tsx
        {/* Credits info */}
        <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <Sparkles size={14} className="text-[#3B82F6]" />
            Coût : 1 crédit IA
          </div>
          <span className="text-white font-semibold">{store?.ai_credits ?? 0} restants</span>
        </div>
```

Change `Coût : 1 crédit IA` to `Coût : 5 crédits IA`:

```tsx
        {/* Credits info */}
        <div className="bg-white/5 rounded-xl p-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-gray-400">
            <Sparkles size={14} className="text-[#3B82F6]" />
            Coût : 5 crédits IA
          </div>
          <span className="text-white font-semibold">{store?.ai_credits ?? 0} restants</span>
        </div>
```

- [ ] **Step 8: Update the `noCredits` guard and generate button**

Line 139 currently reads:

```ts
  const noCredits = (store?.ai_credits ?? 0) <= 0
```

Change to:

```ts
  const noCredits = (store?.ai_credits ?? 0) < 5
```

- [ ] **Step 9: Type-check the whole file**

Run: `npx tsc --noEmit`
Expected: PASS. Common mistakes to check if it fails: the `setGeneratedPage` updater in Step 5 must match `LandingPage`'s shape (it now requires `generated_images: string[]` per Task 2 — spreading `prev` and overriding `generated_images` satisfies that); confirm `getPhotoCount` import path is `@/lib/landing-photos` (Task 3) and `Plan` typing of `store.plan` lines up (it's already typed as `Plan` on the `Store` interface, so `getPhotoCount(store.plan)` needs no cast).

- [ ] **Step 10: Manual verification — full UI flow**

Open `/dashboard/pages/new` in the browser preview (logged in to a store with ≥5 credits):
1. Toggle to "Importer un lien", paste a product URL, click Importer → confirm the image preview populates and (if found) name/price prefill.
2. Toggle back to "Uploader une photo" → confirm the upload dropzone still works as before (regression check on existing upload flow).
3. Fill in product name + price, click "Générer la landing page".
4. Confirm step switches to preview immediately (Phase 1 is fast) and the progress label "Création des photos produit… (k/N)" appears and counts up.
5. Confirm the credits counter in the sidebar drops by 5 (re-check via the dashboard header, not just local state).
6. Wait for all photos to finish; confirm no console errors via the browser dev tools / `preview_console_logs`.

- [ ] **Step 11: Commit**

Skipped (no git repo).

---

### Task 9: Rendering — `LandingPageRenderer.tsx`

**Files:**
- Modify: `src/components/store/LandingPageRenderer.tsx:157-160,315-324`

- [ ] **Step 1: Update the hero image priority chain**

Lines 157-160 currently read:

```tsx
  const product = landingPage.product ?? null
  const heroImage = product?.images?.[0] ?? meta?.imageUrl ?? raw.hero.background_image ?? null
  const comparePrice = product?.compare_price ?? null
  const displayPrice = product?.price ?? meta?.price ?? 0
```

Change the `heroImage` line to prefer the first generated photo:

```tsx
  const product = landingPage.product ?? null
  const heroImage = landingPage.generated_images?.[0] ?? product?.images?.[0] ?? meta?.imageUrl ?? raw.hero.background_image ?? null
  const comparePrice = product?.compare_price ?? null
  const displayPrice = product?.price ?? meta?.price ?? 0
```

- [ ] **Step 2: Replace the dead gallery block with a real one**

Lines 315-324 currently read:

```tsx
        {/* Extra product images */}
        {product && product.images.length > 1 && (
          <div className="flex gap-2 mt-6 justify-center flex-wrap">
            {product.images.slice(1, 5).map((img, i) => (
              <div key={i} className="w-16 h-16 rounded-xl overflow-hidden border-2" style={{ borderColor: border }}>
                <img src={img} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}
```

This block only ever fires for a *linked product* (`product.images`), which AI-generated pages never have (`product_id` is always `null` for them — confirmed in `src/app/api/ai/landing-page/route.ts:70`). Replace it with logic that also (and primarily) sources from `generated_images`, placed where it already sits — between the trust/social bars and the Benefits section — matching the spec's approved placement:

```tsx
        {/* Generated/extra product photos */}
        {(() => {
          const galleryImages = landingPage.generated_images?.length
            ? landingPage.generated_images.slice(1).filter(Boolean)
            : product && product.images.length > 1
              ? product.images.slice(1, 5)
              : []
          if (galleryImages.length === 0) return null
          return (
            <section className="mt-6">
              <h2 className="text-lg font-black mb-3" style={{ color: text, fontFamily: headingFont }}>
                {isRTL ? 'صور المنتج' : 'Galerie produit'}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {galleryImages.map((img, i) => (
                  <div key={i} className="aspect-square rounded-2xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </section>
          )
        })()}
```

Note: `landingPage.generated_images.slice(1)` skips index 0 because that photo is already shown as the hero (Step 1) — showing it twice would be redundant. `.filter(Boolean)` drops any still-empty slots from photos that failed mid-generation (per the spec's partial-failure tolerance).

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If it complains that `landingPage.generated_images` is possibly undefined where you didn't use `?.`, that means Task 2's type change didn't make it optional (it's `generated_images: string[]`, non-optional, matching the migration's `NOT NULL DEFAULT '{}'` — so on already-existing rows fetched before Task 1's migration ran, Supabase will actually return `[]`, not `undefined`; the `?.` calls are defensive but should still compile fine since `string[]` accepts `?.`).

- [ ] **Step 4: Manual verification — gallery renders**

Using the Pro-plan test page from Task 6 Step 5 (which now has at least one entry in `generated_images`), open it on the store (`/store/p/<slug>?store=<store-slug>` per the dev-mode subdomain simulation already established in this project). Confirm:
1. The hero section shows the **generated** photo (index 0), not the original uploaded photo, if they differ.
2. If `generated_images` has more than one entry, a "Galerie produit" section appears with a 2-column grid below the trust bar / before Benefits.
3. For an older landing page with no `generated_images` (created before this feature shipped) and no linked product, confirm the gallery section doesn't render at all (no broken empty grid) and the hero still falls back correctly to `meta.imageUrl`.

- [ ] **Step 5: Commit**

Skipped (no git repo).

---

### Task 10: End-to-end verification (Pro store)

**Files:** none — verification only.

- [ ] **Step 1: Confirm Database/011 has been applied**

Run in Supabase Studio: `SELECT generated_images FROM landing_pages LIMIT 1;` — expect no error (column exists).

- [ ] **Step 2: Full flow on a Pro-plan store**

Using the dashboard, on a store with `plan = 'pro'` and `ai_credits >= 5`:
1. Go to `/dashboard/pages/new`, upload a real product photo, fill in name + price, generate.
2. Confirm the preview step shows the copy instantly, then 3 photo tiles fill in one by one with the progress label counting `1/3`, `2/3`, `3/3`.
3. Click "Publier sur ma boutique".
4. Navigate to `/store?store=<slug>` (or the relevant dev-mode store URL) and confirm the new landing page appears in "🔥 Offres spéciales" with the generated hero photo as its card thumbnail.
5. Click into the page and confirm the hero is the generated photo and the gallery section shows the other 2 generated photos.

- [ ] **Step 3: Confirm credit accounting end-to-end**

Before Step 2: note `ai_credits`. After: confirm it dropped by exactly 5 (not 5 + anything for the 3 photos — photos are included in the 5, per the spec's locked decision).

- [ ] **Step 4: Report results to the user**

Summarize pass/fail for each sub-step above. If anything fails, fix it in the relevant task's file before considering the plan complete — do not leave a known-broken step unresolved.

---

## Self-Review

**Spec coverage:**
- Decisions table (input upload/link, 5 credits, photo counts by plan, image-to-image model, sequential orchestration, photos included in 5 credits) → Tasks 5, 6, 7, 8, 3 all implement these.
- Architecture §1 (`generateProductShot`) → Task 4.
- Architecture §2 (`lib/landing-photos.ts`) → Task 3.
- Architecture §3 (Phase 1 5-credit fix) → Task 5.
- Architecture §4 (Phase 2 photos route) → Task 6.
- Architecture §5 (link import route) → Task 7.
- Architecture §6 (UI changes) → Task 8.
- Architecture §7 (renderer changes) → Task 9.
- Architecture §8 (data model) → Tasks 1, 2.
- Error handling section → covered inline: 402 in Task 5, partial-photo-failure tolerance in Tasks 6 and 8 Step 4 (catch + continue loop), 422 link-import in Task 7, missing-source-image 400 in Task 6.
- Out-of-scope/YAGNI items (parallel generation, retry buttons, queue, in-editor replace) → intentionally not built; no task does this.
- Testing section's 6 expectations → mapped to Task 3 Step 3 (getPhotoCount/buildScenePrompt), Task 5 Step 5 (5-credit deduct/refund), Task 6 Steps 3-4 (ownership + sceneIndex rejection), Task 7 Step 3 (Supabase URL not supplier URL) + Step 4 (422), Task 10 (end-to-end Pro generation).

**Placeholder scan:** no TBD/TODO; every code step has complete, copy-pasteable code; every verification step has an exact expected value.

**Type consistency:** `ProductShotInput`/`ProductShotResult` (Task 4) match the import and usage in Task 6's route. `PhotoScene`, `getPhotoCount(plan: Plan)`, `buildScenePrompt(scene, productName)` (Task 3) match their call sites in Task 6 and Task 8 exactly (same parameter order, same names). `LandingPage.generated_images: string[]` (Task 2) matches every read site (`landingPage.generated_images?.[0]`, `.slice(1)` in Task 9; `landingPage.generated_images` in Task 6's read-then-write) and the migration's column type (Task 1, `text[]`).
