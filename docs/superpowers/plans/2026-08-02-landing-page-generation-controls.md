# Landing Page Generation Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give merchants a free-text generation brief, a photo-count stepper, a 4th "Ayor" copy style, a section-visibility toggle bar in the landing-page editor, and manual photo add/remove — all without adding any new AI API call or increasing token/credit cost.

**Architecture:** Additive changes only. Two pieces of new logic are pure/testable and get unit tests following this repo's existing convention (colocated `*.test.ts`, vitest, no React component testing library is set up so UI components are verified manually via the dev server, matching the zero existing coverage on every other page/component file in `src/app/(platform)/dashboard/pages/**` and `src/components/store/**`): (1) a new `isSectionVisible` helper, (2) the `brief` field threading through `/api/ai/landing-page`. Everything else (prompt text, wizard UI, editor UI, renderer JSX) is additive to already-untested files and is verified by hand in the browser preview.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind CSS (dash-* tokens), Supabase, Vitest, `@anthropic-ai/sdk` (`claude-sonnet-4-6`, unchanged).

**Spec:** `docs/superpowers/specs/2026-08-02-landing-page-generation-controls-design.md`

**Note on one deviation from the spec:** the spec's testing notes call for a "server-side clamp" on photo count and a "server-side cap" on manual photo uploads. Neither needs new server code: the photos endpoint (`/api/ai/landing-page/photos/route.ts`) already rejects any `sceneIndex >= getPhotoCount(plan)` server-side (pre-existing code, untouched by this plan), so the photo-count stepper can never exceed the real cap regardless of what the client sends — it's purely a client-side loop-bound UI control, not a new request parameter. Manual photo uploads in the editor are capped client-side only, matching the existing product-photo editor (`src/app/(platform)/dashboard/products/[id]/page.tsx`), which has no cap or server enforcement at all today — photos cost storage, not AI credits, so this is consistent with existing precedent, not a new risk.

---

### Task 1: Data model — add `brief` and `hidden_sections`

**Files:**
- Modify: `src/types/database.ts:266-286`

- [ ] **Step 1: Edit the types**

Replace:

```ts
export interface LandingPageMeta {
  productName?: string
  price?: number
  lang?: 'fr' | 'ar' | 'both'
  imageUrl?: string
  description?: string
}

export type LandingPageCoreContent = {
  hero: LandingPageHero
  benefits: LandingPageBenefit[]
  social_proof: LandingPageSocialProof
  product_details: { sections: LandingPageDetailSection[] }
  urgency: LandingPageUrgency
  order_form: { title: string }
}

export interface LandingPageContent extends LandingPageCoreContent {
  _ar?: LandingPageCoreContent
  _meta?: LandingPageMeta
}
```

With:

```ts
export interface LandingPageMeta {
  productName?: string
  price?: number
  lang?: 'fr' | 'ar' | 'both'
  imageUrl?: string
  description?: string
  brief?: string
}

export type LandingPageCoreContent = {
  hero: LandingPageHero
  benefits: LandingPageBenefit[]
  social_proof: LandingPageSocialProof
  product_details: { sections: LandingPageDetailSection[] }
  urgency: LandingPageUrgency
  order_form: { title: string }
}

// Sections a merchant can hide from the public page. Hero and order_form are
// intentionally excluded — they're the non-negotiable floor (see landing-sections.ts).
export type LandingPageSectionKey = 'benefits' | 'social_proof' | 'product_details' | 'urgency'

export interface LandingPageContent extends LandingPageCoreContent {
  _ar?: LandingPageCoreContent
  _meta?: LandingPageMeta
  hidden_sections?: LandingPageSectionKey[]
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (both new fields are optional, so every existing call site stays valid).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat: add brief and hidden_sections fields to LandingPageContent"
```

---

### Task 2: `isSectionVisible` helper + test

**Files:**
- Create: `src/lib/landing-sections.ts`
- Test: `src/lib/landing-sections.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/landing-sections.test.ts
import { describe, it, expect } from 'vitest'
import { isSectionVisible } from './landing-sections'
import type { LandingPageContent } from '@/types/database'

const BASE_CONTENT: LandingPageContent = {
  hero: { headline: '', subheadline: '', cta_text: '' },
  benefits: [],
  social_proof: { review_count: '', rating: '', testimonials: [] },
  product_details: { sections: [] },
  urgency: { type: 'stock', text: '' },
  order_form: { title: '' },
}

describe('isSectionVisible', () => {
  it('is visible when hidden_sections is undefined', () => {
    expect(isSectionVisible(BASE_CONTENT, 'benefits')).toBe(true)
  })

  it('is visible when hidden_sections does not include the key', () => {
    const content = { ...BASE_CONTENT, hidden_sections: ['urgency'] as const }
    expect(isSectionVisible(content, 'benefits')).toBe(true)
  })

  it('is hidden when hidden_sections includes the key', () => {
    const content = { ...BASE_CONTENT, hidden_sections: ['benefits'] as const }
    expect(isSectionVisible(content, 'benefits')).toBe(false)
  })

  it('checks each key independently', () => {
    const content = { ...BASE_CONTENT, hidden_sections: ['benefits', 'urgency'] as const }
    expect(isSectionVisible(content, 'social_proof')).toBe(true)
    expect(isSectionVisible(content, 'product_details')).toBe(true)
    expect(isSectionVisible(content, 'urgency')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/landing-sections.test.ts`
Expected: FAIL — `Cannot find module './landing-sections'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/landing-sections.ts
import type { LandingPageContent, LandingPageSectionKey } from '@/types/database'

export function isSectionVisible(content: LandingPageContent, key: LandingPageSectionKey): boolean {
  return !content.hidden_sections?.includes(key)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/landing-sections.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/landing-sections.ts src/lib/landing-sections.test.ts
git commit -m "feat: add isSectionVisible helper for landing page section toggles"
```

---

### Task 3: Claude prompt — `brief` param + "Ayor" style

**Files:**
- Modify: `src/lib/claude.ts`

