# Landing Page Generation Controls — Design

**Date:** 2026-08-02
**Status:** Approved by user, ready for planning

## Goal

Give merchants more control over AI landing-page generation and post-generation editing, with **zero added AI/API cost** to the platform (in some cases, negative cost). Three parts:

1. At generation time: a short free-text brief, a photo-count stepper, and a new "Ayor" copy style.
2. In the landing-page editor: add/remove photos manually.
3. In the landing-page editor: a section visibility bar to hide non-essential sections (keep only hero + order form if desired).

## Context (as-built, before this change)

- Generation flow: `src/app/(platform)/dashboard/pages/new/page.tsx` → `POST /api/ai/landing-page` (Claude copy, flat 5 credits) → sequential `POST /api/ai/landing-page/photos` per scene (Gemini, free/bundled) up to `getPhotoCount(store.plan)` (`src/lib/landing-photos.ts`: Basic=5, Pro=2, Ultimate+=5).
- Copy "style" today: `minimaliste | impact | premium`, baked into the Claude prompt in `src/lib/claude.ts` as hard-coded FR/AR style briefs. Purely tone — does not change page structure.
- `LandingPageContent` (`src/types/database.ts` lines 229–286) has no field for hiding sections, and no separate "AI instructions" field beyond product description.
- Editor: `src/app/(platform)/dashboard/pages/[id]/page.tsx` has per-section `<Section>` accordions for editing copy, but no visibility toggle and no photo management UI.
- Product photo add/remove pattern already exists (inline, not extracted) in `src/app/(platform)/dashboard/products/[id]/page.tsx` (lines ~70-86, ~204-231): thumbnail grid, hover-delete via `Trash2`, dashed "Ajouter" upload tile, direct-to-Supabase-Storage upload to the `product-images` bucket.
- A prior plan (`docs/superpowers/plans/2026-06-30-ai-product-photo-generation.md`) confirms the existing multi-photo generator was explicitly built "to replicate the ayor.ai experience" — so "Ayor.ai style" in this feature means **copy tone**, not a new layout system.

## Decisions (locked)

1. **Brief field**: new, separate from the existing product-description field. Optional short textarea, label: *"Instructions pour l'IA (optionnel)"*, placeholder example: *"cible les mamans, insiste sur la garantie"*.
2. **Photo count**: stepper/slider from 1 up to `getPhotoCount(store.plan)`, defaulting to the max (unchanged default behavior). User can only dial down, never exceed the existing plan ceiling.
3. **Ayor style**: a 4th option alongside Minimaliste/Impact/Premium in the existing style radio group. UI label: *"Percutant (style Ayor)"*. Implemented as a new hard-coded style brief (FR+AR) in `claude.ts`, same call shape, same token budget, same flat 5-credit price.
4. **Hero always shows**: headline/subheadline/CTA are never hideable. Order form is never hideable. These two are the non-negotiable floor — "just photo + formulaire" is achievable, "blank page" is not.
5. **Toggleable sections**: `benefits`, `social_proof`, `product_details`, `urgency` only.
6. **Scope of section-hiding**: generic `LandingPageRenderer.tsx` only. The 5 niche theme templates (Beauty/Tech/Fitness/Auto/Home `*Landing.tsx`) are unaffected in this pass.
7. **Photo add/remove in editor**: manual upload/delete only, no AI re-generation trigger from the editor (AI regen stays wizard-only, unchanged). Manual uploads are capped at the same plan ceiling (`getPhotoCount(store.plan)`) as AI-generated photos, for a consistent mental model.
8. **Cost**: every change here is cost-neutral or cost-negative to the platform. Nothing adds a new AI call, increases token budget, or bypasses the existing 5-credit flat price / photo-count cap.

## Data model changes

`src/types/database.ts`:

```ts
export interface LandingPageMeta {
  productName?: string
  price?: number
  lang?: 'fr' | 'ar' | 'both'
  imageUrl?: string
  description?: string
  brief?: string          // NEW — client's free-text generation instructions
}

export type LandingPageSectionKey = 'benefits' | 'social_proof' | 'product_details' | 'urgency' // NEW

export interface LandingPageContent extends LandingPageCoreContent {
  _ar?: LandingPageCoreContent
  _meta?: LandingPageMeta
  hidden_sections?: LandingPageSectionKey[]   // NEW — top-level, shared across fr/ar, not duplicated inside _ar
}
```

No new DB columns — `hidden_sections` lives inside the existing `content` JSONB column. `generated_images` (existing `landing_pages` column) is reused as-is for the photo editor; no schema migration needed.

## API changes

- `POST /api/ai/landing-page`: accepts new optional body fields `brief?: string` and `photoCount?: number`. `brief` is folded into the Claude user prompt ("Instructions supplémentaires du client: ...") and persisted to `content._meta.brief`. `style` union type gains `'ayor'`.
- `POST /api/ai/landing-page/photos`: no change to the endpoint contract; the client-side generation loop in `pages/new/page.tsx` now iterates to `min(photoCount, getPhotoCount(plan))` instead of always `getPhotoCount(plan)`.
- No changes needed to credit deduction logic — still flat 5 credits per page, still free per-photo.

## UI changes

### `dashboard/pages/new/page.tsx` (creation wizard)
- Add brief textarea (optional) near the existing description field.
- Add photo-count stepper near the style picker, bounded `[1, getPhotoCount(store.plan)]`, default = max.
- Add "Percutant (style Ayor)" as a 4th style radio card.

### `dashboard/pages/[id]/page.tsx` (editor)
- New **section visibility bar**: 4 toggle pills (Avantages / Preuves sociales / Détails produit / Urgence) near the top of the editor. Toggling off adds the key to `content.hidden_sections`; the corresponding `<Section>` card below gets a "Section masquée" badge and dims, but stays editable. Saved via the existing `persist()` call (already writes the full `content` object — no new save-path needed).
- New **Photos** card, placed before the Hero section: thumbnail grid of `generated_images`, hover-delete (`Trash2`, same as product editor), dashed "Ajouter" tile for manual upload to `product-images/{storeId}/landing-photos/{slug}/`. Cap enforced client-side (disable "Ajouter" at cap) and should also be enforced server-side on save to prevent a raised cap via direct API calls.

### `LandingPageRenderer.tsx`
- Each conditionally-rendered block (benefits, social proof, product details, urgency) gets an added `&& !content.hidden_sections?.includes('<key>')` guard alongside its existing content-presence check.

## Out of scope (explicitly, per user confirmation)

- Extending section-hiding to the 5 niche theme templates.
- AI re-generation of a specific photo scene from the post-publish editor (stays wizard-only).
- Any change to credit cost, photo-count ceilings, or the flat 5-credit page price.
- New FAQ section type (not requested; `LandingPageContent` has no FAQ field today and this doesn't add one).

## Testing notes

- Verify `hidden_sections` round-trips through save/load in the editor without affecting `_ar` content.
- Verify photo-count stepper never allows a value above `getPhotoCount(store.plan)` even via direct API call (server-side clamp in the generation route, not just client UI).
- Verify manual photo upload cap is enforced server-side on editor save, not just via the disabled "Ajouter" button.
- Verify a landing page with all 4 optional sections hidden still renders hero + order form correctly (no blank gaps, no broken spacing in `LandingPageRenderer.tsx`).
- Verify existing landing pages (no `hidden_sections`, no `brief`) continue to render/generate exactly as before (backward compatible, all new fields optional).
