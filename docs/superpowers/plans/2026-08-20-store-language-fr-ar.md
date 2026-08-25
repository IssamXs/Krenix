# Store Language (French / Arabic) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each Krenix store owner lock their storefront + AI landing pages + order flow to French OR Arabic (RTL) via a single setting.

**Architecture:** Add one `storeLanguage: 'fr' | 'ar'` field to the existing `StoreSettings` JSONB (no DB migration). A tiny helper `getStoreLocale(store)` reads it. The store `layout.tsx` sets `<html lang dir>` from that helper. Storefront components (`StoreHomepage`, `StandaloneProductView`, and the 5 niche themes) get bilingual with the same inline `isRTL ? 'ar' : 'fr'` pattern already used by `LandingPageRenderer` and `OrderFormFields`. RTL layout comes from Tailwind logical utilities (`ms-*`, `me-*`, `text-start`, `text-end`, …) plus `rtl:` variants for icons. Arabic loads **Tajawal** via `GoogleFontLoader`. Wilaya list gains Arabic display names; stored order values stay canonical French so integrations (Yalidine/ZR/Maystro/WeCan) are untouched.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS logical utilities, Supabase (JSONB settings), Claude AI landing generator (already supports `fr`/`ar`/`both`).

**Spec:** `docs/superpowers/specs/2026-08-20-store-language-fr-ar-design.md`

---

## Testing philosophy

This is a UI/i18n feature. Unit-testing every inline conditional would be low-value; the failure modes are visual (missed string in French inside Arabic store, unflipped icon, wrong `dir`). So the verification approach per CLAUDE.md is:

1. `tsc --noEmit` after each task with a type change.
2. Once storefront tasks (7-9) are done, run the dev server (per project rule: use `preview_start`, not raw Bash) and walk through the FR path AND the AR path on both a test niche theme store and the default storefront.
3. One test store already set to `storeLanguage: 'ar'` for regression checks.

Where a task DOES admit a cheap unit test (e.g. `getStoreLocale` default fallback, wilaya AR lookup), it's included TDD-style.

---

### Task 1: Add `storeLanguage` field + `getStoreLocale` helper

**Files:**
- Modify: `src/types/database.ts` (add field to `StoreSettings`)
- Create: `src/lib/i18n/store.ts`

- [ ] **Step 1: Add the type field**

Open `src/types/database.ts`, find the `StoreSettings` interface (around line 89). Add the field near `storeContent?` (around line 147) so related content fields cluster:

```ts
  // Storefront + landing-page + order flow language. Absent = 'fr'.
  // Arabic sets dir="rtl" and loads Tajawal on the storefront.
  storeLanguage?: 'fr' | 'ar'
```

- [ ] **Step 2: Create the helper module**

Create `src/lib/i18n/store.ts` with exact content:

```ts
import type { Store, StoreSettings } from '@/types/database'

export type StoreLocale = 'fr' | 'ar'

/**
 * Storefront/landing/order-flow language for a store.
 * Falls back to 'fr' when the field is absent (every legacy store).
 */
export function getStoreLocale(
  store: Pick<Store, 'settings'> | { settings?: Partial<StoreSettings> | null }
): StoreLocale {
  return store?.settings?.storeLanguage === 'ar' ? 'ar' : 'fr'
}

/**
 * True when the given store should render right-to-left.
 * Alias for `getStoreLocale(store) === 'ar'` — reads more naturally at call sites.
 */
export function isStoreRTL(
  store: Pick<Store, 'settings'> | { settings?: Partial<StoreSettings> | null }
): boolean {
  return getStoreLocale(store) === 'ar'
}
```

- [ ] **Step 3: Write a small test for the helper**

Create `src/lib/i18n/__tests__/store.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getStoreLocale, isStoreRTL } from '../store'

describe('getStoreLocale', () => {
  it('defaults to fr when storeLanguage is absent', () => {
    expect(getStoreLocale({ settings: {} })).toBe('fr')
    expect(getStoreLocale({ settings: null })).toBe('fr')
  })
  it('returns ar when set to ar', () => {
    expect(getStoreLocale({ settings: { storeLanguage: 'ar' } })).toBe('ar')
  })
  it('treats unknown values as fr (defensive)', () => {
    expect(getStoreLocale({ settings: { storeLanguage: 'xx' as never } })).toBe('fr')
  })
})

describe('isStoreRTL', () => {
  it('true only for ar', () => {
    expect(isStoreRTL({ settings: { storeLanguage: 'ar' } })).toBe(true)
    expect(isStoreRTL({ settings: {} })).toBe(false)
  })
})
```

- [ ] **Step 4: Run tests + typecheck**

```bash
npx vitest run src/lib/i18n/__tests__/store.test.ts
npx tsc --noEmit
```