- [ ] **Step 1: Add the `ayor` style to the type union**

Replace:

```ts
export type LandingPageStyle = 'minimaliste' | 'impact' | 'premium'
```

With:

```ts
export type LandingPageStyle = 'minimaliste' | 'impact' | 'premium' | 'ayor'
```

- [ ] **Step 2: Add `brief` to the params interface**

Replace:

```ts
export interface GenerateLandingPageParams {
  productName: string
  price: number
  description?: string | null
  imageUrl?: string | null
  style: LandingPageStyle
  language?: LandingPageLanguage
  storeSettings?: { whatsapp?: string }
}
```

With:

```ts
export interface GenerateLandingPageParams {
  productName: string
  price: number
  description?: string | null
  imageUrl?: string | null
  style: LandingPageStyle
  language?: LandingPageLanguage
  storeSettings?: { whatsapp?: string }
  brief?: string | null
}
```

- [ ] **Step 3: Destructure `brief` in the function signature**

Replace:

```ts
export async function generateLandingPage({
  productName,
  price,
  description,
  imageUrl,
  style,
  language = 'fr',
}: GenerateLandingPageParams): Promise<LandingPageContent> {
```

With:

```ts
export async function generateLandingPage({
  productName,
  price,
  description,
  imageUrl,
  style,
  language = 'fr',
  brief,
}: GenerateLandingPageParams): Promise<LandingPageContent> {
```

- [ ] **Step 4: Add the `ayor` style brief (FR)**

