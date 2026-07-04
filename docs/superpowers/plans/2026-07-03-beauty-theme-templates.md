# Beauty Theme Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `beauty-fashion` theme its own faithful store-homepage and landing-page templates (real data + French default copy), behind a theme dispatcher so every other theme is untouched.

**Architecture:** A registry maps theme slug → bespoke templates; two thin dispatcher components (`ThemedStoreHome`, `ThemedLanding`) resolve the active theme and fall back to the existing generic renderers. Beauty templates live under `src/components/store/themes/beauty/` and reuse the existing commerce primitives (`StoreOrderModal`, `OrderFormFields`, stock/DZD/WhatsApp helpers) unchanged.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind + inline styles, Supabase. No unit-test framework — verification is `npx tsc --noEmit`, `npx eslint`, and preview-browser checks. Not a git repo — "Checkpoint" = manual review point, no commit.

**Design tokens (Beauty):** bg `#FDEEEE`, card `#FFFFFF`, primary `#E85D5D`, secondary/gold `#E8B04A`, text `#1A1A1A`, textMuted `#6B5D5A`, border `rgba(232,93,93,0.14)`. Fonts: `Cormorant Garamond` (headings), `Jost` (body). Components read `store.theme?.config` first, falling back to these constants.

---

## File Structure

**Create:**
- `src/components/store/themes/registry.tsx` — slug → `{ StoreHome?, Landing? }` map + shared prop types.
- `src/components/store/ThemedStoreHome.tsx` — dispatcher for store home.
- `src/components/store/ThemedLanding.tsx` — dispatcher for landing.
- `src/components/store/themes/beauty/beautyDefaults.ts` — French default copy + Beauty token constants.
- `src/components/store/themes/beauty/BeautyStoreHome.tsx` — full Beauty storefront.
- `src/components/store/themes/beauty/BeautyLanding.tsx` — Beauty-skinned landing page.

**Modify (import swap only):**
- `src/app/(store)/page.tsx` — `StoreHomepage` → `ThemedStoreHome`.
- `src/app/store/page.tsx` — `StoreHomepage` → `ThemedStoreHome`.
- `src/app/(store)/p/[slug]/page.tsx` — `LandingPageRenderer` → `ThemedLanding`.
- `src/app/store/p/[slug]/page.tsx` — `LandingPageRenderer` → `ThemedLanding`.
- `src/app/(platform)/dashboard/pages/new/page.tsx` — `LandingPageRenderer` → `ThemedLanding`.

Unchanged and reused: `StoreHomepage.tsx`, `LandingPageRenderer.tsx` (become the fallbacks), `StoreOrderModal.tsx`, `OrderFormFields.tsx`, `@/lib/whatsapp`.

---

## Task 1: Dispatcher seam (no behavior change yet)

Build the registry + dispatchers with an **empty** registry, wire the routes, and prove the store still renders identically (everything falls back to generic).

**Files:**
- Create: `src/components/store/themes/registry.tsx`
- Create: `src/components/store/ThemedStoreHome.tsx`
- Create: `src/components/store/ThemedLanding.tsx`
- Modify: the 5 route files listed above.

- [ ] **Step 1: Create the registry (empty for now)**

`src/components/store/themes/registry.tsx`:
```tsx
import type { ComponentType } from 'react'
import type { Store, Product, LandingPage } from '@/types/database'

export type StoreHomeProps = { store: Store; products: Product[]; landingPages?: LandingPage[] }
export type LandingProps = { landingPage: LandingPage; store: Store }

type ThemeTemplates = {
  StoreHome?: ComponentType<StoreHomeProps>
  Landing?: ComponentType<LandingProps>
}

// Slug → bespoke templates. Absent slug → dispatcher uses the generic fallback.
export const THEME_TEMPLATES: Record<string, ThemeTemplates> = {}
```

- [ ] **Step 2: Create the store-home dispatcher**

`src/components/store/ThemedStoreHome.tsx`:
```tsx
import StoreHomepage from './StoreHomepage'
import { THEME_TEMPLATES, type StoreHomeProps } from './themes/registry'

export default function ThemedStoreHome(props: StoreHomeProps) {
  const slug = props.store.theme?.slug
  const Template = (slug && THEME_TEMPLATES[slug]?.StoreHome) || StoreHomepage
  return <Template {...props} />
}
```

- [ ] **Step 3: Create the landing dispatcher**