Expected: 4 tests pass, no type errors.
If the project has no vitest configured, skip Step 3 and delete the file — the helper is trivial enough that Task 3's integration usage covers it.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts src/lib/i18n/
git commit -m "feat(i18n): add storeLanguage setting + getStoreLocale helper"
```

---

### Task 2: Add Arabic display names for the 58 wilayas

**Files:**
- Modify: `src/lib/wilayas.ts`

Stored order values stay in French — this only adds a lookup used at render time in the wilaya dropdown.

- [ ] **Step 1: Append Arabic-name lookup**

At the bottom of `src/lib/wilayas.ts`, append:

```ts
/**
 * Arabic display names for each wilaya, keyed by the canonical French name.
 * Used ONLY for rendering (dropdown, receipts): stored order values keep
 * the canonical French name so couriers (Yalidine/ZR/Maystro/WeCan) and
 * analytics do not need to change.
 */
export const WILAYAS_AR: Record<string, string> = {
  "Adrar": "أدرار",
  "Chlef": "الشلف",
  "Laghouat": "الأغواط",
  "Oum El Bouaghi": "أم البواقي",
  "Batna": "باتنة",
  "Béjaïa": "بجاية",
  "Biskra": "بسكرة",
  "Béchar": "بشار",
  "Blida": "البليدة",
  "Bouira": "البويرة",
  "Tamanrasset": "تمنراست",
  "Tébessa": "تبسة",
  "Tlemcen": "تلمسان",
  "Tiaret": "تيارت",
  "Tizi Ouzou": "تيزي وزو",
  "Alger": "الجزائر",
  "Djelfa": "الجلفة",
  "Jijel": "جيجل",
  "Sétif": "سطيف",
  "Saïda": "سعيدة",
  "Skikda": "سكيكدة",
  "Sidi Bel Abbès": "سيدي بلعباس",
  "Annaba": "عنابة",
  "Guelma": "قالمة",
  "Constantine": "قسنطينة",
  "Médéa": "المدية",
  "Mostaganem": "مستغانم",
  "M'Sila": "المسيلة",
  "Mascara": "معسكر",
  "Ouargla": "ورقلة",
  "Oran": "وهران",
  "El Bayadh": "البيض",
  "Illizi": "إليزي",
  "Bordj Bou Arréridj": "برج بوعريريج",
  "Boumerdès": "بومرداس",
  "El Tarf": "الطارف",
  "Tindouf": "تندوف",
  "Tissemsilt": "تيسمسيلت",
  "El Oued": "الوادي",
  "Khenchela": "خنشلة",
  "Souk Ahras": "سوق أهراس",
  "Tipaza": "تيبازة",
  "Mila": "ميلة",
  "Aïn Defla": "عين الدفلى",
  "Naâma": "النعامة",
  "Aïn Témouchent": "عين تموشنت",
  "Ghardaïa": "غرداية",
  "Relizane": "غليزان",
  "Timimoun": "تيميمون",
  "Bordj Badji Mokhtar": "برج باجي مختار",
  "Ouled Djellal": "أولاد جلال",
  "Béni Abbès": "بني عباس",
  "In Salah": "عين صالح",
  "In Guezzam": "عين قزام",
  "Touggourt": "تقرت",
  "Djanet": "جانت",
  "El M'Ghair": "المغير",
  "El Meniaa": "المنيعة",
}

/** French → Arabic display name; returns the French name unchanged if unknown. */
export function wilayaDisplayName(name: string, locale: 'fr' | 'ar'): string {
  if (locale === 'ar') return WILAYAS_AR[name] ?? name
  return name
}
```

- [ ] **Step 2: Sanity check parity**

Run this one-liner:

```bash
node -e "const {WILAYAS, WILAYAS_AR} = require('./src/lib/wilayas.ts'); console.log(WILAYAS.length, Object.keys(WILAYAS_AR).length, WILAYAS.filter(w => !WILAYAS_AR[w]))"
```

Expected: `58 58 []`. If the `require` on a `.ts` fails locally, just eyeball that every entry in `WILAYAS` appears as a key in `WILAYAS_AR`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/wilayas.ts
git commit -m "feat(i18n): Arabic display names for the 58 wilayas"
```

---

### Task 3: Set `<html lang dir>` from the store's locale

**Files:**
- Modify: `src/app/(store)/layout.tsx`

The current layout returns a `<>` fragment because `<html>` lives in `src/app/layout.tsx`. That root layout wraps every route with a fixed `<html lang="fr">`. We need the STORE routes to override lang/dir. Next 14 supports nested layouts overriding html attributes via the child returning its own `<html>` only when the segment is a route group root — which `(store)` is. Verify the root by opening `src/app/layout.tsx`; if it already returns `<html>`, the safer move is to add a client-side effect that sets `document.documentElement.lang` and `.dir` on mount for store pages.

