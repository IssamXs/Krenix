# Store Language (French / Arabic) — Design Spec

**Date:** 2026-08-20
**Status:** Approved for planning
**Scope:** Storefront + landing pages + order flow (Krenix multi-tenant SaaS)

---

## Goal

Let each Krenix store owner choose whether their storefront (home + product pages),
AI-generated landing pages, and order flow are shown in **French** or **Arabic**.
Motivation: many visitors coming from Meta/TikTok ads read Arabic and don't finish
the purchase because everything is French.

## Non-goals

- Visitor-side language toggle (owner picks one, locked per store).
- Dual-language content authoring (no FR + AR fields side by side).
- AI auto-translation of existing owner-authored content.
- Dashboard, super-admin panel, marketing home page, chatbot widget UI — stay FR/LTR.
- Bulk re-translation when the owner flips the setting.

## Product decisions (settled in brainstorming)

| Question | Decision |
|---|---|
| Who controls language? | Owner picks one, locked. Visitors see that one language. |
| What gets translated? | UI chrome only. Owner writes their content in the chosen language. |
| RTL layout in Arabic mode? | Full RTL mirror (`dir="rtl"`, logical Tailwind utilities). |
| Which surfaces follow the locale? | Storefront home, product pages, AI landing pages, order form, `/merci`. |
| Arabic font? | **Tajawal** (Google Fonts), loaded when `locale === 'ar'`. |
| Arabic register for UI chrome? | Modern Standard Arabic (universally understood, professional). |

## Architecture

### Data model

Add one optional field to `StoreSettings` (`src/types/database.ts`):

```ts
storeLanguage?: 'fr' | 'ar'  // absent = 'fr'
```

`stores.settings` is a JSONB column → **no SQL migration required**. Existing stores
default to `'fr'` and behave exactly as today.

### i18n dictionary — no library

New module: `src/lib/i18n/store.ts`.

```ts
export type StoreLocale = 'fr' | 'ar'

export const STORE_DICT = {
  fr: {
    addToCart: 'Ajouter au panier',
    orderNow: 'Commander maintenant',
    // …all storefront/landing/order-form chrome strings
  },
  ar: {
    addToCart: 'أضف إلى السلة',
    orderNow: 'اطلب الآن',
    // …same keys, MSA
  },
} as const

export type StoreDictKey = keyof typeof STORE_DICT.fr

export function t(locale: StoreLocale, key: StoreDictKey): string {
  return STORE_DICT[locale][key] ?? STORE_DICT.fr[key]
}

export function getStoreLocale(store: { settings: { storeLanguage?: StoreLocale } }): StoreLocale {
  return store.settings.storeLanguage ?? 'fr'
}
```

Rationale for no library: matches the "Tailwind only, no external UI libraries"
project rule, keeps bundle size minimal, and the store surface has a bounded
vocabulary (a few dozen strings). If future work adds hundreds of keys or nested
plurals, we can revisit.

**TypeScript enforces parity:** `ar` must define every key that `fr` defines
(satisfied by a mapped-type assertion in the same file).

### Locale plumbing

No React context. The `store` object is already prop-drilled or fetched at the
route level everywhere we need it. Components call `getStoreLocale(store)` locally
and pass the result into `t(...)`.

### Root layout — the one place `dir` is set

`src/app/(store)/layout.tsx` already resolves the current store from the request
(for pixel scripts, GTM, etc.). Extend it:

```tsx
const locale = getStoreLocale(store)   // 'fr' | 'ar'
return (
  <html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
    …
  </html>
)
```

This single attribute drives Tailwind's `rtl:` variant and all logical
properties across every storefront/landing/product page.

### RTL sweep

Codebase-wide replacement in `src/components/store/**`, `src/components/store/themes/**`,
and `src/app/(store)/**` **only** (dashboard/super-admin/marketing home are out of scope):

| Directional | Logical replacement |
|---|---|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `text-left` / `text-right` | `text-start` / `text-end` |
| `left-*` / `right-*` (position) | `start-*` / `end-*` |
| `rounded-l-*` / `rounded-r-*` | `rounded-s-*` / `rounded-e-*` |
| `border-l` / `border-r` | `border-s` / `border-e` |

Directional icons (chevrons on carousels, "next" arrows, back buttons, accordion
carets) get `rtl:scale-x-[-1]`. Brand logos, product images, and social-icon
glyphs do NOT get flipped.

### Fonts

Extend `src/components/store/GoogleFontLoader.tsx`:

- When `locale === 'ar'`: load **Tajawal** (weights 400/500/700) alongside whatever
  the theme requests, and set the CSS `font-family` fallback stack so Arabic
  glyphs render from Tajawal first.
- When `locale === 'fr'`: unchanged.

### Owner UX

**Onboarding step 3 (theme selection):** add a two-pill toggle above the theme
grid — "Langue de la boutique / لغة المتجر" → `Français` / `العربية`. Default
= `Français`. Written to `settings.storeLanguage` on wizard completion.