`src/components/store/ThemedLanding.tsx`:
```tsx
import LandingPageRenderer from './LandingPageRenderer'
import { THEME_TEMPLATES, type LandingProps } from './themes/registry'

export default function ThemedLanding(props: LandingProps) {
  const slug = props.store.theme?.slug
  const Template = (slug && THEME_TEMPLATES[slug]?.Landing) || LandingPageRenderer
  return <Template {...props} />
}
```

- [ ] **Step 4: Swap imports in the 5 route files**

In `src/app/(store)/page.tsx` and `src/app/store/page.tsx`:
- Change `import StoreHomepage from '@/components/store/StoreHomepage'` → `import ThemedStoreHome from '@/components/store/ThemedStoreHome'`
- Change the JSX tag `<StoreHomepage` → `<ThemedStoreHome` (props unchanged).

In `src/app/(store)/p/[slug]/page.tsx`, `src/app/store/p/[slug]/page.tsx`, `src/app/(platform)/dashboard/pages/new/page.tsx`:
- Change `import LandingPageRenderer from '@/components/store/LandingPageRenderer'` → `import ThemedLanding from '@/components/store/ThemedLanding'`
- Change the JSX tag `<LandingPageRenderer` → `<ThemedLanding` (props unchanged).

- [ ] **Step 5: Verify types + lint clean**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx eslint src/components/store/registry.tsx src/components/store/ThemedStoreHome.tsx src/components/store/ThemedLanding.tsx` (adjust path to `themes/registry.tsx`)
Expected: no errors.

- [ ] **Step 6: Verify no behavior change in preview**

Load `/store?store=nova`. Since registry is empty, it must render exactly as before (generic StoreHomepage). Confirm via preview `snapshot` that "Nos Produits" + product grid still render.

- [ ] **Step 7: Checkpoint** — dispatcher seam in place, nothing visually changed.

---

## Task 2: Beauty defaults + tokens

Central file for all French default copy and Beauty token constants, so the future "editable fields" pass has one swap point.

**Files:**
- Create: `src/components/store/themes/beauty/beautyDefaults.ts`

- [ ] **Step 1: Write the defaults module**

`src/components/store/themes/beauty/beautyDefaults.ts`:
```ts
export const BEAUTY_TOKENS = {
  bg: '#FDEEEE',
  card: '#FFFFFF',
  primary: '#E85D5D',
  secondary: '#E8B04A',
  text: '#1A1A1A',
  textMuted: '#6B5D5A',
  border: 'rgba(232,93,93,0.14)',
  heading: 'Cormorant Garamond',
  body: 'Jost',
} as const

export const BEAUTY_DEFAULTS = {
  navLinks: [
    { label: 'Accueil', href: '#top' },
    { label: 'Boutique', href: '#produits' },
    { label: 'À propos', href: '#apropos' },
    { label: 'Contact', href: '#contact' },
  ],
  hero: {
    kicker: 'Nouvelle collection',
    headline: 'La beauté, révélée',
    subtitle: 'Des produits soigneusement sélectionnés pour sublimer votre quotidien.',
    cta: 'Découvrir la boutique',
  },
  collections: [
    { name: 'Nouveautés', sub: 'Les dernières arrivées' },
    { name: 'Meilleures ventes', sub: 'Les préférés de nos clientes' },
    { name: 'Coffrets', sub: 'Idées cadeaux' },
  ],
  promo: [
    { kicker: 'Offre du moment', title: 'Sublimez votre routine', cta: 'Voir les produits' },
    { kicker: 'Nouveauté', title: 'À découvrir absolument', cta: 'Explorer' },
  ],
  about: {
    kicker: 'À propos',
    title: 'Une sélection pensée pour vous',
    body: 'Chaque produit est choisi avec soin pour sa qualité et son efficacité. Notre mission : vous offrir le meilleur, livré partout en Algérie.',
    stats: [
      { value: '58', label: 'Wilayas livrées' },
      { value: '100%', label: 'Paiement à la livraison' },
      { value: '24-48h', label: 'Délai de livraison' },
    ],
  },
  trust: [
    { title: 'Livraison 58 wilayas', sub: 'Partout en Algérie' },
    { title: 'Paiement à la livraison', sub: 'Vérifiez avant de payer' },
    { title: 'Qualité garantie', sub: 'Produits sélectionnés' },
    { title: 'Support 7j/7', sub: 'Une équipe à votre écoute' },
  ],
  footer: {
    tagline: 'Une beauté accessible, livrée avec soin partout en Algérie.',
    columns: [
      { title: 'Boutique', links: ['Nouveautés', 'Meilleures ventes', 'Coffrets'] },
      { title: 'Aide', links: ['Livraison', 'Paiement', 'Contact'] },
    ],
  },
} as const
```

- [ ] **Step 2: Verify types + lint**

Run: `npx tsc --noEmit` and `npx eslint src/components/store/themes/beauty/beautyDefaults.ts`
Expected: no errors.

- [ ] **Step 3: Checkpoint** — defaults ready.

---

## Task 3: BeautyStoreHome + register it

Full Beauty storefront. Client component (owns product-modal state). Reads tokens from `store.theme?.config` with `BEAUTY_TOKENS` fallback. Reuses `StoreOrderModal` for ordering and the WhatsApp helper for the header CTA.

**Files:**
- Create: `src/components/store/themes/beauty/BeautyStoreHome.tsx`
- Modify: `src/components/store/themes/registry.tsx`

- [ ] **Step 1: Scaffold component shell with tokens + fonts**

Create `BeautyStoreHome.tsx` starting with:
```tsx
'use client'

import { useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'
import StoreOrderModal from '../../StoreOrderModal'
import { toWaNumber } from '@/lib/whatsapp'
import { BEAUTY_TOKENS, BEAUTY_DEFAULTS } from './beautyDefaults'

export default function BeautyStoreHome({ store, products, landingPages = [] }: {
  store: Store; products: Product[]; landingPages?: LandingPage[]
}) {
  const [selected, setSelected] = useState<Product | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''

  const cfg = store.theme?.config
  const c = {
    bg: cfg?.colors.background ?? BEAUTY_TOKENS.bg,
    card: cfg?.colors.card ?? BEAUTY_TOKENS.card,
    primary: cfg?.colors.primary ?? BEAUTY_TOKENS.primary,
    secondary: cfg?.colors.secondary ?? BEAUTY_TOKENS.secondary,
    text: cfg?.colors.text ?? BEAUTY_TOKENS.text,
    muted: cfg?.colors.textMuted ?? BEAUTY_TOKENS.textMuted,
    border: cfg?.colors.border ?? BEAUTY_TOKENS.border,
  }
  const H: React.CSSProperties = { fontFamily: `'${cfg?.fonts?.heading ?? BEAUTY_TOKENS.heading}', serif` }
  const B: React.CSSProperties = { fontFamily: `'${cfg?.fonts?.body ?? BEAUTY_TOKENS.body}', sans-serif` }
  const fontUrl = `https://fonts.googleapis.com/css2?family=${(cfg?.fonts?.heading ?? BEAUTY_TOKENS.heading).replace(/ /g,'+')}:wght@400;500;600;700&family=${(cfg?.fonts?.body ?? BEAUTY_TOKENS.body).replace(/ /g,'+')}:wght@400;500;600;700&display=swap`

  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  const d = BEAUTY_DEFAULTS

  return (
    <div id="top" style={{ background: c.bg, color: c.text, minHeight: '100vh', ...B }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('${fontUrl}');` }} />
      {/* sections go here (Steps 2-8) */}
      {selected && <StoreOrderModal product={selected} store={store} onClose={() => setSelected(null)} />}
    </div>
  )
}
```

- [ ] **Step 2: Header + nav**

Inside the root `<div>`, add a sticky header: brand mark (`store.logo_url` or a coral tile with `store.name[0]` in `H`), `store.name` in Cormorant Garamond; desktop nav from `d.navLinks` (hidden < 900px via a `.beauty-nav` class + a `<style>` media rule); a "Commander" pill (`background: c.primary`, `href={commanderHref}`, `target/rel` only when `waNumber`).

- [ ] **Step 3: Hero (centered)**

Centered hero: kicker `d.hero.kicker` (uppercase, `c.primary`), `<h1 style={H}>` `d.hero.headline` (large serif), subtitle `d.hero.subtitle` (`c.muted`), primary CTA button (`d.hero.cta`, `href="#produits"`). To the visual: if `products[0]?.images?.[0]` exists show it in a rounded framed image on one side (2-col grid ≥ 900px, stacks below); else a blush gradient block `linear-gradient(135deg, ${c.primary}22, ${c.secondary}14)`.

- [ ] **Step 4: Collections row**

Map `d.collections` to 3 tiles (`c.card`, border `c.border`, radius 16): tile name in `H`, sub in `c.muted`, each an `<a href="#produits">`. 3-col grid ≥ 640px, 1-col below.

- [ ] **Step 5: Featured campaigns (only if `landingPages.length`)**

Port the "Offres spéciales" horizontal scroller from `StoreHomepage.tsx` (lines 97–139) restyled to Beauty tokens: each card links to `` `${storeBase}/p/${lp.slug}${qs}` ``, shows `lp.content._meta?.imageUrl ?? lp.content.hero.background_image` (fallback gradient), `lp.content.hero.headline`, and `_meta.price` as `` `${Number(price).toLocaleString('fr-DZ')} DA` ``. Keep the same guard `landingPages.length > 0`.

- [ ] **Step 6: Products grid**

`<main id="produits">`. Heading "Nos Produits" in `H`. If `products.length === 0`, render a centered French empty state ("Aucun produit disponible pour le moment." / "Revenez bientôt !"). Otherwise a responsive grid (2-col mobile → 3/4-col desktop) of product cards; each card:
```tsx
<div key={product.id} onClick={() => setSelected(product)} style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16 }} className="cursor-pointer group overflow-hidden transition-all hover:scale-[1.01]">
  <div className="aspect-square overflow-hidden relative" style={{ background: `${c.primary}0d` }}>
    {product.images?.[0]
      ? <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
      : <div className="w-full h-full flex items-center justify-center" style={{ color: c.primary }}>✦</div>}
    {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: c.primary, color: '#fff' }}>PROMO</span>}
  </div>
  <div className="p-3">
    <div style={{ color: c.secondary }} className="text-xs mb-1">★★★★★</div>
    <p className="text-sm truncate" style={{ ...H, fontWeight: 600 }}>{product.name}</p>
    <div className="flex items-center gap-2 mt-1">
      <span style={{ color: c.primary, ...H, fontWeight: 700 }}>{Number(product.price).toLocaleString('fr-DZ')} DA</span>
      {product.compare_price && <span className="text-xs line-through" style={{ color: c.muted }}>{Number(product.compare_price).toLocaleString('fr-DZ')} DA</span>}
    </div>
  </div>
  <div className="mx-3 mb-3 py-2 rounded-xl text-xs font-semibold text-center" style={{ background: `${c.primary}15`, color: c.primary, border: `1px solid ${c.primary}30` }}>Commander</div>
</div>
```

- [ ] **Step 7: Promo banners + About/stats + Trust row**

- Two promo banners from `d.promo` (2-col ≥ 900px): kicker + title (`H`) + CTA `<a href="#produits">`, each with a tinted background (`${c.primary}0d` / `${c.secondary}0d`).
- `<section id="apropos">` About: kicker, title (`H`), `store.settings?.bio ?? d.about.body`, and 3 stats from `d.about.stats` (value in `H`+`c.primary`, label in `c.muted`).
- Trust row: map `d.trust` (4 items) to a 4-col (2-col mobile) strip of `title`/`sub`.

- [ ] **Step 8: Footer (`id="contact"`)**

Brand + `d.footer.tagline`; social links from `store.settings` (reuse whatever socials the settings type exposes — render only those present); `d.footer.columns`; bottom line `© {new Date().getFullYear()} {store.name} · Propulsé par Novalux` (Novalux in `c.primary`).

- [ ] **Step 9: Responsive `<style>`**

Add one `<style>` block with media rules: `.beauty-nav { display:none }` under 900px; hero/promo 2-col grids collapse to 1-col under 900px. Mirror the approach already used in the reference file.

- [ ] **Step 10: Register the template**

Modify `src/components/store/themes/registry.tsx`:
```tsx
import BeautyStoreHome from './beauty/BeautyStoreHome'
// ...
export const THEME_TEMPLATES: Record<string, ThemeTemplates> = {
  'beauty-fashion': { StoreHome: BeautyStoreHome },
}
```

- [ ] **Step 11: Verify**

Run: `npx tsc --noEmit` and `npx eslint src/components/store/themes/beauty/BeautyStoreHome.tsx src/components/store/themes/registry.tsx`
Expected: no errors.
Preview: load `/store?store=nova`. Verify via `inspect`/`snapshot`: root bg `rgb(253,238,238)`, an `h1` in Cormorant Garamond, product grid present, clicking a product opens `StoreOrderModal`. Screenshot for the user.

- [ ] **Step 12: Checkpoint** — Beauty store home live on `nova`.

---

## Task 4: BeautyLanding + register it

Beauty-skinned landing that renders the same content model as `LandingPageRenderer` and preserves every behavior (language toggle, hero gallery, stock gating, plan gates, lead capture, inline `OrderFormFields`, upsell).

**Files:**
- Create: `src/components/store/themes/beauty/BeautyLanding.tsx`
- Modify: `src/components/store/themes/registry.tsx`

- [ ] **Step 1: Copy `LandingPageRenderer.tsx` to `BeautyLanding.tsx` as the starting point**

Duplicate the full file to `src/components/store/themes/beauty/BeautyLanding.tsx`, rename the default export to `BeautyLanding`, and fix the relative imports (`./OrderFormFields` → `../../OrderFormFields`, `./StoreOrderModal` → `../../StoreOrderModal`, `@/lib/whatsapp` stays). This guarantees identical behavior before restyling.

- [ ] **Step 2: Apply Beauty tokens + fonts**

At the top of the component, replace the token block so it prefers `store.theme?.config` then `BEAUTY_TOKENS` (import from `./beautyDefaults`). Change the hardcoded `headingFont` for the LTR case from `'Sora'` to `'${BEAUTY_TOKENS.heading}'` (keep `'Cairo'` for Arabic/RTL). Update the font `@import` to load `Cormorant Garamond` + `Jost` + `Cairo` (keep Cairo for AR).

- [ ] **Step 3: Restyle headings to serif**

Ensure every heading uses the Beauty heading font in LTR: the hero `<h1>`, section titles ("Détails du produit", "Ce que disent nos clients", order-form title). They already read `headingFont`; confirm `headingFont` now resolves to Cormorant Garamond in FR. Soften cards to the luxury look (radius already 2xl; border `c.border`; card `c.card`). No logic edits.

- [ ] **Step 4: Register the template**

Modify `src/components/store/themes/registry.tsx`:
```tsx
import BeautyLanding from './beauty/BeautyLanding'
// ...
'beauty-fashion': { StoreHome: BeautyStoreHome, Landing: BeautyLanding },
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit` and `npx eslint src/components/store/themes/beauty/BeautyLanding.tsx src/components/store/themes/registry.tsx`
Expected: no errors.
Preview: find an existing `beauty-fashion` landing page slug for `nova` (query `landing_pages` if needed) and load `/store/p/<slug>?store=nova`. Verify Cormorant Garamond headings, blush bg, order form renders, stock message correct, footer present. Confirm the order form still submits fields (do NOT place a real order — just confirm the form + wilaya dropdown render).

- [ ] **Step 6: Checkpoint** — Beauty landing live.

---

## Task 5: Regression + sign-off

**Files:** none (verification only).

- [ ] **Step 1: Non-Beauty regression**

Temporarily point a check at a non-Beauty theme: confirm a store whose theme slug is NOT `beauty-fashion` still renders the generic `StoreHomepage`/`LandingPageRenderer`. If only `nova` exists, verify by reasoning + the dispatcher fallback (registry has only `beauty-fashion`), and confirm the generic files are unchanged (`git`-less: they were never edited in Tasks 1–4).

- [ ] **Step 2: Full type + lint sweep**

Run: `npx tsc --noEmit`
Run: `npx eslint src/components/store/**/*.tsx`
Expected: no errors.

- [ ] **Step 3: Final preview proof**

Screenshot the Beauty store home and Beauty landing for the user.

- [ ] **Step 4: Checkpoint** — reference theme complete; ready to replicate for tech/sport/car/home.

---

## Self-Review

**Spec coverage:** dispatcher+registry (Task 1) ✓; French defaults/Choice B (Task 2) ✓; store-home slot mapping incl. dropped brand marquee + decorative collections + defaults (Task 3) ✓; landing restyle preserving stock/upsell/lead/plan-gates (Task 4) ✓; verification without paid AI + regression (Tasks 3/4/5) ✓. Featured-campaigns preservation ✓ (Task 3 Step 5).

**Placeholder scan:** token values, French strings, and reused code paths are concrete. Decorative sections (Steps 2,3,4,7,8) specify exact source data (`d.*`), tokens, and layout rather than full JSX — acceptable given they are compositions of the already-shown card/section patterns; no "TODO/handle edge cases" left.

**Type consistency:** `StoreHomeProps`/`LandingProps` (registry) match `StoreHomepage`/`LandingPageRenderer` signatures. `BEAUTY_TOKENS`/`BEAUTY_DEFAULTS` names consistent across Tasks 2–4. `store.theme?.slug` and `store.theme?.config` match the `Store`→`Theme` type used in existing renderers.