- [ ] **Step 1: Inspect the root layout**

```bash
grep -n "<html" src/app/layout.tsx
```

- [ ] **Step 2: Add a `StoreHtmlDir` client component**

Create `src/components/store/StoreHtmlDir.tsx`:

```tsx
'use client'
import { useEffect } from 'react'

export default function StoreHtmlDir({ locale }: { locale: 'fr' | 'ar' }) {
  useEffect(() => {
    const html = document.documentElement
    const prevLang = html.lang
    const prevDir = html.dir
    html.lang = locale
    html.dir = locale === 'ar' ? 'rtl' : 'ltr'
    return () => {
      html.lang = prevLang
      html.dir = prevDir
    }
  }, [locale])
  return null
}
```

Rationale for client-side: the root `<html>` is authoritative in App Router. A client effect on the store layout is the safest way to override without restructuring the root layout (which would affect the dashboard, super-admin, marketing pages — out of scope). SSR sends `<html lang="fr" dir="ltr">`; the swap runs before first paint of interactive content and applies before any Tailwind `rtl:` variants matter for layout (Tailwind's `rtl:` variant reads the `dir` attribute at CSS-time via the `[dir="rtl"]` selector, which re-evaluates on mutation).

- [ ] **Step 3: Wire it into the store layout**

Modify `src/app/(store)/layout.tsx`:

```tsx
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import ChatbotWidget from '@/components/chatbot/LazyChatbotWidget'
import GtmScripts from '@/components/store/GtmScripts'
import StoreHtmlDir from '@/components/store/StoreHtmlDir'
import { getStoreLocale } from '@/lib/i18n/store'
import { type Store } from '@/types/database'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const storeSlug = headersList.get('x-store-slug')

  if (storeSlug) {
    const supabase = await createClient()
    const { data: store } = await supabase
      .from('stores')
      .select('*, theme:themes(*)')
      .eq('slug', storeSlug)
      .eq('is_suspended', false)
      .single()

    const planAllowsChatbot = store && (store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0)
    const isChatbotEnabled = planAllowsChatbot && store.settings?.chatbot?.enabled !== false
    const gtmId: string | undefined = store?.settings?.gtmId
    const locale = store ? getStoreLocale(store as Store) : 'fr'

    return (
      <>
        <StoreHtmlDir locale={locale} />
        {gtmId && <GtmScripts gtmId={gtmId} />}
        {children}
        {isChatbotEnabled && store && (
          <ChatbotWidget store={store as Store} />
        )}
      </>
    )
  }

  return <>{children}</>
}
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/\(store\)/layout.tsx src/components/store/StoreHtmlDir.tsx
git commit -m "feat(store): set html lang+dir from store.settings.storeLanguage"
```

---

### Task 4: Load Tajawal font when Arabic

**Files:**
- Modify: `src/components/store/GoogleFontLoader.tsx`
- Modify: the caller that computes the `href` (find with grep)

- [ ] **Step 1: Find the caller**

```bash
grep -rn "GoogleFontLoader\|href.*fonts.googleapis" src/app/\(store\) src/components/store | head -10
```

- [ ] **Step 2: Extend `GoogleFontLoader` to accept an extra font family**

Modify `src/components/store/GoogleFontLoader.tsx`:

```tsx
'use client'

// Loads a per-store custom Google Fonts stylesheet WITHOUT blocking first paint.
// See existing comment above for the reasoning.
export default function GoogleFontLoader({
  href,
  arabic = false,
}: {
  href?: string | null
  arabic?: boolean
}) {
  const arabicHref = arabic
    ? 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap'
    : null

  if (!href && !arabicHref) return null

  const links: string[] = []
  if (href) links.push(href)
  if (arabicHref) links.push(arabicHref)

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {links.map((h) => (
        <link
          key={h}
          rel="stylesheet"
          href={h}
          media="print"
          onLoad={(e) => { (e.currentTarget as HTMLLinkElement).media = 'all' }}
        />
      ))}
      <noscript>
        {links.map((h) => <link key={h} rel="stylesheet" href={h} />)}
      </noscript>
    </>
  )
}
```

- [ ] **Step 3: Pass `arabic={locale === 'ar'}` at the caller(s)**

For each caller found in Step 1, replace `<GoogleFontLoader href={fontHref} />` with `<GoogleFontLoader href={fontHref} arabic={locale === 'ar'} />` where `locale` comes from `getStoreLocale(store)`. Import it if missing.

- [ ] **Step 4: Add Tajawal to the Arabic body font stack**

Wherever storefront components apply their body/heading font-family via inline style or a Tailwind arbitrary value (e.g. `fontFamily: "'Sora', sans-serif"` in `LandingPageRenderer.tsx:220`), the RTL branch already switches to `'Cairo', sans-serif`. Update those `'Cairo'` branches to `"'Tajawal', 'Cairo', system-ui, sans-serif"` so Tajawal takes precedence but Cairo remains as an in-flight fallback while Tajawal loads. Grep to find every one:

```bash
grep -rn "'Cairo'" src/components/store src/app/\(store\)
```

Replace each `"'Cairo', sans-serif"` (and similar) with `"'Tajawal', 'Cairo', system-ui, sans-serif"`. Do NOT touch dashboard/super-admin/marketing files.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/store/GoogleFontLoader.tsx src/components/store src/app/\(store\)
git commit -m "feat(store): load Tajawal for Arabic storefront + landing"
```

---

### Task 5: Onboarding step-3 language toggle

**Files:**
- Modify: `src/app/(platform)/onboarding/step-3/page.tsx`

- [ ] **Step 1: Add local state + persist to `settings.storeLanguage`**

Above the return, add:

```tsx
const [lang, setLang] = useState<'fr' | 'ar'>('fr')
```

In `handleNext` (currently only updates `theme_id`), fetch the existing settings, merge `storeLanguage`, and write back:

```tsx
const handleNext = async () => {
  setSaving(true)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { router.push('/auth/login'); return }

  const storeId = await resolveOnboardingStoreId(supabase, user.id)
  if (storeId) {
    // Read current settings so we don't wipe fields set by earlier steps.
    const { data: cur } = await supabase.from('stores')
      .select('settings').eq('id', storeId).single()
    const settings = { ...(cur?.settings ?? {}), storeLanguage: lang }
    const patch: Record<string, unknown> = { settings }
    if (selectedThemeId) patch.theme_id = selectedThemeId
    await supabase.from('stores').update(patch).eq('id', storeId)
  }

  router.push(stepUrl('step-4', storeId))
}
```

- [ ] **Step 2: Add the toggle UI above the theme grid**

Insert between the "Choisissez votre thème" heading block and the `{loading ? ...}` block:

```tsx
<div className="mb-6">
  <p className="text-dash-ink text-sm font-medium mb-3 text-center">
    Langue de la boutique <span className="text-dash-ink-faint">/ لغة المتجر</span>
  </p>
  <div className="flex justify-center gap-2">
    {(['fr', 'ar'] as const).map((code) => {
      const label = code === 'fr' ? 'Français' : 'العربية'
      const active = lang === code
      return (
        <button
          key={code}
          type="button"
          onClick={() => setLang(code)}
          className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
            active
              ? 'bg-dash-accent border-dash-accent text-white'
              : 'bg-dash-surface border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint'
          }`}
        >
          {label}
        </button>
      )
    })}
  </div>
  <p className="text-dash-ink-faint text-xs text-center mt-2">
    Vos produits et pages seront écrits dans cette langue. Modifiable plus tard dans les paramètres.
  </p>
</div>
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/\(platform\)/onboarding/step-3/page.tsx
git commit -m "feat(onboarding): pick storefront language in step 3"
```

---

### Task 6: Settings page — language card

**Files:**
- Modify: `src/app/(platform)/dashboard/settings/page.tsx`

- [ ] **Step 1: Add form field + guardrail state**

Near the other `form.*` fields (around line 73-88), add `storeLanguage: (data.settings?.storeLanguage ?? 'fr') as 'fr' | 'ar'` to the `setForm({...})` call.

Add a change-guard: at component top, add:

```tsx
const [pendingLangChange, setPendingLangChange] = useState<null | 'fr' | 'ar'>(null)
```

- [ ] **Step 2: Persist in `handleSave`**

Inside the `settings: { ... }` object in `handleSave` (around line 113), add:

```ts
storeLanguage: form.storeLanguage,
```

- [ ] **Step 3: Render the card**

Insert a new card just BEFORE the `storeContent` card (found near line 400 by searching for `settings.storeContent`). Match the existing card style:

```tsx
<div className="rounded-[20px] bg-dash-surface border border-dash-border p-5 mb-4">
  <h3 className="dash-font-heading text-dash-ink font-medium text-lg mb-1">Langue de la boutique</h3>
  <p className="text-dash-ink-soft text-sm mb-4">
    Choisit la langue de la vitrine, des pages produits, des pages générées par l'IA et du formulaire de commande. Le tableau de bord reste en français.
  </p>
  <div className="flex gap-2">
    {(['fr', 'ar'] as const).map((code) => {
      const label = code === 'fr' ? 'Français' : 'العربية'
      const active = form.storeLanguage === code
      return (
        <button
          key={code}
          type="button"
          onClick={() => {
            if (code === form.storeLanguage) return
            // Guardrail: warn if the store already has published content.
            const hasContent = !!store && (
              (store as { products_count?: number }).products_count ??
              0
            ) > 0
            if (hasContent) setPendingLangChange(code)
            else setForm(f => ({ ...f, storeLanguage: code }))
          }}
          className={`px-5 py-2 rounded-full text-sm font-medium border transition-colors ${
            active
              ? 'bg-dash-accent border-dash-accent text-white'
              : 'bg-dash-surface-2 border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint'
          }`}
        >
          {label}
        </button>
      )
    })}
  </div>
  <p className="text-dash-ink-faint text-xs mt-3">
    Astuce : écrivez vos titres, descriptions et pages dans la langue choisie — la traduction automatique n'est pas activée.
  </p>
</div>

{pendingLangChange && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div className="rounded-2xl bg-dash-surface border border-dash-border p-6 max-w-md w-full">
      <h4 className="dash-font-heading text-dash-ink font-medium text-lg mb-2">Changer la langue de la boutique ?</h4>
      <p className="text-dash-ink-soft text-sm mb-5">
        Le contenu existant (produits, pages, messages personnalisés) restera dans la langue où vous l'avez écrit. Vous devrez le récrire si vous souhaitez tout en {pendingLangChange === 'ar' ? 'arabe' : 'français'}.
      </p>
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => setPendingLangChange(null)}
          className="px-4 py-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink text-sm"
        >Annuler</button>
        <button
          type="button"
          onClick={() => {
            setForm(f => ({ ...f, storeLanguage: pendingLangChange }))
            setPendingLangChange(null)
          }}
          className="px-4 py-2 rounded-xl bg-dash-accent text-white text-sm font-medium hover:bg-dash-accent-dark"
        >Continuer</button>
      </div>
    </div>
  </div>
)}
```

If `store.products_count` is not part of the fetched shape, replace the `hasContent` check with `true` (always warn — safer default) OR extend the select on line ~65 to include `products_count`. Simplest: always warn.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/\(platform\)/dashboard/settings/page.tsx
git commit -m "feat(settings): language toggle card with change guardrail"
```

---

### Task 7: `StoreHomepage` — bilingual + RTL

**Files:**
- Modify: `src/components/store/StoreHomepage.tsx`

- [ ] **Step 1: Import + derive locale**

At the top, add:

```ts
import { getStoreLocale } from '@/lib/i18n/store'
```

Inside the component body, once you have `store` in scope:

```ts
const locale = getStoreLocale(store)
const isRTL = locale === 'ar'
```

- [ ] **Step 2: Wrap the root with `dir` and swap directional utilities**

- Change the outermost `<div>` in the return to include `dir={isRTL ? 'rtl' : 'ltr'}`.
- Replace all directional Tailwind utilities in this file, in place:
  - `ml-` → `ms-` , `mr-` → `me-`
  - `pl-` → `ps-` , `pr-` → `pe-`
  - `text-left` → `text-start` , `text-right` → `text-end`
  - `rounded-l` → `rounded-s` , `rounded-r` → `rounded-e`

Use grep to enumerate:

```bash
grep -nE "\b(ml-|mr-|pl-|pr-|text-left|text-right|rounded-l|rounded-r|border-l|border-r)" src/components/store/StoreHomepage.tsx
```

Edit each match. Icons that convey direction (right-chevrons, next-arrows in carousels) get `rtl:scale-x-[-1]` added to their className.

- [ ] **Step 3: Translate visible French labels**

Grep for French UI strings in this file:

```bash
grep -nE "'[A-Z][a-zéèàêîôùûç' ]+'" src/components/store/StoreHomepage.tsx
```

For each label used in JSX text or as `title=` / `aria-label=` (welcome message, "Voir tous les produits", "Nouveautés", "Nos produits", promo tags, footer text, etc.), replace with `{isRTL ? 'AR translation' : 'FR original'}`. Owner-authored content (`storeContent.heroHeadline`, product name, welcome message) is passed through unchanged — the owner writes it in the store's language.

Reference translations to use (add more as encountered):

| French | العربية |
|---|---|
| Nos produits | منتجاتنا |
| Nouveautés | جديد |
| Voir tout | عرض الكل |
| Voir tous les produits | عرض جميع المنتجات |
| Acheter maintenant | اشترِ الآن |
| Ajouter au panier | أضف إلى السلة |
| Rupture de stock | نفد المخزون |
| Livraison partout en Algérie | التوصيل إلى جميع ولايات الجزائر |
| Bienvenue | مرحبا |
| Nos catégories | فئاتنا |
| À propos | من نحن |
| Nous contacter | اتصل بنا |
| Suivez-nous | تابعنا |
| Tous droits réservés | جميع الحقوق محفوظة |

- [ ] **Step 4: Verify visually with the dev server**

Per CLAUDE.md verification rule: use `preview_start` (not raw Bash). Open a test store with `settings.storeLanguage: 'ar'` and one with `'fr'`. Check the page renders mirrored in AR, all previously-French chrome is now Arabic, and product cards read right-to-left.

- [ ] **Step 5: Commit**

```bash
git add src/components/store/StoreHomepage.tsx
git commit -m "feat(store): StoreHomepage bilingual FR/AR + RTL"
```

---

### Task 8: `StandaloneProductView` — bilingual + RTL

**Files:**
- Modify: `src/components/store/StandaloneProductView.tsx`

Same treatment as Task 7 on a smaller file. Also: pass the derived `isRTL` down into `<OrderFormFields isRTL={isRTL} …>` — search the file for `OrderFormFields` and, if the prop isn't already passed, pass it now.

- [ ] **Step 1: Import + derive**

```ts
import { getStoreLocale } from '@/lib/i18n/store'
// inside component:
const locale = getStoreLocale(store)
const isRTL = locale === 'ar'
```

- [ ] **Step 2: Wrap root with `dir`, sweep directional utilities, translate labels**

Grep for directional utilities and French strings as in Task 7. Same translation table.

- [ ] **Step 3: Ensure `OrderFormFields` is called with `isRTL={isRTL}`**

```bash
grep -n "OrderFormFields" src/components/store/StandaloneProductView.tsx
```

Add or update the prop.

- [ ] **Step 4: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/store/StandaloneProductView.tsx
git commit -m "feat(store): StandaloneProductView bilingual FR/AR + RTL"
```

---

### Task 9: `StoreOrderModal` — bilingual + RTL

**Files:**
- Modify: `src/components/store/StoreOrderModal.tsx`

Small file (63 lines). Same treatment: import `getStoreLocale`, derive `isRTL`, add `dir`, swap directional utilities, translate any chrome, pass `isRTL` to `OrderFormFields`.

- [ ] **Step 1-2:** As above.

- [ ] **Step 3: Commit**

```bash
git add src/components/store/StoreOrderModal.tsx
git commit -m "feat(store): StoreOrderModal bilingual FR/AR + RTL"
```

---

### Task 10: Niche themes (5) — bilingual + RTL sweep

**Files (one sub-task per theme):**
- `src/components/store/themes/beauty/**`
- `src/components/store/themes/car/**`
- `src/components/store/themes/home/**`
- `src/components/store/themes/sport/**`
- `src/components/store/themes/tech/**`

For each theme, apply the Task 7 treatment: import `getStoreLocale` where needed, derive `isRTL`, add `dir` on the outermost element, sweep directional utilities, translate visible French chrome using the translation table from Task 7 (extend it as new strings are found).

- [ ] **Beauty theme**

```bash
ls src/components/store/themes/beauty/
grep -rnE "\b(ml-|mr-|pl-|pr-|text-left|text-right|rounded-l|rounded-r)" src/components/store/themes/beauty/
```

Apply sweep. Commit:

```bash
git add src/components/store/themes/beauty/
git commit -m "feat(store/beauty): bilingual FR/AR + RTL"
```

- [ ] **Car theme** — same procedure, then commit `feat(store/car): bilingual FR/AR + RTL`

- [ ] **Home theme** — same, then commit `feat(store/home): bilingual FR/AR + RTL`

- [ ] **Sport theme** — same, then commit `feat(store/sport): bilingual FR/AR + RTL`

- [ ] **Tech theme** — same, then commit `feat(store/tech): bilingual FR/AR + RTL`

- [ ] **Visual verification** — with the dev server, iterate through the 5 demo stores (`demo-beaute`, `demo-tech`, `demo-fitness`, `demo-auto`, `demo-maison` per the memory note) after flipping each to `storeLanguage: 'ar'`. Check hero, product grid, footer, nav in AR mode.

---

### Task 11: Order form + `/merci` — pass locale from store setting

Order form already accepts `isRTL`. Callers should now derive it from the store setting (not just landing page meta) when the caller has no page-level language.

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx` (dropdown Arabic labels only)
- Modify: `src/app/(store)/paiement/**` (if present) — check for callers
- Modify: `/merci` page — grep `app/(store)` for it

- [ ] **Step 1: Wilaya dropdown shows Arabic name in AR mode**

Open `src/components/store/OrderFormFields.tsx`. At the top, add:

```ts
import { wilayaDisplayName } from '@/lib/wilayas'
```

Find the wilaya `<select>` (around line 573). Where it maps `WILAYAS.map(w => <option value={w}>{w}</option>)`, change to:

```tsx
{WILAYAS.map((w) => (
  <option key={w} value={w}>{wilayaDisplayName(w, isRTL ? 'ar' : 'fr')}</option>
))}
```

The `value={w}` stays the canonical French name → stored order value unchanged.

- [ ] **Step 2: Find any place that renders a saved wilaya to a customer (order recap, /merci) and localize the DISPLAY only**

```bash
grep -rn "form.wilaya\|order.wilaya\|order?.wilaya" src/app/\(store\) src/components/store
```

Wherever we display the wilaya to the customer AFTER submission, wrap with `wilayaDisplayName(order.wilaya, isRTL ? 'ar' : 'fr')`. Dashboard, courier payloads, and CSV exports keep raw `order.wilaya`.

- [ ] **Step 3: `/merci` page — pass isRTL from store locale**

```bash
grep -rn "merci" src/app/\(store\)
```

For the merci page component, import `getStoreLocale`, derive locale from the resolved store, and translate the "Merci pour votre commande" flow (all inline `isRTL ? 'AR' : 'FR'` pattern to match existing convention). No dictionary.

- [ ] **Step 4: Fallback for storefront-driven order modal**

`OrderFormFields` currently defaults `isRTL = false`. That's fine — callers (`StandaloneProductView`, `StoreOrderModal`, landing pages) explicitly pass `isRTL` now.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/components/store src/app/\(store\)
git commit -m "feat(order): wilaya AR display + merci page follows store locale"
```

---

### Task 12: AI landing-page generator — default language from store setting

The generator already supports `'fr' | 'ar' | 'both'`. Only the DEFAULT for the picker in `/dashboard/pages/new` needs to come from the store's `storeLanguage`.

**Files:**
- Modify: `src/app/(platform)/dashboard/pages/new/page.tsx`

- [ ] **Step 1: Read the store's language and use it as initial state**

Find the current `useState` for the language picker (grep `selectedLang`). Change its initializer to read from the active store's settings. If the page already fetches the store, use `getStoreLocale(store)`. If not, keep `'fr'` as the initial state and update it in the same `useEffect` that fetches the active store, calling `setSelectedLang(getStoreLocale(store))` on load.

Example:

```tsx
import { getStoreLocale } from '@/lib/i18n/store'
// …
const [selectedLang, setSelectedLang] = useState<'fr' | 'ar' | 'both'>('fr')
// in the load effect, after fetching the store:
setSelectedLang(getStoreLocale(store))
```

- [ ] **Step 2: Add a small note under the picker**

Directly under the language selector, add:

```tsx
<p className="text-dash-ink-faint text-xs mt-1">
  Défaut : la langue de votre boutique. Changez-la ici pour cette page seulement.
</p>
```

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/app/\(platform\)/dashboard/pages/new/page.tsx
git commit -m "feat(ai-landing): default generator language to store locale"
```

---

### Task 13: Order-status WhatsApp templates — Arabic defaults

**Files:**
- Modify: `src/lib/whatsapp.ts`

- [ ] **Step 1: Add an Arabic default map next to `DEFAULT_ORDER_MESSAGES`**

After the existing `DEFAULT_ORDER_MESSAGES` block (around line 105), append:

```ts
/** Default Arabic templates. Same placeholders. */
export const DEFAULT_ORDER_MESSAGES_AR: Required<OrderMessages> = {
  confirmed:
    'مرحبا {name} 👋\nطلبك رقم {order_number} في متجر {store} تم تأكيده ✅\nالمنتج: {product} — الإجمالي: {total}\nالتوصيل إلى {commune}، {wilaya}.\nشكرًا لثقتك 🙏',
  chez_livreur:
    'مرحبا {name} 📦\nطلبك رقم {order_number} جاهز وتم تسليمه للموزع.\nسيكون قريبًا في طريقه إلى {commune}، {wilaya}.',
  en_livraison:
    'مرحبا {name} 🚚\nطردك رقم {order_number} في طور التوصيل إلى {commune}، {wilaya}.\nيرجى إبقاء هاتفك مفتوحًا للموزع.',
  livree:
    'مرحبا {name} 🎉\nنأمل أن تكون راضيًا عن طلبك رقم {order_number}!\nشكرًا لطلبك من {store}. لا تتردد في ترك رأيك 💛',
  annulee:
    'مرحبا {name}\nطلبك رقم {order_number} في متجر {store} تم إلغاؤه.\nإذا كان ذلك خطأ أو تريد الطلب مجددًا، تواصل معنا هنا. شكرًا 🙏',
}
```

- [ ] **Step 2: Locale-aware `messageForStatus`**

Change signature to accept an optional locale and prefer AR defaults when locale is 'ar' AND the owner has NOT customized that particular template:

```ts
export function messageForStatus(
  status: OrderStatus,
  custom?: OrderMessages,
  locale: 'fr' | 'ar' = 'fr'
): string | null {
  if (!(status in DEFAULT_ORDER_MESSAGES)) return null
  const key = status as OrderMessageKey
  const override = custom?.[key]?.trim()
  if (override) return override
  return locale === 'ar' ? DEFAULT_ORDER_MESSAGES_AR[key] : DEFAULT_ORDER_MESSAGES[key]
}
```

- [ ] **Step 3: Update callers to pass locale**

```bash
grep -rn "messageForStatus(" src/
```

For each call site, pass `getStoreLocale(store)` as the third arg. Owner overrides win regardless of locale.

- [ ] **Step 4: Also localize `customerConfirmMessage` (customer → merchant)**

Currently returns a hard-coded French recap (line 124). Give it the same treatment: accept `locale` and return AR variant when 'ar'. Callers grep:

```bash
grep -rn "customerConfirmMessage(" src/
```

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/whatsapp.ts src/
git commit -m "feat(whatsapp): Arabic defaults for order-status templates"
```

---

### Task 14: Manual QA + regression sweep

- [ ] **Step 1: Prep two test stores**

In Supabase (via the admin UI or a psql console) set one test store to `settings.storeLanguage = 'ar'` and leave another at absent (defaults to 'fr'). Both should have at least one product + one AI-generated landing page.

- [ ] **Step 2: Launch dev server via preview_start**

Per project rule (CLAUDE.md verification-before-completion + preview_tools), start the app with `preview_start` and open both stores in tabs. Do NOT use `npm run dev` from raw Bash.

- [ ] **Step 3: FR store — regression**

Walk: storefront home → product card → product page → order form → submit test order → `/merci`. Every screen should look identical to before this feature landed. Check dashboard order detail still shows French wilaya.

- [ ] **Step 4: AR store — golden path**

Same walk. Every screen should be:
- Right-to-left (nav mirrored, product cards flow right-to-left, form labels right-aligned)
- Chrome text in Arabic
- Body text in Tajawal (check via devtools computed style, not by eye)
- Order form wilaya dropdown shows Arabic names; the submitted order in the dashboard still shows the French wilaya
- WhatsApp order-status message templates in Arabic (check the pending order's "Envoyer message" flow)

- [ ] **Step 5: AI landing page generation in AR mode**

From the dashboard of the AR store, generate a landing page. Language picker should default to `ar`. Submit → published page renders in AR with correct RTL, Tajawal, and inline conditionals from `LandingPageRenderer` show Arabic strings.

- [ ] **Step 6: Language flip guardrail**

In the settings page of the AR store, flip to `fr`. Modal appears. Cancel → nothing changes. Flip again → confirm → setting persists and the storefront now renders in FR (existing product name in Arabic remains as-is, which is expected).

- [ ] **Step 7: Chatbot untouched**

If the store is Ultimate+, open the chatbot widget on the AR store. Widget UI stays French (per spec — out of scope). Send a message in Darja; chatbot responds in Darja (existing behavior, unchanged).

- [ ] **Step 8: Onboarding new store**

Start a fresh onboarding flow, pick Arabic in step 3, complete. Verify the new store has `settings.storeLanguage: 'ar'` in Supabase and its default homepage renders in AR.

- [ ] **Step 9: Commit final QA notes**

Add a short entry to `dev-notes/Index.md` (per CLAUDE.md session workflow) summarizing what shipped and any AR-string translations that were merchant-facing so future sessions have context. No code commit here.

---

## Deferred / explicitly out of scope

- No React context, no `next-intl`, no dictionary module (existing inline pattern used everywhere for consistency).
- Dashboard, super-admin, marketing home, chatbot widget UI — stay FR/LTR.
- Visitor toggle, auto-detect, dual-language authoring, AI translation of existing content.
- No bulk re-translation of existing products/pages when the setting flips.
- DB migration: none. Field is inside JSONB.

## Coverage vs. spec

- Data model (spec §Data model) → Task 1.
- Locale plumbing (spec §Locale plumbing) → Task 1 (helper) + Task 3 (layout).
- RTL sweep (spec §RTL sweep) → Tasks 7-10.
- Fonts / Tajawal (spec §Fonts) → Task 4.
- Owner UX / onboarding (spec §Owner UX) → Task 5.
- Owner UX / settings + guardrail → Task 6.
- AI landing generator (spec §AI landing-page generator) → Task 12. Note: the existing `lib/claude.ts` already handles `fr`/`ar`/`both` prompts — no prompt changes needed, only the picker default.
- Order form + wilaya (spec §Order form + `/merci` + wilaya dropdown) → Tasks 8, 9, 11.
- WhatsApp templates (spec §Order form) → Task 13.
- Regression (spec §Testing) → Task 14.

---

**Plan self-review notes:** Types used consistently across tasks (`'fr' | 'ar'`, `getStoreLocale`, `isRTL`). `wilayaDisplayName` defined in Task 2, consumed in Task 11. `StoreHtmlDir` component name stable across tasks. `messageForStatus` signature extended in Task 13; caller updates in same task. No forward references to undefined symbols.