**Existing stores — `/dashboard/settings`:** add a "Langue de la boutique" card
near the branding/colors card. Same two-pill toggle plus one short French
explainer sentence.

**Soft guardrail on change:** if the toggle flips and the store already has
published products or landing pages, show a one-time French confirm:
> "Le contenu existant (produits, pages) restera dans la langue où vous l'avez écrit. Continuer ?"

No bulk translation runs.

### AI landing-page generator

`src/api/ai/landing-page/route.ts` reads `store.settings.storeLanguage` and injects
into the Claude system prompt:

- `ar`: "Write ALL string values in Modern Standard Arabic. Keep proper nouns
  (brand names, product model numbers) untouched. Do NOT mix languages."
- `fr`: current behaviour.

Same credit cost (5 credits). Output JSON schema unchanged — only the language
of the strings inside. Landing pages carry no per-page locale; they render in
the store's current locale.

### Order form + `/merci` + wilaya dropdown

`src/components/store/OrderFormFields.tsx` reads locale and pulls all
labels/placeholders/validation messages from the dictionary.

**Wilaya list (`src/lib/wilayas.ts`):** add an `ar` field to each of the 58
entries (Alger/الجزائر, Oran/وهران, Constantine/قسنطينة, …). The dropdown
displays the localized name; the **stored value on the order stays the canonical
French name** so dashboard filters, courier integrations (Yalidine / ZR /
Maystro / WeCan), CSV exports, and analytics don't need to change.

`/merci` page reads locale and picks the correct default message.

**Order-status WhatsApp templates** (`settings.orderMessages`): add Arabic
default variants next to the current French defaults. If the owner has
customized their templates, we leave them alone.

## Files touched (rough map)

- `src/types/database.ts` — add `storeLanguage` to `StoreSettings`
- `src/lib/i18n/store.ts` — **new**: dictionary + `t()` + `getStoreLocale()`
- `src/lib/wilayas.ts` — add `ar` name per wilaya
- `src/app/(store)/layout.tsx` — set `lang` + `dir`
- `src/components/store/GoogleFontLoader.tsx` — load Tajawal in Arabic mode
- `src/components/store/OrderFormFields.tsx` — dictionary + logical utilities
- `src/components/store/StoreHomepage.tsx` — logical utilities + dictionary
- `src/components/store/LandingPageRenderer.tsx` — logical utilities + dictionary
- `src/components/store/themes/{beauty,car,home,sport,tech}/**` — logical utilities + dictionary
- `src/components/store/StandaloneProductView.tsx` — logical utilities + dictionary
- `src/components/store/StoreOrderModal.tsx` — logical utilities + dictionary
- `src/components/store/AutoCatalog.tsx`, `HeroGallery.tsx`, `ProductCardImage.tsx`, `OfferBadge.tsx`, `ProductBadgeStack.tsx` — logical utilities as needed
- `src/app/(store)/paiement/**`, `src/app/(store)/p/**` — logical utilities + dictionary
- `src/app/(platform)/onboarding/step-3/page.tsx` — language toggle
- `src/app/(platform)/dashboard/settings/page.tsx` — language card
- `src/api/ai/landing-page/route.ts` — locale-aware system prompt
- `src/lib/order-messages.ts` (or wherever the WhatsApp defaults live) — Arabic defaults

Exact file list to be produced during planning; some entries above may consolidate.

## Testing

- **Type:** `tsc --noEmit` passes; dictionary parity assertion catches missing keys.
- **Visual:** set a test store to `ar`; walk through storefront home, each of the
  5 niche themes, a landing page, product page, order form, `/merci`, on
  desktop (1280) and mobile (375). RTL layout, Tajawal font, all chrome in Arabic.
- **Order integrity:** submit an Arabic-locale order; confirm the DB stores the
  French wilaya name and the dashboard order detail renders correctly (dashboard
  stays FR/LTR).
- **AI generation:** generate a landing page while the store is `ar`; every
  string in the returned JSON is Arabic; credits deduct once (5).
- **Toggle guardrail:** flip a store with existing products from `fr` → `ar`;
  confirm the modal appears once and existing content is unchanged.
- **Regression:** existing FR-only stores render identically to today
  (default = `'fr'` when field absent).

## Migration

None (DB-side). Application code changes only.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Missed hardcoded French string in a theme → shows FR inside an AR store | Grep pass in planning phase catches literal strings; type-safe dictionary makes new strings additive. |
| Missed `ml-*`/`pl-*` in a theme → asymmetric layout in RTL | Automated codemod-style sweep during implementation + visual check per theme. |
| Tajawal fails to load → Arabic falls back to system serif | Font stack fallback: `Tajawal, 'Segoe UI', system-ui, sans-serif`. |
| Owner writes half their content in FR, half in AR | Out of scope (soft guardrail educates). |
| Courier integration receives a wilaya name in the wrong language | Stored value stays canonical French — external integrations unaffected. |