In the `styleInstructions` object, after the `premium` entry, add a `ayor` key (note the trailing comma after `premium`'s closing string must be added):

```ts
  const styleInstructions = {
    minimaliste:
      "MINIMALISTE — épuré, confiant, sans emphase. Titre court et déclaratif (pas de point d'exclamation, pas de superlatif). " +
      "Le produit parle de lui-même, pas besoin de le crier. Bénéfices formulés comme des faits simples, pas des promesses exagérées. " +
      "Témoignages brefs et sobres (une phrase, factuelle). Urgence discrète ou absente — jamais de compte à rebours dramatique. " +
      "À ÉVITER: exclamations, majuscules pour l'emphase, mots comme 'incroyable', 'exceptionnel', 'urgent', 'dernière chance'.",
    impact:
      "IMPACT — percutant, énergique, orienté action immédiate. Titre avec verbe d'action fort, peut inclure une exclamation. " +
      "Bénéfices formulés comme des transformations concrètes et immédiates. Urgence explicite et crédible (stock limité, forte demande). " +
      "Témoignages enthousiastes, avec une émotion palpable. CTA impératif et direct ('Commandez maintenant', 'Ne ratez pas'). " +
      "À ÉVITER: ton calme ou hésitant, phrases longues et posées, vocabulaire sophistiqué/littéraire.",
    premium:
      "PREMIUM — raffiné, exclusif, vocabulaire soigné. Titre évoquant le savoir-faire, la qualité ou l'exclusivité, sans urgence ni rabais. " +
      "Bénéfices centrés sur la qualité, les matériaux, l'expérience — jamais sur le prix ou la rapidité. Aucune urgence artificielle: la rareté est " +
      "suggérée par l'exclusivité, pas par un compte à rebours. Témoignages articulés, ton aspirationnel ('une expérience différente'). " +
      "À ÉVITER: points d'exclamation, mots comme 'urgent'/'stock limité'/'promo', ton familier ou trop enthousiaste.",
    ayor:
      "AYOR — percutant façon page de vente virale, direct et sans détour, avec une forte pression à l'achat. Titre choc qui interpelle " +
      "immédiatement un problème ou un désir. Bénéfices formulés comme des résultats spectaculaires et immédiats, ton familier et énergique. " +
      "Urgence omniprésente et appuyée (le stock s'épuise vite, forte demande, l'offre peut disparaître). Témoignages très enthousiastes, " +
      "quasi excités. CTA pressant ('Profitez-en avant qu'il ne soit trop tard'). " +
      "À ÉVITER: ton posé, vocabulaire soutenu, phrases longues, retenue.",
  }
```

- [ ] **Step 5: Add the `ayor` style brief (AR)**

In the `styleAR` object, after the `premium` entry:

```ts
  const styleAR = {
    minimaliste:
      "أسلوب أنيق ومبسط — واثق وبلا مبالغة. عنوان قصير وتقريري (بدون علامة تعجب، بدون صيغة تفضيل مبالغ فيها). " +
      "المزايا تُصاغ كحقائق بسيطة، لا كوعود مبالغ فيها. آراء العملاء قصيرة وموضوعية (جملة واحدة). الإلحاح غائب أو خفيف جداً. " +
      "تجنب: علامات التعجب، كلمات مثل 'مذهل'، 'استثنائي'، 'عاجل'، 'الفرصة الأخيرة'.",
    impact:
      "أسلوب ديناميكي وجذاب — طاقة عالية ودعوة فورية للعمل. العنوان يحتوي فعل أمر قوي، يمكن أن يتضمن علامة تعجب. " +
      "المزايا تُصاغ كتحول ملموس وفوري. إلحاح صريح وموثوق (كمية محدودة، طلب كبير). آراء العملاء حماسية بمشاعر واضحة. " +
      "تجنب: نبرة هادئة أو متحفظة، جمل طويلة، مفردات أدبية معقدة.",
    premium:
      "أسلوب فاخر وراقي — مفردات منتقاة، حصرية بلا إلحاح أو تخفيضات. العنوان يوحي بالحرفية والجودة، بلا استعجال. " +
      "المزايا تركز على الجودة والخامات والتجربة، أبداً على السعر أو السرعة. لا إلحاح مصطنع. آراء العملاء معبّرة بنبرة طموحة. " +
      "تجنب: علامات التعجب، كلمات مثل 'عاجل'/'كمية محدودة'/'تخفيض'، نبرة عامية أو مفرطة الحماس.",
    ayor:
      "أسلوب Ayor — مباشر وقوي على طريقة صفحات البيع الفيروسية، بلا مقدمات وبضغط شرائي عالٍ. عنوان صادم يخاطب المشكلة أو الرغبة فوراً. " +
      "المزايا تُصاغ كنتائج مذهلة وفورية، بنبرة عفوية وحماسية. إلحاح دائم وقوي (الكمية تنفد، طلب كبير، عرض قد يختفي). " +
      "آراء عملاء حماسية جداً. دعوة ملحة للفعل. " +
      "تجنب: نبرة رسمية، مفردات أدبية، جمل طويلة، تحفظ.",
  }
```

- [ ] **Step 6: Thread `brief` into the bilingual prompt**

Replace:

```ts
    const userPrompt = `Génère une page produit BILINGUE (français ET arabe) pour:

PRODUIT: ${productName}
DESCRIPTION: ${description || 'Déduis-la du contexte'}
PRIX: ${price} DZD
STYLE FR: ${styleInstructions[style]}
STYLE AR: ${styleAR[style]}
IMPORTANT: le style doit être reconnaissable dans CHAQUE section (titre, bénéfices, témoignages, urgence) — pas seulement le titre. Quelqu'un qui lit uniquement le titre doit pouvoir deviner le style choisi.
${imageBlock ? '\nUne image du produit est fournie. Analyse-la pour enrichir les deux versions.' : ''}

Retourne exactement ce JSON:
{
  "fr": ${JSON_STRUCTURE_FR},
  "ar": ${JSON_STRUCTURE_AR}
}`
```

With:

```ts
    const userPrompt = `Génère une page produit BILINGUE (français ET arabe) pour:

PRODUIT: ${productName}
DESCRIPTION: ${description || 'Déduis-la du contexte'}
PRIX: ${price} DZD
STYLE FR: ${styleInstructions[style]}
STYLE AR: ${styleAR[style]}
IMPORTANT: le style doit être reconnaissable dans CHAQUE section (titre, bénéfices, témoignages, urgence) — pas seulement le titre. Quelqu'un qui lit uniquement le titre doit pouvoir deviner le style choisi.
${imageBlock ? '\nUne image du produit est fournie. Analyse-la pour enrichir les deux versions.' : ''}
${brief ? `\nINSTRUCTIONS SUPPLÉMENTAIRES DU CLIENT: ${brief}` : ''}

Retourne exactement ce JSON:
{
  "fr": ${JSON_STRUCTURE_FR},
  "ar": ${JSON_STRUCTURE_AR}
}`
```

- [ ] **Step 7: Thread `brief` into the single-language prompts**

Replace:

```ts
  const promptText = isAr
    ? `اكتب صفحة منتج كاملة لـ:

المنتج: ${productName}
الوصف: ${description || 'استنتجه من السياق والصورة إن وُجدت'}
السعر: ${price} دج
أسلوب الصفحة: ${styleAR[style]}
مهم: يجب أن يظهر الأسلوب في كل قسم (العنوان، المزايا، آراء العملاء، الإلحاح) — ليس فقط العنوان. من يقرأ العنوان فقط يجب أن يتمكن من تخمين الأسلوب المختار.
${imageBlock ? '\nتم تقديم صورة المنتج. حللها لإثراء الوصف.' : ''}

أعد هذا JSON بالضبط (استبدل جميع القيم):
${JSON_STRUCTURE_AR}`
    : `Génère une page produit complète pour:

PRODUIT: ${productName}
DESCRIPTION: ${description || "Non fournie — déduis-la du contexte et de l'image si disponible"}
PRIX: ${price} DZD
STYLE DE PAGE: ${styleInstructions[style]}
IMPORTANT: le style doit être reconnaissable dans CHAQUE section (titre, bénéfices, témoignages, urgence) — pas seulement le titre. Quelqu'un qui lit uniquement le titre doit pouvoir deviner le style choisi.
${imageBlock ? '\nUne image du produit est fournie. Analyse-la pour enrichir la description.' : ''}

Retourne ce JSON exactement (remplace toutes les valeurs):
${JSON_STRUCTURE_FR}`
```

With:

```ts
  const promptText = isAr
    ? `اكتب صفحة منتج كاملة لـ:

المنتج: ${productName}
الوصف: ${description || 'استنتجه من السياق والصورة إن وُجدت'}
السعر: ${price} دج
أسلوب الصفحة: ${styleAR[style]}
مهم: يجب أن يظهر الأسلوب في كل قسم (العنوان، المزايا، آراء العملاء، الإلحاح) — ليس فقط العنوان. من يقرأ العنوان فقط يجب أن يتمكن من تخمين الأسلوب المختار.
${imageBlock ? '\nتم تقديم صورة المنتج. حللها لإثراء الوصف.' : ''}
${brief ? `\nتعليمات إضافية من العميل: ${brief}` : ''}

أعد هذا JSON بالضبط (استبدل جميع القيم):
${JSON_STRUCTURE_AR}`
    : `Génère une page produit complète pour:

PRODUIT: ${productName}
DESCRIPTION: ${description || "Non fournie — déduis-la du contexte et de l'image si disponible"}
PRIX: ${price} DZD
STYLE DE PAGE: ${styleInstructions[style]}
IMPORTANT: le style doit être reconnaissable dans CHAQUE section (titre, bénéfices, témoignages, urgence) — pas seulement le titre. Quelqu'un qui lit uniquement le titre doit pouvoir deviner le style choisi.
${imageBlock ? '\nUne image du produit est fournie. Analyse-la pour enrichir la description.' : ''}
${brief ? `\nINSTRUCTIONS SUPPLÉMENTAIRES DU CLIENT: ${brief}` : ''}

Retourne ce JSON exactement (remplace toutes les valeurs):
${JSON_STRUCTURE_FR}`
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat: add Ayor copy style and client brief to landing page prompt"
```

---

### Task 4: API route — accept and persist `brief`

**Files:**
- Modify: `src/app/api/ai/landing-page/route.ts`
- Test: `src/app/api/ai/landing-page/route.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/app/api/ai/landing-page/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const insertedLandingPages: Record<string, unknown>[] = []
const generateLandingPageCalls: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from(table: string) {
      if (table === 'landing_pages') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedLandingPages.push(payload)
            return {
              select: () => ({
                single: async () => ({ data: { id: 'lp-1', ...payload }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'credit_usage') {
        return { insert: async () => ({ error: null }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => ({ id: 'store-1', settings: {} }),
  resolveAccountStore: async () => ({ id: 'account-1', ai_credits: 20, purchased_credits: 0 }),
}))

vi.mock('@/lib/credits', () => ({
  spendAccountCredits: async () => true,
  refundAccountCredits: async () => {},
}))

vi.mock('@/lib/claude', () => ({
  generateLandingPage: vi.fn(async (params: Record<string, unknown>) => {
    generateLandingPageCalls.push(params)
    return {
      hero: { headline: 'Titre', subheadline: 'Sous-titre', cta_text: 'Commander' },
      benefits: [],
      social_proof: { review_count: '0', rating: '5', testimonials: [] },
      product_details: { sections: [] },
      urgency: { type: 'stock', text: '' },
      order_form: { title: 'Commander' },
    }
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/ai/landing-page', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = {
  productName: 'Montre connectée',
  price: 2990,
  stock: 10,
  style: 'impact',
  language: 'fr',
}

beforeEach(() => {
  insertedLandingPages.length = 0
  generateLandingPageCalls.length = 0
})

describe('POST /api/ai/landing-page — brief threading', () => {
  it('passes the brief through to generateLandingPage and stores it in content._meta', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, brief: 'cible les mamans' }))
    expect(res.status).toBe(200)
    expect(generateLandingPageCalls[0]).toMatchObject({ brief: 'cible les mamans' })
    const inserted = insertedLandingPages[0]
    const content = inserted.content as { _meta?: { brief?: string } }
    expect(content._meta?.brief).toBe('cible les mamans')
  })

  it('passes null and stores no brief when omitted', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(generateLandingPageCalls[0]).toMatchObject({ brief: null })
    const inserted = insertedLandingPages[0]
    const content = inserted.content as { _meta?: { brief?: string } }
    expect(content._meta?.brief).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/ai/landing-page/route.test.ts`
Expected: FAIL — `generateLandingPageCalls[0]` does not match `{ brief: 'cible les mamans' }` (route doesn't read/pass `brief` yet).

- [ ] **Step 3: Edit the route**

Replace:

```ts
    const { productName, price, stock, description, imageUrl, style, language } = await request.json()
```

With:

```ts
    const { productName, price, stock, description, imageUrl, style, language, brief } = await request.json()
```

Replace:

```ts
    let content: LandingPageContent
    try {
      content = await generateLandingPage({
        productName,
        price: Number(price),
        description: description || null,
        imageUrl: imageUrl || null,
        style: style as LandingPageStyle,
        language: (language as LandingPageLanguage) || 'fr',
        storeSettings: store.settings,
      })
```

With:

```ts
    let content: LandingPageContent
    try {
      content = await generateLandingPage({
        productName,
        price: Number(price),
        description: description || null,
        imageUrl: imageUrl || null,
        style: style as LandingPageStyle,
        language: (language as LandingPageLanguage) || 'fr',
        storeSettings: store.settings,
        brief: brief || null,
      })
```

Replace:

```ts
        content: {
          ...content,
          hero: { ...content.hero, background_image: imageUrl || undefined },
          _meta: {
            productName,
            price: Number(price),
            lang: (language as LandingPageLanguage) || 'fr',
            imageUrl: imageUrl || undefined,
            description: description || undefined,
          },
        },
```

With:

```ts
        content: {
          ...content,
          hero: { ...content.hero, background_image: imageUrl || undefined },
          _meta: {
            productName,
            price: Number(price),
            lang: (language as LandingPageLanguage) || 'fr',
            imageUrl: imageUrl || undefined,
            description: description || undefined,
            brief: brief || undefined,
          },
        },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/ai/landing-page/route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full test suite to check for regressions**

Run: `npm run test`
Expected: PASS — no existing test broken.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/ai/landing-page/route.ts src/app/api/ai/landing-page/route.test.ts
git commit -m "feat: thread client brief through the landing page generation API"
```

---

### Task 5: Wizard UI — brief field, photo-count stepper, Ayor style card

**Files:**
- Modify: `src/app/(platform)/dashboard/pages/new/page.tsx`

- [ ] **Step 1: Add the Ayor style option**

Replace:

```ts
const STYLES = [
  { id: 'minimaliste', label: 'Minimaliste', desc: 'Épuré et élégant' },
  { id: 'impact',      label: 'Impact',      desc: 'Dynamique, fort' },
  { id: 'premium',     label: 'Premium',     desc: 'Luxueux, raffiné' },
]
```

With:

```ts
const STYLES = [
  { id: 'minimaliste', label: 'Minimaliste',      desc: 'Épuré et élégant' },
  { id: 'impact',      label: 'Impact',           desc: 'Dynamique, fort' },
  { id: 'premium',     label: 'Premium',          desc: 'Luxueux, raffiné' },
  { id: 'ayor',        label: 'Percutant (Ayor)', desc: 'Direct, viral, urgence forte' },
]
```

- [ ] **Step 2: Add `brief` and `photoCount` state**

Replace:

```ts
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
```

With:

```ts
  const [description, setDescription] = useState('')
  const [brief, setBrief] = useState('')
  const [photoCount, setPhotoCount] = useState(5)
  const [imageUrl, setImageUrl] = useState('')
```

- [ ] **Step 3: Default `photoCount` to the plan's max once the store loads**

Replace:

```ts
      const pooled = ((primary?.ai_credits as number | undefined) ?? storeData.ai_credits ?? 0)
        + ((primary?.purchased_credits as number | undefined) ?? 0)
      setStore({ ...storeData, ai_credits: pooled })
    })
  }, [router])
```

With:

```ts
      const pooled = ((primary?.ai_credits as number | undefined) ?? storeData.ai_credits ?? 0)
        + ((primary?.purchased_credits as number | undefined) ?? 0)
      setStore({ ...storeData, ai_credits: pooled })
      setPhotoCount(getPhotoCount(storeData.plan))
    })
  }, [router])
```

- [ ] **Step 4: Send `brief` in the generation request**

Replace:

```ts
      body: JSON.stringify({
        productName: productName.trim(),
        price: Number(price),
        stock: Number(stock),
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        style: selectedStyle,
        language: selectedLang,
      }),
```

With:

```ts
      body: JSON.stringify({
        productName: productName.trim(),
        price: Number(price),
        stock: Number(stock),
        description: description.trim() || null,
        imageUrl: imageUrl || null,
        style: selectedStyle,
        language: selectedLang,
        brief: brief.trim() || null,
      }),
```

- [ ] **Step 5: Bound the photo-generation loop by the chosen count**

Replace:

```ts
    if (store) {
      const targetPageId = (landingPage as LandingPage).id
      const planPhotoCount = getPhotoCount(store.plan)
      setPhotosTotal(planPhotoCount)
      setPhotosDone(0)
      setFailedScenes([])
      setPhotoError('')
      for (let sceneIndex = 0; sceneIndex < planPhotoCount; sceneIndex++) {
        // Awaited sequentially — never concurrent (see generatePhoto contract)
        await generatePhoto(sceneIndex, targetPageId)
        setPhotosDone(sceneIndex + 1)
      }
    }
```

With:

```ts
    if (store) {
      const targetPageId = (landingPage as LandingPage).id
      // Defensive clamp: photoCount is already bounded by the stepper's max, but
      // the real cap is enforced server-side too — /api/ai/landing-page/photos
      // rejects any sceneIndex >= getPhotoCount(plan) regardless of this value.
      const targetPhotoCount = Math.min(photoCount, getPhotoCount(store.plan))
      setPhotosTotal(targetPhotoCount)
      setPhotosDone(0)
      setFailedScenes([])
      setPhotoError('')
      for (let sceneIndex = 0; sceneIndex < targetPhotoCount; sceneIndex++) {
        // Awaited sequentially — never concurrent (see generatePhoto contract)
        await generatePhoto(sceneIndex, targetPageId)
        setPhotosDone(sceneIndex + 1)
      }
    }
```

- [ ] **Step 6: Add the brief textarea (after the Description field, before Style)**

Replace:

```ts
        {/* Style */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Style de page</label>
          <div className="grid grid-cols-3 gap-2">
```

With:

```ts
        {/* Brief / AI instructions */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
            Instructions pour l&apos;IA <span className="text-dash-ink-faint normal-case">(optionnel)</span>
          </label>
          <textarea
            value={brief}
            onChange={e => setBrief(e.target.value)}
            rows={2}
            placeholder="Ex: cible les mamans, insiste sur la garantie…"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none"
          />
        </div>

        {/* Style */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Style de page</label>
          <div className="grid grid-cols-2 gap-2">
```

Note the trailing `</div>` for the style grid still closes correctly — only the opening `grid-cols-3` → `grid-cols-2` class changed to fit 4 cards as 2×2.

- [ ] **Step 7: Add the photo-count stepper (after Style, before Language)**

Replace:

```ts
        {/* Language */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Langue de la page</label>
```

With:

```ts
        {/* Photo count */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Nombre de photos générées</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPhotoCount(n => Math.max(1, n - 1))}
              disabled={photoCount <= 1}
              className="w-9 h-9 rounded-xl border border-dash-border text-dash-ink-soft disabled:opacity-40 hover:border-dash-ink-faint/40 transition-all"
            >
              −
            </button>
            <span className="text-dash-ink font-semibold text-sm w-6 text-center">{photoCount}</span>
            <button
              onClick={() => setPhotoCount(n => Math.min(getPhotoCount(store?.plan ?? 'basic'), n + 1))}
              disabled={photoCount >= getPhotoCount(store?.plan ?? 'basic')}
              className="w-9 h-9 rounded-xl border border-dash-border text-dash-ink-soft disabled:opacity-40 hover:border-dash-ink-faint/40 transition-all"
            >
              +
            </button>
            <span className="text-dash-ink-faint text-xs">sur {getPhotoCount(store?.plan ?? 'basic')} inclus dans votre plan</span>
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Langue de la page</label>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Manual verification**

Start the dev server (`preview_start` with the project's dev config, or `npm run dev`), navigate to `/dashboard/pages/new`:
- Confirm the "Instructions pour l'IA" textarea appears between Description and Style.
- Confirm 4 style cards render in a 2×2 grid, including "Percutant (Ayor)".
- Confirm the photo stepper shows the plan's max by default, `−` disables at 1, `+` disables at the plan max.
- Generate a page with a brief filled in and confirm it completes without error (costs 5 real credits on whatever store you test with — use a test/demo store).

- [ ] **Step 10: Commit**

```bash
git add "src/app/(platform)/dashboard/pages/new/page.tsx"
git commit -m "feat: add brief field, photo-count stepper and Ayor style to the generator wizard"
```

---

### Task 6: `LandingPageRenderer.tsx` — respect `hidden_sections`

**Files:**
- Modify: `src/components/store/LandingPageRenderer.tsx`

- [ ] **Step 1: Import the helper**

Replace:

```ts
import type { LandingPage, Store, LandingPageCoreContent } from '@/types/database'
```

With:

```ts
import type { LandingPage, Store, LandingPageCoreContent } from '@/types/database'
import { isSectionVisible } from '@/lib/landing-sections'
```

- [ ] **Step 2: Gate the urgency badge in the hero**

Replace:

```ts
          {/* Urgency badge */}
          {c.urgency && (
```

With:

```ts
          {/* Urgency badge */}
          {c.urgency && isSectionVisible(raw, 'urgency') && (
```

- [ ] **Step 3: Gate the countdown timer**

Replace:

```ts
        {/* Pro: countdown timer */}
        {isPro && c.urgency && (
```

With:

```ts
        {/* Pro: countdown timer */}
        {isPro && c.urgency && isSectionVisible(raw, 'urgency') && (
```

- [ ] **Step 4: Gate the social proof summary bar**

Replace:

```ts
        {/* Social proof bar */}
        <div className="mt-6 py-4 px-5 rounded-2xl flex items-center justify-between"
          style={{ background: card, border: `1px solid ${border}` }}>
          <div className="text-center">
            <p className="font-black text-xl" style={{ color: primary }}>{c.social_proof.rating}</p>
            <p className="text-xs" style={{ color: textMuted }}>{isRTL ? 'التقييم' : 'Note'}</p>
          </div>
          <div className="w-px h-8" style={{ background: border }} />
          <div className="text-center">
            <p className="font-black text-base" style={{ color: text }}>{c.social_proof.review_count}</p>
            <p className="text-xs" style={{ color: textMuted }}>{isRTL ? 'تقييم' : 'Avis'}</p>
          </div>
          <div className="w-px h-8" style={{ background: border }} />
          <div className="flex flex-col items-center gap-1">
            <StarRating rating={5} />
            <p className="text-xs" style={{ color: textMuted }}>{isRTL ? 'عملاء راضون' : 'Clients satisfaits'}</p>
          </div>
        </div>
```

With:

```ts
        {/* Social proof bar */}
        {isSectionVisible(raw, 'social_proof') && (
          <div className="mt-6 py-4 px-5 rounded-2xl flex items-center justify-between"
            style={{ background: card, border: `1px solid ${border}` }}>
            <div className="text-center">
              <p className="font-black text-xl" style={{ color: primary }}>{c.social_proof.rating}</p>
              <p className="text-xs" style={{ color: textMuted }}>{isRTL ? 'التقييم' : 'Note'}</p>
            </div>
            <div className="w-px h-8" style={{ background: border }} />
            <div className="text-center">
              <p className="font-black text-base" style={{ color: text }}>{c.social_proof.review_count}</p>
              <p className="text-xs" style={{ color: textMuted }}>{isRTL ? 'تقييم' : 'Avis'}</p>
            </div>
            <div className="w-px h-8" style={{ background: border }} />
            <div className="flex flex-col items-center gap-1">
              <StarRating rating={5} />
              <p className="text-xs" style={{ color: textMuted }}>{isRTL ? 'عملاء راضون' : 'Clients satisfaits'}</p>
            </div>
          </div>
        )}
```

- [ ] **Step 5: Gate the benefits section**

Replace:

```ts
        {/* Benefits */}
        <section className="mt-8 mb-6">
          <div className="grid grid-cols-1 gap-3">
            {c.benefits.map((benefit, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-2xl"
                style={{ background: card, border: `1px solid ${border}` }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${primary}15`, color: primary }}>
                  {ICON_MAP[benefit.icon] ?? <Zap size={20} />}
                </div>
                <div>
                  <p className="font-bold text-sm mb-1" style={{ color: text, fontFamily: headingFont }}>
                    {benefit.title}
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: textMuted }}>
                    {benefit.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
```

With:

```ts
        {/* Benefits */}
        {isSectionVisible(raw, 'benefits') && (
          <section className="mt-8 mb-6">
            <div className="grid grid-cols-1 gap-3">
              {c.benefits.map((benefit, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-2xl"
                  style={{ background: card, border: `1px solid ${border}` }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: `${primary}15`, color: primary }}>
                    {ICON_MAP[benefit.icon] ?? <Zap size={20} />}
                  </div>
                  <div>
                    <p className="font-bold text-sm mb-1" style={{ color: text, fontFamily: headingFont }}>
                      {benefit.title}
                    </p>
                    <p className="text-xs leading-relaxed" style={{ color: textMuted }}>
                      {benefit.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
```

- [ ] **Step 6: Gate the product details accordion**

Replace:

```ts
        {/* Product details accordion */}
        {c.product_details.sections.length > 0 && (
```

With:

```ts
        {/* Product details accordion */}
        {c.product_details.sections.length > 0 && isSectionVisible(raw, 'product_details') && (
```

- [ ] **Step 7: Gate the testimonials section**

Replace:

```ts
        {/* Testimonials */}
        <section className="mb-8">
          <h2 className="text-xl font-black mb-4" style={{ color: text, fontFamily: headingFont }}>
            {isRTL ? 'ماذا يقول عملاؤنا' : 'Ce que disent nos clients'}
          </h2>
          <div className="space-y-3">
            {c.social_proof.testimonials.map((t, i) => (
              <div key={i} className="p-4 rounded-2xl" style={{ background: card, border: `1px solid ${border}` }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="font-bold text-sm" style={{ color: text }}>{t.name}</p>
                    <p className="text-xs" style={{ color: textMuted }}>{t.location}</p>
                  </div>
                  <StarRating rating={t.rating} />
                </div>
                <p className="text-sm leading-relaxed" style={{ color: textMuted }}>{t.text}</p>
              </div>
            ))}
          </div>
        </section>
```

With:

```ts
        {/* Testimonials */}
        {isSectionVisible(raw, 'social_proof') && (
          <section className="mb-8">
            <h2 className="text-xl font-black mb-4" style={{ color: text, fontFamily: headingFont }}>
              {isRTL ? 'ماذا يقول عملاؤنا' : 'Ce que disent nos clients'}
            </h2>
            <div className="space-y-3">
              {c.social_proof.testimonials.map((t, i) => (
                <div key={i} className="p-4 rounded-2xl" style={{ background: card, border: `1px solid ${border}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm" style={{ color: text }}>{t.name}</p>
                      <p className="text-xs" style={{ color: textMuted }}>{t.location}</p>
                    </div>
                    <StarRating rating={t.rating} />
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: textMuted }}>{t.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
git add src/components/store/LandingPageRenderer.tsx
git commit -m "feat: respect hidden_sections in the generic landing page renderer"
```

---

### Task 7: Editor — section visibility bar

**Files:**
- Modify: `src/app/(platform)/dashboard/pages/[id]/page.tsx`

- [ ] **Step 1: Import the helper and section-key type**

Replace:

```ts
import type { LandingPage, Store, LandingPageContent, Plan } from '@/types/database'
import { BUSINESS_PLANS } from '@/types/database'
```

With:

```ts
import type { LandingPage, Store, LandingPageContent, LandingPageSectionKey, Plan } from '@/types/database'
import { BUSINESS_PLANS } from '@/types/database'
import { isSectionVisible } from '@/lib/landing-sections'
```

- [ ] **Step 2: Add the toggle list constant and give `Section` a `hidden` prop**

Replace:

```ts
function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-dash-surface-2 transition-colors"
      >
        <span className="text-dash-ink font-semibold text-sm">{title}</span>
        {open ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-dash-border pt-4">{children}</div>}
    </div>
  )
}
```

With:

```ts
function Section({ title, children, defaultOpen = true, hidden = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean; hidden?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden transition-opacity ${hidden ? 'opacity-60' : ''}`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-dash-surface-2 transition-colors"
      >
        <span className="flex items-center gap-2 text-dash-ink font-semibold text-sm">
          {title}
          {hidden && (
            <span className="px-2 py-0.5 rounded-full bg-dash-surface-2 text-dash-ink-faint text-[10px] font-medium normal-case">
              Section masquée
            </span>
          )}
        </span>
        {open ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4 border-t border-dash-border pt-4">{children}</div>}
    </div>
  )
}

const SECTION_TOGGLES: { key: LandingPageSectionKey; label: string }[] = [
  { key: 'benefits', label: 'Avantages' },
  { key: 'social_proof', label: 'Preuves sociales' },
  { key: 'product_details', label: 'Détails produit' },
  { key: 'urgency', label: 'Urgence' },
]
```

- [ ] **Step 3: Add the `toggleSection` helper next to the other content helpers**

Replace:

```ts
  // Helpers to update nested content
  const setHero = (patch: Partial<LandingPageContent['hero']>) =>
    setContent(c => c ? { ...c, hero: { ...c.hero, ...patch } } : c)
```

With:

```ts
  // Helpers to update nested content
  const toggleSection = (key: LandingPageSectionKey) =>
    setContent(c => {
      if (!c) return c
      const hidden = new Set(c.hidden_sections ?? [])
      if (hidden.has(key)) hidden.delete(key)
      else hidden.add(key)
      return { ...c, hidden_sections: Array.from(hidden) }
    })

  const setHero = (patch: Partial<LandingPageContent['hero']>) =>
    setContent(c => c ? { ...c, hero: { ...c.hero, ...patch } } : c)
```

- [ ] **Step 4: Render the toggle bar (right after the Stock section, before "Titre de la page")**

Replace:

```ts
      {/* --- CONTENT EDITOR --- */}

      {/* Titre de la page */}
      <Section title="Titre de la page">
```

With:

```ts
      {/* --- CONTENT EDITOR --- */}

      {/* Section visibility bar */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3">
        <div>
          <p className="text-dash-ink font-semibold text-sm">Sections visibles</p>
          <p className="text-dash-ink-soft text-xs mt-0.5">
            Désactivez les sections que vous ne voulez pas afficher — le Hero et le formulaire de commande restent toujours visibles.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {SECTION_TOGGLES.map(({ key, label }) => {
            const visible = isSectionVisible(content, key)
            return (
              <button
                key={key}
                onClick={() => toggleSection(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${
                  visible
                    ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                    : 'border-dash-border text-dash-ink-faint'
                }`}
              >
                {visible ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Titre de la page */}
      <Section title="Titre de la page">
```

- [ ] **Step 5: Pass `hidden` into the 4 toggleable Section cards**

Replace:

```ts
      {/* Benefits */}
      <Section title="Avantages produit">
```

With:

```ts
      {/* Benefits */}
      <Section title="Avantages produit" hidden={!isSectionVisible(content, 'benefits')}>
```

Replace:

```ts
      {/* Social proof */}
      <Section title="Preuves sociales" defaultOpen={false}>
```

With:

```ts
      {/* Social proof */}
      <Section title="Preuves sociales" defaultOpen={false} hidden={!isSectionVisible(content, 'social_proof')}>
```

Replace:

```ts
      {/* Product details */}
      <Section title="Détails du produit" defaultOpen={false}>
```

With:

```ts
      {/* Product details */}
      <Section title="Détails du produit" defaultOpen={false} hidden={!isSectionVisible(content, 'product_details')}>
```

Replace:

```ts
      {/* Urgency */}
      <Section title="Urgence" defaultOpen={false}>
```

With:

```ts
      {/* Urgency */}
      <Section title="Urgence" defaultOpen={false} hidden={!isSectionVisible(content, 'urgency')}>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(platform)/dashboard/pages/[id]/page.tsx"
git commit -m "feat: add section visibility toggle bar to the landing page editor"
```

---

### Task 8: Editor — photo add/remove

**Files:**
- Modify: `src/app/(platform)/dashboard/pages/[id]/page.tsx`

- [ ] **Step 1: Import `Plus` and `getPhotoCount`**

Replace:

```ts
import {
  ArrowLeft, ExternalLink, Copy, Check, Trash2, Loader2,
  ChevronDown, ChevronUp, Save, ToggleLeft, ToggleRight, Rocket,
  Lock, FlaskConical, Trophy
} from 'lucide-react'
```

With:

```ts
import {
  ArrowLeft, ExternalLink, Copy, Check, Trash2, Loader2,
  ChevronDown, ChevronUp, Save, ToggleLeft, ToggleRight, Rocket,
  Lock, FlaskConical, Trophy, Plus
} from 'lucide-react'
import { getPhotoCount } from '@/lib/landing-photos'
```

- [ ] **Step 2: Add `photos` and `uploadingPhoto` state**

Replace:

```ts
  const [page, setPage] = useState<LandingPage | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [content, setContent] = useState<LandingPageContent | null>(null)
```

With:

```ts
  const [page, setPage] = useState<LandingPage | null>(null)
  const [store, setStore] = useState<Store | null>(null)
  const [content, setContent] = useState<LandingPageContent | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
```

- [ ] **Step 3: Load `generated_images` into state**

Replace:

```ts
      const lp = pageData as LandingPage
      setPage(lp)
      setContent(lp.content)
      setTitle(lp.title)
```

With:

```ts
      const lp = pageData as LandingPage
      setPage(lp)
      setContent(lp.content)
      setPhotos(lp.generated_images ?? [])
      setTitle(lp.title)
```

- [ ] **Step 4: Add the upload/remove handlers next to `deletePage`**

Replace:

```ts
  const deletePage = async () => {
```

With:

```ts
  const photoCap = store ? getPhotoCount(store.plan) : 5

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !store || !page) return
    const remaining = photoCap - photos.length
    if (remaining <= 0) return
    setUploadingPhoto(true)
    const supabase = createClient()
    const newUrls: string[] = []
    for (const file of files.slice(0, remaining)) {
      const path = `${store.id}/landing-photos/${page.slug}/manual-${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
      const { data, error: upErr } = await supabase.storage.from('product-images').upload(path, file)
      if (!upErr && data) {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(data.path)
        newUrls.push(urlData.publicUrl)
      }
    }
    setPhotos(prev => [...prev, ...newUrls])
    setUploadingPhoto(false)
  }

  const removePhoto = (idx: number) => setPhotos(prev => prev.filter((_, i) => i !== idx))

  const deletePage = async () => {
```

- [ ] **Step 5: Persist `photos` as `generated_images` on save**

Replace:

```ts
    const { error: err } = await supabase
      .from('landing_pages')
      .update({
        title, content, is_active: nextActive, updated_at: new Date().toISOString(),
        stock: stockValue,
        product_id: productId,
        upsell_enabled: upsellEnabled,
        upsell_product_name: upsellProductName || null,
        upsell_text: upsellText || null,
        upsell_price: upsellPrice ? Number(upsellPrice) : null,
        content_b: contentB,
      })
      .eq('id', page.id)
```

With:

```ts
    const { error: err } = await supabase
      .from('landing_pages')
      .update({
        title, content, is_active: nextActive, updated_at: new Date().toISOString(),
        stock: stockValue,
        product_id: productId,
        upsell_enabled: upsellEnabled,
        upsell_product_name: upsellProductName || null,
        upsell_text: upsellText || null,
        upsell_price: upsellPrice ? Number(upsellPrice) : null,
        content_b: contentB,
        generated_images: photos,
      })
      .eq('id', page.id)
```

- [ ] **Step 6: Add `photos` to the `persist` `useCallback` dependency array**

Replace:

```ts
  }, [content, page, store, title, isActive, stock, upsellEnabled, upsellProductName, upsellText, upsellPrice, contentB])
```

With:

```ts
  }, [content, page, store, title, isActive, stock, upsellEnabled, upsellProductName, upsellText, upsellPrice, contentB, photos])
```

- [ ] **Step 7: Render the Photos card (right after the Stock section, before the section-visibility bar added in Task 7)**

Replace:

```ts
      {/* --- CONTENT EDITOR --- */}

      {/* Section visibility bar */}
```

With:

```ts
      {/* --- CONTENT EDITOR --- */}

      {/* Photos */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <div>
          <h3 className="text-dash-ink font-semibold text-sm">Photos de la page</h3>
          <p className="text-dash-ink-soft text-xs mt-0.5">
            {photos.length}/{photoCap} photos — ajoutez vos propres photos ou supprimez celles générées par l&apos;IA.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {photos.map((url, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => removePhoto(idx)}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={16} className="text-white" />
              </button>
            </div>
          ))}
          {photos.length < photoCap && (
            <label className="w-20 h-20 rounded-xl border-2 border-dashed border-dash-border hover:border-dash-accent/40 flex flex-col items-center justify-center cursor-pointer transition-all group">
              {uploadingPhoto ? (
                <Loader2 size={18} className="animate-spin text-dash-ink-soft" />
              ) : (
                <>
                  <Plus size={18} className="text-dash-ink-soft group-hover:text-dash-accent transition-colors" />
                  <span className="text-[10px] text-dash-ink-faint mt-1">Ajouter</span>
                </>
              )}
              <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          )}
        </div>
      </div>

      {/* Section visibility bar */}
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Manual verification**

On the dev server, open an existing landing page at `/dashboard/pages/[id]`:
- Confirm the Photos card shows existing `generated_images` thumbnails with hover-delete.
- Confirm "Ajouter" opens a file picker, uploads, and appends a thumbnail; confirm it disappears once `photoCap` is reached.
- Remove a photo, click Sauvegarder, reload the page, confirm the removal persisted.
- Toggle a section off in the visibility bar, save, open the public page (`publicUrl` link) and confirm that section is gone while Hero and the order form still render.
- Toggle it back on, save, confirm it reappears.

- [ ] **Step 10: Commit**

```bash
git add "src/app/(platform)/dashboard/pages/[id]/page.tsx"
git commit -m "feat: add manual photo add/remove to the landing page editor"
```

---

### Task 9: Final full-suite check

- [ ] **Step 1: Run the whole test suite**

Run: `npm run test`
Expected: PASS — all existing tests plus the 6 new ones (4 in `landing-sections.test.ts`, 2 in `route.test.ts`) pass.

- [ ] **Step 2: Run the linter**

Run: `npm run lint`
Expected: no new warnings/errors in the 6 files touched by this plan.

- [ ] **Step 3: Full typecheck**

Run: `npx tsc --noEmit`
Expected: clean.
