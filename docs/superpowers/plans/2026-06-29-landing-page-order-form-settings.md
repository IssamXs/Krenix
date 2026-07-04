# Landing Page Order Form + Visual Redesign + Settings + Pro Features

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed an inline order form in AI-generated landing pages, redesign them to ayor.ai visual quality, extend the settings page, add a Puppeteer ad-image generator, scaffold Pro feature shells, and add a Basic theme changer.

**Architecture:** Shared `OrderFormFields` component used by both `StoreOrderModal` and the inline landing page form. `LandingPageRenderer` fully redesigned with full-bleed hero, Cairo/Sora fonts, trust bar, and plan-based extras. Puppeteer runs server-side via `@sparticuz/chromium` in a Next.js API route. All Pro/Ultimate feature shells use proper empty states — no blank pages.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Tailwind CSS, Supabase, `@sparticuz/chromium` + `puppeteer-core`

---

## File Map

**Create:**
- `src/components/store/OrderFormFields.tsx` — shared order form fields used by both modal and inline
- `src/lib/ad-templates/template-dark.html` — Puppeteer dark ad template
- `src/lib/ad-templates/template-light.html` — Puppeteer light ad template
- `src/lib/ad-templates/template-dramatic.html` — Puppeteer dramatic ad template
- `src/app/api/ai/generate-photo/route.ts` — POST endpoint, renders HTML→JPG
- `src/app/(platform)/dashboard/analytics/page.tsx` — shell
- `src/app/(platform)/dashboard/integrations/page.tsx` — integrations overview shell
- `src/app/(platform)/dashboard/integrations/delivery/page.tsx` — shell
- `src/app/(platform)/dashboard/integrations/sheets/page.tsx` — shell
- `src/app/(platform)/dashboard/integrations/gtm/page.tsx` — shell
- `src/app/(platform)/dashboard/integrations/abandoned-cart/page.tsx` — shell
- `src/app/(platform)/dashboard/themes/page.tsx` — Basic theme changer shell

**Modify:**
- `src/types/database.ts` — add `bio`, `email`, `address`, `bannerUrl`, `tiktok`, `snapchat`, `youtube` to `StoreSettings`
- `src/components/store/StoreOrderModal.tsx` — delegate form to `OrderFormFields`
- `src/components/store/LandingPageRenderer.tsx` — full visual redesign + inline form
- `src/app/(platform)/dashboard/settings/page.tsx` — bio, email, address, banner upload, TikTok, Snapchat, YouTube
- `src/app/(platform)/dashboard/layout.tsx` — add Analytiques, Intégrations, Thèmes nav items
- `src/app/(platform)/dashboard/pages/[id]/page.tsx` — add "Générer une image pub" section

---

## Task 1: Extend StoreSettings type

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Add optional fields to `StoreSettings` interface**

In `src/types/database.ts`, replace the `StoreSettings` interface with:

```ts
export interface StoreSettings {
  primaryColor: string
  secondaryColor: string
  fontFamily: string
  borderRadius: string
  whatsapp: string
  facebook: string
  instagram: string
  tiktok?: string
  snapchat?: string
  youtube?: string
  bio?: string
  email?: string
  address?: string
  bannerUrl?: string
  deliveryPrice: number
  freeDeliveryThreshold: number
  welcomeMessage: string
  deliveryRates?: { default: number; [wilaya: string]: number }
  financialSettings?: {
    returnFee: number
    purchasePrices: Record<string, number>
    adsBudgets: Record<string, number>
    globalAdsBudget: number
  }
}
```

- [ ] **Verify TypeScript compiles**

```bash
cd "C:\Users\pC\Desktop\landing page lucky2" && npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Commit**

```bash
git add src/types/database.ts
git commit -m "feat: extend StoreSettings with social + business identity fields"
```

---

## Task 2: Extract OrderFormFields shared component

**Files:**
- Create: `src/components/store/OrderFormFields.tsx`

- [ ] **Create the file**

```tsx
'use client'

import { useState } from 'react'
import type { Product, Store } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { WILAYAS } from '@/lib/wilayas'
import { Loader2, CheckCircle, ShoppingBag, Truck } from 'lucide-react'

function validateAlgerianPhone(phone: string) {
  const digits = phone.replace(/\s/g, '')
  return /^(05|06|07)\d{8}$/.test(digits)
}

interface Props {
  product: Product | null
  store: Store
  landingPageId?: string
  overridePrice?: number
  isRTL?: boolean
  onSuccess?: () => void
}

export default function OrderFormFields({ product, store, landingPageId, overridePrice, isRTL = false, onSuccess }: Props) {
  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const bg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const unitPrice = product?.price ?? overridePrice ?? 0

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    wilaya: '',
    commune: '',
    color: product?.colors?.[0] ?? '',
    size: product?.sizes?.[0] ?? '',
    quantity: 1,
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const rates = store.settings?.deliveryRates
  const wilayaRate = form.wilaya && rates
    ? (rates[form.wilaya] ?? rates.default ?? Number(store.settings?.deliveryPrice ?? 600))
    : (rates?.default ?? Number(store.settings?.deliveryPrice ?? 600))
  const subtotal = unitPrice * form.quantity
  const finalDelivery = form.wilaya ? wilayaRate : 0
  const total = subtotal + finalDelivery

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${border}`,
    color: text, outline: 'none', fontSize: '14px',
  } as const

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { setError(isRTL ? 'الاسم مطلوب' : 'Le nom est requis.'); return }
    if (!validateAlgerianPhone(form.customer_phone)) { setError(isRTL ? 'رقم الهاتف غير صحيح (05/06/07 + 8 أرقام)' : 'Numéro invalide (05/06/07 + 8 chiffres).'); return }
    if (!form.wilaya) { setError(isRTL ? 'الولاية مطلوبة' : 'La wilaya est requise.'); return }
    if (!form.commune.trim()) { setError(isRTL ? 'البلدية مطلوبة' : 'La commune est requise.'); return }

    setSubmitting(true)
    setError('')
    const supabase = createClient()
    const { error: insertError } = await supabase.from('orders').insert({
      store_id: store.id,
      product_id: product?.id ?? null,
      landing_page_id: landingPageId ?? null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      wilaya: form.wilaya,
      commune: form.commune,
      color: form.color || null,
      size: form.size || null,
      quantity: form.quantity,
      unit_price: unitPrice,
      delivery_price: finalDelivery,
      total_price: total,
      status: 'pending',
      source: landingPageId ? 'landing_page' : 'form',
      notes: form.notes || null,
    })

    if (insertError) { setError(isRTL ? 'حدث خطأ. حاول مرة أخرى.' : 'Erreur lors de la commande. Réessayez.'); setSubmitting(false); return }
    setSuccess(true)
    setSubmitting(false)
    onSuccess?.()
  }

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `${primary}20` }}>
          <CheckCircle size={32} style={{ color: primary }} />
        </div>
        <div>
          <p className="font-bold text-lg" style={{ color: text }}>
            {isRTL ? 'تم تأكيد طلبك!' : 'Commande confirmée !'}
          </p>
          <p className="text-sm mt-1" style={{ color: textMuted }}>
            {isRTL
              ? `شكراً ${form.customer_name.split(' ')[0]}! سنتصل بك على ${form.customer_phone}`
              : `Merci ${form.customer_name.split(' ')[0]} ! Nous vous contacterons au ${form.customer_phone}.`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {product?.colors && product.colors.length > 0 && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'اللون' : 'Couleur'}
          </label>
          <select value={form.color} onChange={set('color')} style={inputStyle}>
            {product.colors.map(c => <option key={c} value={c} style={{ background: bg }}>{c}</option>)}
          </select>
        </div>
      )}

      {product?.sizes && product.sizes.length > 0 && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'المقاس' : 'Taille'}
          </label>
          <select value={form.size} onChange={set('size')} style={inputStyle}>
            {product.sizes.map(s => <option key={s} value={s} style={{ background: bg }}>{s}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'الكمية' : 'Quantité'}
        </label>
        <div className="flex items-center gap-3">
          <button onClick={() => setForm(f => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
            className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold hover:opacity-70"
            style={{ borderColor: border, color: text }}>−</button>
          <span className="text-lg font-bold w-8 text-center" style={{ color: text }}>{form.quantity}</span>
          <button onClick={() => setForm(f => ({ ...f, quantity: Math.min(product?.stock ?? 999, f.quantity + 1) }))}
            className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold hover:opacity-70"
            style={{ borderColor: border, color: text }}>+</button>
        </div>
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'الاسم الكامل *' : 'Nom complet *'}
        </label>
        <input value={form.customer_name} onChange={set('customer_name')}
          placeholder={isRTL ? 'أميرة بن علي' : 'Amira Benali'} style={inputStyle} />
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'رقم الهاتف *' : 'Téléphone *'}
        </label>
        <input type="tel" value={form.customer_phone} onChange={set('customer_phone')}
          placeholder="0555 XX XX XX" style={inputStyle} />
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'الولاية *' : 'Wilaya *'}
        </label>
        <select value={form.wilaya} onChange={set('wilaya')} style={inputStyle}>
          <option value="" style={{ background: bg }}>{isRTL ? 'اختر ولايتك' : 'Sélectionner votre wilaya'}</option>
          {WILAYAS.map(w => <option key={w} value={w} style={{ background: bg }}>{w}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'البلدية *' : 'Commune *'}
        </label>
        <input value={form.commune} onChange={set('commune')}
          placeholder={isRTL ? 'بلديتك' : 'Votre commune'} style={inputStyle} />
      </div>

      <div className="rounded-xl p-4 space-y-2" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${border}` }}>
        <div className="flex justify-between text-sm" style={{ color: textMuted }}>
          <span>{isRTL ? `المجموع الجزئي (${form.quantity} × ${Number(unitPrice).toLocaleString('fr-DZ')} دج)` : `Sous-total (${form.quantity} × ${Number(unitPrice).toLocaleString('fr-DZ')} DA)`}</span>
          <span style={{ color: text }}>{subtotal.toLocaleString('fr-DZ')} DA</span>
        </div>
        <div className="flex justify-between text-sm" style={{ color: textMuted }}>
          <span className="flex items-center gap-1.5"><Truck size={13} /> {isRTL ? 'التوصيل' : 'Livraison'}</span>
          <span style={{ color: text }}>{form.wilaya ? `${finalDelivery.toLocaleString('fr-DZ')} DA` : '—'}</span>
        </div>
        <div className="flex justify-between font-bold text-lg pt-1" style={{ borderTop: `1px solid ${border}`, color: text }}>
          <span>{isRTL ? 'المجموع' : 'Total'}</span>
          <span style={{ color: primary }}>{total.toLocaleString('fr-DZ')} DA</span>
        </div>
      </div>

      <button onClick={handleSubmit} disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
        style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, color: bg, boxShadow: `0 8px 24px ${primary}40` }}>
        {submitting
          ? <Loader2 size={18} className="animate-spin" />
          : <><ShoppingBag size={18} /> {isRTL ? `اطلب الآن — ${total.toLocaleString('fr-DZ')} دج` : `Commander — ${total.toLocaleString('fr-DZ')} DA`}</>}
      </button>
    </div>
  )
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: 0 errors.

- [ ] **Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat: extract OrderFormFields shared component"
```

---

## Task 3: Refactor StoreOrderModal to use OrderFormFields

**Files:**
- Modify: `src/components/store/StoreOrderModal.tsx`

- [ ] **Replace StoreOrderModal with a thin wrapper**

Replace the entire contents of `src/components/store/StoreOrderModal.tsx` with:

```tsx
'use client'

import type { Product, Store } from '@/types/database'
import { X } from 'lucide-react'
import OrderFormFields from './OrderFormFields'

interface Props {
  product: Product
  store: Store
  onClose: () => void
}

export default function StoreOrderModal({ product, store, onClose }: Props) {
  const theme = store.theme?.config
  const bg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'
  const primary = theme?.colors.primary ?? '#3B82F6'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: bg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-3">
            {product.images?.[0] && (
              <img src={product.images[0]} alt={product.name} className="w-10 h-10 rounded-xl object-cover" />
            )}
            <div>
              <p className="font-semibold text-sm" style={{ color: text }}>{product.name}</p>
              <p className="text-xs font-bold" style={{ color: primary }}>{Number(product.price).toLocaleString('fr-DZ')} DA</p>
            </div>
          </div>
          <button onClick={onClose} style={{ color: textMuted }} className="hover:opacity-70 transition-opacity">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <OrderFormFields product={product} store={store} onSuccess={onClose} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/components/store/StoreOrderModal.tsx
git commit -m "refactor: StoreOrderModal delegates to OrderFormFields"
```

---

## Task 4: Redesign LandingPageRenderer (ayor.ai quality + inline form)

**Files:**
- Modify: `src/components/store/LandingPageRenderer.tsx`

- [ ] **Replace LandingPageRenderer with the new design**

Replace the entire file contents with:

```tsx
'use client'

import { useState, useEffect } from 'react'
import type { LandingPage, Store, LandingPageCoreContent } from '@/types/database'
import { Star, Shield, Truck, Zap, Package, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import OrderFormFields from './OrderFormFields'
import StoreOrderModal from './StoreOrderModal'

interface Props {
  landingPage: LandingPage
  store: Store
}

const ICON_MAP: Record<string, React.ReactNode> = {
  shield: <Shield size={20} />,
  star: <Star size={20} />,
  truck: <Truck size={20} />,
  zap: <Zap size={20} />,
  package: <Package size={20} />,
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={14} className={i <= rating ? 'fill-amber-400 text-amber-400' : 'text-gray-600'} />
      ))}
    </div>
  )
}

function CountdownTimer({ primary, bg, isRTL }: { primary: string; bg: string; isRTL: boolean }) {
  const [secs, setSecs] = useState(86400)
  useEffect(() => {
    const t = setInterval(() => setSecs(s => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [])
  const h = Math.floor(secs / 3600).toString().padStart(2, '0')
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0')
  const s = (secs % 60).toString().padStart(2, '0')
  return (
    <div className="flex items-center justify-center gap-2 my-2">
      {[h, m, s].map((val, i) => (
        <span key={i} className="flex items-center gap-1">
          <span className="px-3 py-2 rounded-xl font-black text-xl tabular-nums"
            style={{ background: primary, color: bg }}>{val}</span>
          {i < 2 && <span className="font-black text-xl" style={{ color: primary }}>:</span>}
        </span>
      ))}
    </div>
  )
}

const RECENT_CLIENTS = [
  'Amira — Oran', 'Mohamed — Alger', 'Sara — Constantine', 'Yacine — Blida',
  'Nadia — Sétif', 'Karim — Annaba', 'Fatima — Tizi Ouzou', 'Riad — Béjaïa',
]

export default function LandingPageRenderer({ landingPage, store }: Props) {
  const [openSection, setOpenSection] = useState<number | null>(0)
  const [showModal, setShowModal] = useState(false)

  const theme = store.theme?.config
  const bg = theme?.colors.background ?? '#0A0A0F'
  const card = theme?.colors.card ?? '#111118'
  const primary = theme?.colors.primary ?? '#F59E0B'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const raw = landingPage.content
  const meta = raw._meta
  const hasAr = !!raw._ar
  const isArOnly = meta?.lang === 'ar'
  const [activeLang, setActiveLang] = useState<'fr' | 'ar'>(isArOnly ? 'ar' : 'fr')
  const isRTL = activeLang === 'ar'
  const c: LandingPageCoreContent = (activeLang === 'ar' && raw._ar) ? raw._ar : raw

  const plan = store.plan
  const isPro = plan === 'pro' || plan === 'ultimate' || plan === 'sur_mesure'
  const isUltimate = plan === 'ultimate' || plan === 'sur_mesure'

  const product = landingPage.product
  const heroImage = product?.images?.[0] ?? meta?.imageUrl ?? raw.hero.background_image ?? null
  const comparePrice = product?.compare_price ?? null
  const displayPrice = product?.price ?? meta?.price ?? 0

  const fontImport = `
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Sora:wght@400;600;800&display=swap');
  `
  const headingFont = isRTL ? "'Cairo', sans-serif" : "'Sora', sans-serif"
  const bodyFont = isRTL ? "'Cairo', sans-serif" : "'Sora', sans-serif"

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}
      style={{ background: bg, color: text, minHeight: '100vh', fontFamily: bodyFont }}>

      <style>{fontImport}</style>

      {/* Sticky header */}
      <header className="sticky top-0 z-20 px-4 py-3"
        style={{ background: `${card}ee`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${border}` }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name} className="w-7 h-7 rounded-lg object-contain" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: primary }}><Zap size={12} style={{ color: bg }} /></div>}
            <span className="font-semibold text-sm">{store.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasAr && !isArOnly && (
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: border }}>
                <button onClick={() => setActiveLang('fr')}
                  className="px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{ background: activeLang === 'fr' ? primary : 'transparent', color: activeLang === 'fr' ? bg : textMuted }}>FR</button>
                <button onClick={() => setActiveLang('ar')}
                  className="px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{ background: activeLang === 'ar' ? primary : 'transparent', color: activeLang === 'ar' ? bg : textMuted }}>عربي</button>
              </div>
            )}
            <a href="#order-form"
              className="px-4 py-2 rounded-xl text-xs font-black transition-all hover:opacity-90 active:scale-95"
              style={{ background: primary, color: bg }}>
              {c.hero.cta_text}
            </a>
          </div>
        </div>
      </header>

      {/* HERO — full bleed */}
      <section className="relative overflow-hidden" style={{ minHeight: 480 }}>
        {heroImage
          ? <img src={heroImage} alt={meta?.productName ?? product?.name ?? ''}
              className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${primary}30, ${bg})` }} />}
        {/* gradient overlay */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.82) 100%)' }} />

        <div className="relative z-10 max-w-2xl mx-auto px-5 pt-12 pb-10">
          {/* Urgency */}
          {c.urgency && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-xs font-bold"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
              <AlertTriangle size={12} /> {c.urgency.text}
            </div>
          )}

          <h1 className="text-4xl font-black leading-tight mb-3 text-white drop-shadow-lg"
            style={{ fontFamily: headingFont, textShadow: '0 2px 20px rgba(0,0,0,0.5)' }}>
            {c.hero.headline}
          </h1>
          <p className="text-base mb-6 text-white/80">{c.hero.subheadline}</p>

          {/* Price badge */}
          <div className="flex items-center gap-3 mb-6">
            <span className="px-5 py-2.5 rounded-2xl font-black text-2xl"
              style={{ background: primary, color: bg, boxShadow: `0 4px 20px ${primary}60` }}>
              {Number(displayPrice).toLocaleString('fr-DZ')} DA
            </span>
            {comparePrice && (
              <span className="text-lg line-through text-white/50">
                {Number(comparePrice).toLocaleString('fr-DZ')} DA
              </span>
            )}
          </div>

          <a href="#order-form"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-base transition-all hover:opacity-90 active:scale-95 shadow-2xl"
            style={{ background: primary, color: bg, boxShadow: `0 8px 30px ${primary}50` }}>
            {c.hero.cta_text} ←
          </a>

          <p className="text-xs mt-3 text-white/60">
            {isRTL ? '🚚 التوصيل إلى جميع ولايات الجزائر الـ 58' : '🚚 Livraison partout en Algérie — 58 wilayas'}
          </p>
        </div>
      </section>

      {/* Trust bar */}
      <div className="px-4 py-4" style={{ background: card, borderBottom: `1px solid ${border}` }}>
        <div className="max-w-2xl mx-auto grid grid-cols-3 gap-2 text-center">
          {[
            { icon: '✅', fr: 'Paiement\nà la livraison', ar: 'الدفع\nعند الاستلام' },
            { icon: '🚚', fr: 'Livraison\n58 wilayas', ar: 'توصيل\n58 ولاية' },
            { icon: '🔒', fr: 'Qualité\ngarantie', ar: 'ضمان\nالجودة' },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <span className="text-xl">{item.icon}</span>
              <span className="text-xs font-semibold whitespace-pre-line leading-tight" style={{ color: text }}>
                {isRTL ? item.ar : item.fr}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4">

        {/* Pro: countdown timer */}
        {isPro && c.urgency && (
          <div className="mt-6 p-4 rounded-2xl text-center" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-red-400 text-sm font-bold mb-2">
              {isRTL ? '⚡ العرض ينتهي خلال:' : '⚡ Offre expire dans :'}
            </p>
            <CountdownTimer primary={primary} bg={bg} isRTL={isRTL} />
          </div>
        )}

        {/* Ultimate: Recent clients ticker */}
        {isUltimate && (
          <div className="mt-4 overflow-hidden rounded-xl py-2 px-4" style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
            <div className="flex gap-6 animate-marquee whitespace-nowrap" style={{ animationDuration: '18s' }}>
              {[...RECENT_CLIENTS, ...RECENT_CLIENTS].map((client, i) => (
                <span key={i} className="text-xs font-medium flex-shrink-0" style={{ color: primary }}>
                  🛍️ {client} {isRTL ? 'طلب للتو' : 'vient de commander'}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Image thumbnails */}
        {product && product.images.length > 1 && (
          <div className="flex gap-2 mt-6 justify-center flex-wrap">
            {product.images.slice(1, 5).map((img, i) => (
              <div key={i} className="w-16 h-16 rounded-xl overflow-hidden border-2" style={{ borderColor: border }}>
                <img src={img} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        )}

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
                  <p className="font-bold text-sm mb-1" style={{ color: text, fontFamily: headingFont }}>{benefit.title}</p>
                  <p className="text-xs leading-relaxed" style={{ color: textMuted }}>{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Product details accordion */}
        {c.product_details.sections.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black mb-4" style={{ color: text, fontFamily: headingFont }}>
              {isRTL ? 'تفاصيل المنتج' : 'Détails du produit'}
            </h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
              {c.product_details.sections.map((section, i) => (
                <div key={i} style={{ borderBottom: i < c.product_details.sections.length - 1 ? `1px solid ${border}` : undefined }}>
                  <button onClick={() => setOpenSection(openSection === i ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:opacity-80"
                    style={{ background: card, color: text }}>
                    <span className="font-semibold text-sm">{section.title}</span>
                    {openSection === i ? <ChevronUp size={16} style={{ color: textMuted }} /> : <ChevronDown size={16} style={{ color: textMuted }} />}
                  </button>
                  {openSection === i && (
                    <div className="px-5 pb-4 pt-2 text-sm leading-relaxed" style={{ background: `${card}80`, color: textMuted }}>
                      {section.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

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

        {/* INLINE ORDER FORM */}
        <section id="order-form" className="mb-12 p-6 rounded-3xl scroll-mt-20"
          style={{ background: `${primary}08`, border: `2px solid ${primary}30` }}>
          <h2 className="text-2xl font-black mb-1 text-center" style={{ color: text, fontFamily: headingFont }}>
            {c.order_form.title}
          </h2>
          <p className="text-sm mb-6 text-center" style={{ color: textMuted }}>
            {isRTL ? '🚚 اطلب الآن والدفع عند الاستلام' : '🚚 Commandez maintenant — Paiement à la livraison'}
          </p>
          <OrderFormFields
            product={product ?? null}
            store={store}
            landingPageId={landingPage.id}
            overridePrice={displayPrice}
            isRTL={isRTL}
          />
        </section>

      </div>

      <footer className="py-6 text-center px-4" style={{ borderTop: `1px solid ${border}` }}>
        <p className="text-xs" style={{ color: textMuted }}>
          © {new Date().getFullYear()} {store.name} · {isRTL ? 'مدعوم بـ' : 'Propulsé par'}{' '}
          <span style={{ color: primary }}>Novalux</span>
        </p>
      </footer>

      {/* Pro: sticky mobile bottom bar */}
      {isPro && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-3 sm:hidden"
          style={{ background: `${card}f0`, backdropFilter: 'blur(12px)', borderTop: `1px solid ${border}` }}>
          <a href="#order-form"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-black text-sm"
            style={{ background: primary, color: bg }}>
            {isRTL ? `اطلب الآن — ${Number(displayPrice).toLocaleString('fr-DZ')} دج` : `Commander — ${Number(displayPrice).toLocaleString('fr-DZ')} DA`}
          </a>
        </div>
      )}

      {/* WhatsApp fallback when no product and no price */}
      {showModal && !product && !displayPrice && store.settings?.whatsapp && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70" onClick={() => setShowModal(false)}>
          <div className="w-full max-w-sm rounded-3xl p-6 text-center" style={{ background: card }} onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg mb-2" style={{ color: text }}>
              {isRTL ? 'للطلب عبر واتساب' : 'Commander via WhatsApp'}
            </p>
            <a href={`https://wa.me/${store.settings.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(isRTL ? `أريد الطلب: ${c.hero.headline}` : `Je veux commander: ${c.hero.headline}`)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-3 mt-4 rounded-2xl font-bold text-sm"
              style={{ background: '#25D366', color: '#fff' }}>
              WhatsApp →
            </a>
          </div>
        </div>
      )}

      {/* Product modal fallback (StoreHomepage product cards still use modal) */}
      {showModal && product && (
        <StoreOrderModal product={product} store={store} onClose={() => setShowModal(false)} />
      )}

    </div>
  )
}
```

- [ ] **Add marquee animation to tailwind config**

In `tailwind.config.ts` (or `tailwind.config.js`), add to the `extend` block:

```ts
extend: {
  // ...existing...
  animation: {
    marquee: 'marquee 18s linear infinite',
  },
  keyframes: {
    marquee: {
      '0%': { transform: 'translateX(0%)' },
      '100%': { transform: 'translateX(-50%)' },
    },
  },
},
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/components/store/LandingPageRenderer.tsx tailwind.config.ts
git commit -m "feat: redesign LandingPageRenderer with ayor.ai quality + inline order form"
```

---

## Task 5: Extend settings page

**Files:**
- Modify: `src/app/(platform)/dashboard/settings/page.tsx`

- [ ] **Add new form fields to state and handlers**

At the top of the component, extend the `form` state:

```ts
const [form, setForm] = useState({
  name: '',
  whatsapp: '',
  facebook: '',
  instagram: '',
  tiktok: '',
  snapchat: '',
  youtube: '',
  welcomeMessage: '',
  bio: '',
  email: '',
  address: '',
})
```

In `useEffect`, update the `setForm` call:

```ts
setForm({
  name: data.name,
  whatsapp: data.settings?.whatsapp ?? '',
  facebook: data.settings?.facebook ?? '',
  instagram: data.settings?.instagram ?? '',
  tiktok: data.settings?.tiktok ?? '',
  snapchat: data.settings?.snapchat ?? '',
  youtube: data.settings?.youtube ?? '',
  welcomeMessage: data.settings?.welcomeMessage ?? '',
  bio: data.settings?.bio ?? '',
  email: data.settings?.email ?? '',
  address: data.settings?.address ?? '',
})
```

In `handleSave`, extend the settings update:

```ts
settings: {
  ...store.settings,
  whatsapp: form.whatsapp,
  facebook: form.facebook,
  instagram: form.instagram,
  tiktok: form.tiktok,
  snapchat: form.snapchat,
  youtube: form.youtube,
  welcomeMessage: form.welcomeMessage,
  bio: form.bio,
  email: form.email,
  address: form.address,
  deliveryRates,
  deliveryPrice: deliveryRates.default ?? 600,
  freeDeliveryThreshold: store.settings?.freeDeliveryThreshold ?? 0,
},
```

- [ ] **Add banner upload state and handler**

Add after the `[saving, setSaved, loading]` state declarations:

```ts
const [bannerUploading, setBannerUploading] = useState(false)
const [bannerUrl, setBannerUrl] = useState<string>('')

// In useEffect, after setForm:
setBannerUrl(data.settings?.bannerUrl ?? '')
```

Add the upload handler before the `return`:

```ts
const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file || !store) return
  setBannerUploading(true)
  const supabase = createClient()
  const ext = file.name.split('.').pop()
  const path = `${store.id}/banner.${ext}`
  const { error: upErr } = await supabase.storage.from('store-logos').upload(path, file, { upsert: true })
  if (upErr) { setBannerUploading(false); return }
  const { data: urlData } = supabase.storage.from('store-logos').getPublicUrl(path)
  const url = urlData.publicUrl
  setBannerUrl(url)
  await supabase.from('stores').update({ settings: { ...store.settings, bannerUrl: url } }).eq('id', store.id)
  setBannerUploading(false)
}
```

- [ ] **Add new UI sections before the delivery section**

After the "Réseaux sociaux" closing `</div>`, add:

```tsx
{/* Identité de la boutique */}
<div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
  <h3 className="text-white font-medium">Identité de la boutique</h3>
  <div>
    <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Bio / Description</label>
    <textarea value={form.bio} onChange={set('bio')} rows={3} maxLength={200}
      placeholder="Boutique spécialisée dans..."
      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all resize-none text-sm" />
    <p className="text-xs text-gray-600 mt-1">{form.bio.length}/200 caractères</p>
  </div>
  <div>
    <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Email professionnel</label>
    <input type="email" value={form.email} onChange={set('email')} placeholder="contact@maboutique.dz"
      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all" />
  </div>
  <div>
    <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Adresse physique (optionnel)</label>
    <input value={form.address} onChange={set('address')} placeholder="Rue Didouche Mourad, Alger"
      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all" />
  </div>
  <div>
    <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Bannière boutique (1200×400px)</label>
    {bannerUrl && (
      <div className="mb-3 rounded-xl overflow-hidden" style={{ maxHeight: 120 }}>
        <img src={bannerUrl} alt="Bannière" className="w-full object-cover" />
      </div>
    )}
    <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-white/20 text-gray-400 text-sm cursor-pointer hover:border-[#3B82F6]/50 transition-all">
      {bannerUploading ? <><span className="w-4 h-4 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" /> Envoi...</> : '📷 Choisir une image'}
      <input type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
    </label>
  </div>
</div>
```

- [ ] **Extend Réseaux sociaux section with TikTok, Snapchat, YouTube**

Replace the social section's field array:

```tsx
{[
  { key: 'whatsapp',  label: 'WhatsApp',  placeholder: '0555123456' },
  { key: 'facebook',  label: 'Facebook',  placeholder: 'facebook.com/maboutique' },
  { key: 'instagram', label: 'Instagram', placeholder: '@maboutique' },
  { key: 'tiktok',    label: 'TikTok',    placeholder: '@maboutique' },
  { key: 'snapchat',  label: 'Snapchat',  placeholder: '@maboutique' },
  { key: 'youtube',   label: 'YouTube',   placeholder: 'youtube.com/@maboutique' },
].map(({ key, label, placeholder }) => (
  <div key={key}>
    <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">{label}</label>
    <input value={form[key as keyof typeof form]} onChange={set(key as keyof typeof form)} placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all" />
  </div>
))}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/app/(platform)/dashboard/settings/page.tsx
git commit -m "feat: extend settings page with bio, email, address, banner, TikTok, Snapchat, YouTube"
```

---

## Task 6: Install Puppeteer dependencies + create HTML templates

**Files:**
- Create: `src/lib/ad-templates/template-dark.html`
- Create: `src/lib/ad-templates/template-light.html`
- Create: `src/lib/ad-templates/template-dramatic.html`

- [ ] **Install dependencies**

```bash
npm install @sparticuz/chromium puppeteer-core
```

Expected: packages added to `node_modules`, `package.json` updated.

- [ ] **Create template-dark.html**

Create `src/lib/ad-templates/template-dark.html`:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: var(--width, 1080px);
    height: var(--height, 1080px);
    background: #0A0A0F;
    font-family: 'Cairo', Arial, sans-serif;
    overflow: hidden;
    position: relative;
    direction: rtl;
  }
  .product-img {
    position: absolute;
    right: 0; top: 0;
    width: 55%; height: 100%;
    object-fit: cover;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to right, rgba(10,10,15,1) 45%, rgba(10,10,15,0.3) 100%);
  }
  .content {
    position: absolute;
    left: 0; top: 0; bottom: 0;
    width: 52%;
    padding: 60px 50px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .store-name {
    font-size: 22px; color: #9CA3AF; font-weight: 400; margin-bottom: 20px;
  }
  .headline {
    font-size: 56px; font-weight: 900; color: #FFFFFF; line-height: 1.15;
    margin-bottom: 20px;
  }
  .price-badge {
    display: inline-flex; align-items: center;
    background: var(--primary, #F59E0B);
    color: #0A0A0F;
    font-size: 36px; font-weight: 900;
    padding: 12px 28px; border-radius: 50px;
    margin-bottom: 28px;
  }
  .trust-row {
    display: flex; flex-direction: column; gap: 10px; margin-bottom: 28px;
  }
  .trust-item {
    display: flex; align-items: center; gap: 10px;
    color: #D1D5DB; font-size: 20px;
  }
  .trust-icon { font-size: 22px; }
  .footer-strip {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    background: var(--primary, #F59E0B);
    color: #0A0A0F;
    text-align: center;
    padding: 16px;
    font-size: 22px; font-weight: 700;
  }
</style>
</head>
<body>
  <img id="productImg" class="product-img" src="" alt="">
  <div class="overlay"></div>
  <div class="content">
    <p class="store-name" id="storeName"></p>
    <h1 class="headline" id="headline"></h1>
    <div class="price-badge" id="price"></div>
    <div class="trust-row">
      <div class="trust-item"><span class="trust-icon">✅</span><span>الدفع عند الاستلام</span></div>
      <div class="trust-item"><span class="trust-icon">🚚</span><span>التوصيل لـ 58 ولاية</span></div>
      <div class="trust-item"><span class="trust-icon">🔒</span><span>ضمان الجودة</span></div>
    </div>
  </div>
  <div class="footer-strip" id="footer"></div>
  <script>
    const d = JSON.parse(document.getElementById('__data__').textContent)
    document.documentElement.style.setProperty('--primary', d.primaryColor || '#F59E0B')
    document.documentElement.style.setProperty('--width', d.width + 'px')
    document.documentElement.style.setProperty('--height', d.height + 'px')
    document.body.style.width = d.width + 'px'
    document.body.style.height = d.height + 'px'
    document.getElementById('productImg').src = d.productImageUrl || ''
    document.getElementById('storeName').textContent = d.storeName
    document.getElementById('headline').textContent = d.headline
    document.getElementById('price').textContent = d.price + ' دج'
    document.getElementById('footer').textContent = d.storeName + ' · اطلب الآن'
  </script>
  <script id="__data__" type="application/json">{"placeholder":true}</script>
</body>
</html>
```

- [ ] **Create template-light.html**

Create `src/lib/ad-templates/template-light.html`:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1080px;
    background: #FAFAFA;
    font-family: 'Cairo', Arial, sans-serif;
    overflow: hidden;
    direction: rtl;
  }
  .hero {
    width: 100%; height: 60%;
    position: relative; overflow: hidden;
  }
  .hero img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .hero-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, transparent 50%, #FAFAFA 100%);
  }
  .content {
    padding: 30px 60px;
    text-align: center;
  }
  .headline {
    font-size: 52px; font-weight: 900; color: #111118;
    line-height: 1.2; margin-bottom: 16px;
  }
  .price-badge {
    display: inline-flex;
    background: var(--primary, #F59E0B);
    color: #fff;
    font-size: 38px; font-weight: 900;
    padding: 10px 32px; border-radius: 50px;
    margin-bottom: 20px;
  }
  .trust-row {
    display: flex; justify-content: center; gap: 30px;
    color: #6B7280; font-size: 18px;
  }
</style>
</head>
<body>
  <div class="hero">
    <img id="productImg" src="" alt="">
    <div class="hero-overlay"></div>
  </div>
  <div class="content">
    <h1 class="headline" id="headline"></h1>
    <div class="price-badge" id="price"></div>
    <div class="trust-row">
      <span>✅ الدفع عند الاستلام</span>
      <span>🚚 58 ولاية</span>
      <span>🔒 ضمان الجودة</span>
    </div>
  </div>
  <script>
    const d = JSON.parse(document.getElementById('__data__').textContent)
    document.documentElement.style.setProperty('--primary', d.primaryColor || '#F59E0B')
    document.getElementById('productImg').src = d.productImageUrl || ''
    document.getElementById('headline').textContent = d.headline
    document.getElementById('price').textContent = d.price + ' دج'
  </script>
  <script id="__data__" type="application/json">{"placeholder":true}</script>
</body>
</html>
```

- [ ] **Create template-dramatic.html**

Create `src/lib/ad-templates/template-dramatic.html`:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1080px; height: 1920px;
    font-family: 'Cairo', Arial, sans-serif;
    overflow: hidden; position: relative;
    background: #0A0A0F;
    direction: rtl;
  }
  .bg-img {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover; opacity: 0.6;
  }
  .gradient {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom,
      rgba(10,10,15,0.4) 0%,
      rgba(10,10,15,0.1) 40%,
      rgba(10,10,15,0.95) 75%,
      rgba(10,10,15,1) 100%);
  }
  .top-bar {
    position: absolute; top: 60px; left: 60px; right: 60px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .store-name {
    color: #fff; font-size: 32px; font-weight: 700;
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(8px);
    padding: 10px 24px; border-radius: 50px;
  }
  .bottom-content {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    padding: 60px;
  }
  .badge {
    display: inline-flex;
    background: var(--primary, #F59E0B);
    color: #0A0A0F;
    font-size: 22px; font-weight: 700;
    padding: 8px 20px; border-radius: 20px;
    margin-bottom: 24px;
  }
  .headline {
    font-size: 72px; font-weight: 900; color: #fff;
    line-height: 1.1; margin-bottom: 24px;
    text-shadow: 0 4px 30px rgba(0,0,0,0.5);
  }
  .price-row {
    display: flex; align-items: center; gap: 20px; margin-bottom: 40px;
  }
  .price {
    font-size: 64px; font-weight: 900;
    color: var(--primary, #F59E0B);
  }
  .trust-grid {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 16px; margin-bottom: 40px;
  }
  .trust-card {
    background: rgba(255,255,255,0.07);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 20px;
    padding: 20px;
    text-align: center;
    color: #fff;
    font-size: 20px;
  }
  .trust-card .icon { font-size: 32px; margin-bottom: 8px; }
  .cta-btn {
    display: block; width: 100%;
    background: var(--primary, #F59E0B);
    color: #0A0A0F;
    font-size: 36px; font-weight: 900;
    padding: 28px; border-radius: 24px;
    text-align: center;
  }
</style>
</head>
<body>
  <img id="bgImg" class="bg-img" src="" alt="">
  <div class="gradient"></div>
  <div class="top-bar">
    <div class="store-name" id="storeName"></div>
  </div>
  <div class="bottom-content">
    <div class="badge">🔥 عرض حصري</div>
    <h1 class="headline" id="headline"></h1>
    <div class="price-row">
      <span class="price" id="price"></span>
    </div>
    <div class="trust-grid">
      <div class="trust-card"><div class="icon">✅</div>الدفع عند الاستلام</div>
      <div class="trust-card"><div class="icon">🚚</div>58 ولاية</div>
      <div class="trust-card"><div class="icon">🔒</div>ضمان الجودة</div>
    </div>
    <div class="cta-btn">اطلب الآن</div>
  </div>
  <script>
    const d = JSON.parse(document.getElementById('__data__').textContent)
    document.documentElement.style.setProperty('--primary', d.primaryColor || '#F59E0B')
    document.getElementById('bgImg').src = d.productImageUrl || ''
    document.getElementById('storeName').textContent = d.storeName
    document.getElementById('headline').textContent = d.headline
    document.getElementById('price').textContent = d.price + ' دج'
  </script>
  <script id="__data__" type="application/json">{"placeholder":true}</script>
</body>
</html>
```

- [ ] **Commit**

```bash
git add src/lib/ad-templates/ package.json package-lock.json
git commit -m "feat: add Puppeteer HTML ad templates (dark, light, dramatic)"
```

---

## Task 7: Create generate-photo API route

**Files:**
- Create: `src/app/api/ai/generate-photo/route.ts`

- [ ] **Create the route**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import path from 'path'
import fs from 'fs'

const TEMPLATES = ['template-dark', 'template-light', 'template-dramatic']
const SIZES = {
  square: { width: 1080, height: 1080 },
  story:  { width: 1080, height: 1920 },
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { landingPageId, format = 'square', templateIndex = 0 } = await req.json() as {
    landingPageId: string
    format?: 'square' | 'story'
    templateIndex?: number
  }

  // Load landing page and verify ownership
  const { data: lp } = await supabase
    .from('landing_pages')
    .select('*, store:stores(*)')
    .eq('id', landingPageId)
    .single()

  if (!lp) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })
  if ((lp.store as { owner_id: string }).owner_id !== user.id)
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  const store = lp.store as { plan: string; name: string; settings?: { primaryColor?: string } }
  const plan = store.plan

  if (plan !== 'pro' && plan !== 'ultimate' && plan !== 'sur_mesure')
    return NextResponse.json({ error: 'Fonctionnalité Pro requise' }, { status: 402 })

  const meta = lp.content._meta
  const primary = store.settings?.primaryColor ?? '#F59E0B'
  const templateData = {
    storeName: store.name,
    headline: lp.content.hero.headline,
    price: meta?.price ?? lp.content._meta?.price ?? 0,
    productImageUrl: meta?.imageUrl ?? lp.content.hero.background_image ?? '',
    primaryColor: primary,
    width: SIZES[format as keyof typeof SIZES].width,
    height: SIZES[format as keyof typeof SIZES].height,
  }

  const templateName = TEMPLATES[templateIndex % TEMPLATES.length]
  const templatePath = path.join(process.cwd(), 'src', 'lib', 'ad-templates', `${templateName}.html`)
  let html = fs.readFileSync(templatePath, 'utf-8')

  // Inject data into the __data__ script tag
  html = html.replace(
    '<script id="__data__" type="application/json">{"placeholder":true}</script>',
    `<script id="__data__" type="application/json">${JSON.stringify(templateData)}</script>`
  )

  // Puppeteer rendering
  let chromium: typeof import('@sparticuz/chromium').default
  let puppeteer: typeof import('puppeteer-core').default

  try {
    chromium = (await import('@sparticuz/chromium')).default
    puppeteer = (await import('puppeteer-core')).default
  } catch {
    return NextResponse.json({ error: 'Puppeteer non disponible' }, { status: 500 })
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: SIZES[format as keyof typeof SIZES].width, height: SIZES[format as keyof typeof SIZES].height },
    executablePath: await chromium.executablePath(),
    headless: true,
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500) // allow render

  const buffer = await page.screenshot({ type: 'jpeg', quality: 92, fullPage: false })
  await browser.close()

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="ad-${lp.slug}-${format}.jpg"`,
    },
  })
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/app/api/ai/generate-photo/route.ts
git commit -m "feat: Puppeteer generate-photo API route"
```

---

## Task 8: Add photo generation UI to pages/[id]

**Files:**
- Modify: `src/app/(platform)/dashboard/pages/[id]/page.tsx`

- [ ] **Add state and handler near the top of the component**

After the existing state declarations, add:

```ts
const [genFormat, setGenFormat] = useState<'square' | 'story'>('square')
const [genTemplate, setGenTemplate] = useState(0)
const [generating, setGenerating] = useState(false)
const [genError, setGenError] = useState('')
```

Add the handler before the `return`:

```ts
const handleGeneratePhoto = async () => {
  if (!page) return
  setGenerating(true)
  setGenError('')
  try {
    const res = await fetch('/api/ai/generate-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landingPageId: page.id, format: genFormat, templateIndex: genTemplate }),
    })
    if (!res.ok) {
      const err = await res.json()
      setGenError(err.error ?? 'Erreur de génération')
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ad-${page.slug}-${genFormat}.jpg`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    setGenError('Erreur réseau')
  } finally {
    setGenerating(false)
  }
}
```

- [ ] **Add the UI section before the closing `</div>` of the main content**

Find where the page JSX ends and add before the last `</div>`:

```tsx
{/* Ad image generator — Pro only */}
{store && (store.plan === 'pro' || store.plan === 'ultimate' || store.plan === 'sur_mesure') ? (
  <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
    <div className="flex items-center gap-2">
      <ImageIcon size={16} className="text-[#F59E0B]" />
      <h3 className="text-white font-semibold text-sm">Générer une image publicitaire</h3>
    </div>
    <p className="text-gray-500 text-xs">Téléchargez une image prête pour Instagram, TikTok ou Facebook.</p>

    {genError && (
      <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{genError}</div>
    )}

    <div>
      <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Format</label>
      <div className="flex gap-2">
        {[
          { id: 'square', label: 'Carré 1:1', desc: 'Instagram / Facebook' },
          { id: 'story',  label: 'Story 9:16', desc: 'TikTok / Reels' },
        ].map(f => (
          <button key={f.id} onClick={() => setGenFormat(f.id as 'square' | 'story')}
            className="flex-1 py-3 px-4 rounded-xl border text-left transition-all"
            style={{
              background: genFormat === f.id ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)',
              borderColor: genFormat === f.id ? '#F59E0B' : 'rgba(255,255,255,0.1)',
            }}>
            <p className="text-white text-xs font-semibold">{f.label}</p>
            <p className="text-gray-500 text-xs">{f.desc}</p>
          </button>
        ))}
      </div>
    </div>

    <div>
      <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Modèle</label>
      <div className="flex gap-2">
        {['Sombre', 'Clair', 'Dramatique'].map((t, i) => (
          <button key={i} onClick={() => setGenTemplate(i)}
            className="flex-1 py-2 px-3 rounded-xl border text-xs font-semibold transition-all"
            style={{
              background: genTemplate === i ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)',
              borderColor: genTemplate === i ? '#F59E0B' : 'rgba(255,255,255,0.1)',
              color: genTemplate === i ? '#F59E0B' : '#9CA3AF',
            }}>
            {t}
          </button>
        ))}
      </div>
    </div>

    <button onClick={handleGeneratePhoto} disabled={generating}
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50"
      style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706)', color: '#000' }}>
      {generating
        ? <><span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" /> Génération...</>
        : '⬇️ Générer et télécharger'}
    </button>
  </div>
) : store && (
  <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-60">
    <Lock size={20} className="text-gray-500 flex-shrink-0" />
    <div>
      <p className="text-white text-sm font-semibold">Générer une image publicitaire</p>
      <p className="text-gray-500 text-xs">Disponible à partir du plan Pro</p>
    </div>
    <a href="/dashboard/billing/upgrade"
      className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
      style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
      Passer à Pro
    </a>
  </div>
)}
```

Also add `ImageIcon, Lock` to the imports at the top of the file.

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/app/(platform)/dashboard/pages/[id]/page.tsx
git commit -m "feat: add ad image generator UI to landing page editor (Pro)"
```

---

## Task 9: Dashboard nav extensions

**Files:**
- Modify: `src/app/(platform)/dashboard/layout.tsx`

- [ ] **Add new imports and update NAV array**

Add `BarChart2, Puzzle, Palette` to the lucide-react import line.

Replace the `NAV` constant with:

```ts
const NAV_ALWAYS = [
  { href: '/dashboard',          icon: LayoutDashboard, label: "Vue d'ensemble" },
  { href: '/dashboard/products', icon: Package,          label: 'Produits'       },
  { href: '/dashboard/orders',   icon: ShoppingCart,     label: 'Commandes'      },
  { href: '/dashboard/pages',    icon: FileText,         label: 'Landing Pages'  },
  { href: '/dashboard/finance',  icon: TrendingUp,       label: 'Finances'       },
]

const NAV_BASIC = [
  { href: '/dashboard/themes',   icon: Palette,          label: 'Thèmes'         },
]

const NAV_PRO = [
  { href: '/dashboard/analytics',    icon: BarChart2, label: 'Analytiques'  },
  { href: '/dashboard/integrations', icon: Puzzle,    label: 'Intégrations' },
]

const NAV_BOTTOM = [
  { href: '/dashboard/settings', icon: Settings,  label: 'Paramètres'  },
  { href: '/dashboard/billing',  icon: CreditCard, label: 'Abonnement'  },
]
```

Inside the `Sidebar` component, replace the `{NAV.map(...)}` block with:

```tsx
{/* Always visible */}
{NAV_ALWAYS.map(item => renderNavItem(item))}

{/* Basic: themes */}
{NAV_BASIC.map(item => renderNavItem(item))}

{/* Pro/Ultimate: analytics + integrations */}
{(store?.plan === 'pro' || store?.plan === 'ultimate' || store?.plan === 'sur_mesure')
  ? NAV_PRO.map(item => renderNavItem(item))
  : NAV_PRO.map(item => renderNavItem({ ...item, locked: true }))}

{/* Always: settings + billing */}
{NAV_BOTTOM.map(item => renderNavItem(item))}
```

Extract the link rendering into a helper function before the `Sidebar` component definition:

```ts
type NavItem = { href: string; icon: React.ElementType; label: string; locked?: boolean }
const renderNavItem = (item: NavItem) => {
  const { href, icon: Icon, label, locked } = item
  const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  const isOrders = href === '/dashboard/orders'
  const count = isOrders ? pendingOrders : 0
  return (
    <Link key={href} href={locked ? '/dashboard/billing/upgrade' : href}
      onClick={() => setSideOpen(false)}
      className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
        active ? 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20'
               : locked ? 'text-gray-600 hover:bg-white/3' : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}>
      <div className="flex items-center gap-3">
        <Icon size={16} />
        <span>{label}</span>
      </div>
      {count > 0 && <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-bold text-black bg-[#3B82F6] rounded-full">{count}</span>}
      {locked && <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold">Pro</span>}
    </Link>
  )
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/app/(platform)/dashboard/layout.tsx
git commit -m "feat: add Analytiques, Intégrations, Thèmes nav items to dashboard"
```

---

## Task 10: Create Pro feature shells

**Files:**
- Create: `src/app/(platform)/dashboard/analytics/page.tsx`
- Create: `src/app/(platform)/dashboard/integrations/page.tsx`
- Create: `src/app/(platform)/dashboard/integrations/delivery/page.tsx`
- Create: `src/app/(platform)/dashboard/integrations/sheets/page.tsx`
- Create: `src/app/(platform)/dashboard/integrations/gtm/page.tsx`
- Create: `src/app/(platform)/dashboard/integrations/abandoned-cart/page.tsx`

- [ ] **Create analytics shell**

`src/app/(platform)/dashboard/analytics/page.tsx`:

```tsx
'use client'

import { BarChart2, TrendingUp, Eye, ShoppingCart, Clock } from 'lucide-react'

const METRICS = [
  { label: 'Vues totales', value: '—', icon: Eye, color: '#3B82F6' },
  { label: 'Commandes', value: '—', icon: ShoppingCart, color: '#10B981' },
  { label: 'Taux de conversion', value: '—', icon: TrendingUp, color: '#F59E0B' },
  { label: 'Temps moyen sur page', value: '—', icon: Clock, color: '#8B5CF6' },
]

export default function AnalyticsPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Analytiques avancées</h2>
        <p className="text-gray-500 text-sm mt-1">Suivez les performances de vos landing pages et produits</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {METRICS.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#111118] border border-white/5 rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}15` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <p className="text-2xl font-black text-white">{value}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4" style={{ minHeight: 300 }}>
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
          <BarChart2 size={28} className="text-[#3B82F6]" />
        </div>
        <div>
          <p className="text-white font-bold text-lg">Analytiques en cours de développement</p>
          <p className="text-gray-500 text-sm mt-2 max-w-md">
            Bientôt disponible : graphiques de ventes, entonnoir de conversion, heatmaps et rapports hebdomadaires automatiques.
          </p>
        </div>
        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
          Bientôt disponible
        </span>
      </div>
    </div>
  )
}
```

- [ ] **Create integrations overview**

`src/app/(platform)/dashboard/integrations/page.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { Truck, Table2, Tag, ShoppingCart, ChevronRight } from 'lucide-react'

const INTEGRATIONS = [
  {
    href: '/dashboard/integrations/delivery',
    icon: Truck,
    color: '#10B981',
    title: "Sociétés de livraison",
    desc: "Yalidine, Zr Express, Maystro — tarifs et suivi automatiques",
    badge: 'Bientôt',
  },
  {
    href: '/dashboard/integrations/sheets',
    icon: Table2,
    color: '#34D399',
    title: "Google Sheets",
    desc: "Synchronisez vos commandes en temps réel vers une feuille Google",
    badge: 'Bientôt',
  },
  {
    href: '/dashboard/integrations/gtm',
    icon: Tag,
    color: '#F59E0B',
    title: "Google Tag Manager",
    desc: "Ajoutez facilement Facebook Pixel, Google Ads, et autres scripts",
    badge: 'Configurer',
  },
  {
    href: '/dashboard/integrations/abandoned-cart',
    icon: ShoppingCart,
    color: '#EF4444',
    title: "Paniers abandonnés",
    desc: "Relancez automatiquement les clients qui n'ont pas finalisé leur commande",
    badge: 'Bientôt',
  },
]

export default function IntegrationsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Intégrations</h2>
        <p className="text-gray-500 text-sm mt-1">Connectez des outils tiers à votre boutique</p>
      </div>
      <div className="space-y-3">
        {INTEGRATIONS.map(({ href, icon: Icon, color, title, desc, badge }) => (
          <Link key={href} href={href}
            className="flex items-center gap-4 p-5 bg-[#111118] border border-white/5 rounded-2xl hover:border-white/10 transition-all group">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `${color}15` }}>
              <Icon size={20} style={{ color }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-semibold text-sm">{title}</p>
              <p className="text-gray-500 text-xs mt-0.5 truncate">{desc}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs px-2.5 py-1 rounded-lg font-semibold"
                style={{ background: badge === 'Configurer' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)', color: badge === 'Configurer' ? '#F59E0B' : '#6B7280' }}>
                {badge}
              </span>
              <ChevronRight size={16} className="text-gray-600 group-hover:text-gray-400 transition-colors" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Create delivery integrations shell**

`src/app/(platform)/dashboard/integrations/delivery/page.tsx`:

```tsx
'use client'
import { Truck } from 'lucide-react'

const COMPANIES = [
  { name: 'Yalidine', logo: '🟡', desc: 'Leader du marché — API disponible', status: 'Bientôt' },
  { name: 'Zr Express', logo: '🔵', desc: 'Couverture nationale — tarifs compétitifs', status: 'Bientôt' },
  { name: 'Maystro', logo: '🟢', desc: 'Suivi en temps réel', status: 'Bientôt' },
]

export default function DeliveryIntegrationsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">← Intégrations</a>
      </div>
      <div>
        <h2 className="text-2xl font-bold text-white">Sociétés de livraison</h2>
        <p className="text-gray-500 text-sm mt-1">Connectez votre compte livreur pour automatiser les expéditions</p>
      </div>
      {COMPANIES.map(c => (
        <div key={c.name} className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4">
          <span className="text-3xl">{c.logo}</span>
          <div className="flex-1">
            <p className="text-white font-semibold">{c.name}</p>
            <p className="text-gray-500 text-xs mt-0.5">{c.desc}</p>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-500 font-semibold">{c.status}</span>
        </div>
      ))}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-6 text-center">
        <Truck size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-white font-semibold">Intégration API en développement</p>
        <p className="text-gray-500 text-sm mt-1">Les intégrations permettront la création automatique de livraisons, le suivi des colis et la mise à jour des statuts de commande.</p>
      </div>
    </div>
  )
}
```

- [ ] **Create Google Sheets shell**

`src/app/(platform)/dashboard/integrations/sheets/page.tsx`:

```tsx
'use client'
import { Table2, ExternalLink } from 'lucide-react'

export default function SheetsIntegrationPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">← Intégrations</a>
      <div>
        <h2 className="text-2xl font-bold text-white">Google Sheets</h2>
        <p className="text-gray-500 text-sm mt-1">Exportez automatiquement chaque nouvelle commande vers une feuille Google</p>
      </div>
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(52,211,153,0.1)' }}>
          <Table2 size={28} className="text-emerald-400" />
        </div>
        <p className="text-white font-bold text-lg">Synchronisation Google Sheets</p>
        <p className="text-gray-500 text-sm max-w-sm">
          Chaque commande sera automatiquement ajoutée à votre feuille avec : nom, téléphone, wilaya, produit, montant et statut.
        </p>
        <button disabled className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm bg-white/5 text-gray-500 cursor-not-allowed">
          <ExternalLink size={16} /> Connecter Google Sheets
        </button>
        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Bientôt disponible</span>
      </div>
    </div>
  )
}
```

- [ ] **Create GTM shell**

`src/app/(platform)/dashboard/integrations/gtm/page.tsx`:

```tsx
'use client'
import { useState } from 'react'
import { Tag, Save } from 'lucide-react'

export default function GTMPage() {
  const [gtmId, setGtmId] = useState('')
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">← Intégrations</a>
      <div>
        <h2 className="text-2xl font-bold text-white">Google Tag Manager</h2>
        <p className="text-gray-500 text-sm mt-1">Ajoutez des scripts tiers sans modifier le code de votre boutique</p>
      </div>
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-[#F59E0B]" />
          <h3 className="text-white font-semibold text-sm">ID de conteneur GTM</h3>
        </div>
        <p className="text-gray-500 text-xs">Trouvez votre ID dans Google Tag Manager → Admin → Informations sur le conteneur. Format : GTM-XXXXXXX</p>
        <input value={gtmId} onChange={e => setGtmId(e.target.value)} placeholder="GTM-XXXXXXX"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all font-mono" />
        <button disabled className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 text-gray-500 cursor-not-allowed">
          <Save size={14} /> Enregistrer (bientôt disponible)
        </button>
      </div>
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
        <p className="text-white font-semibold text-sm">Utilisations courantes</p>
        {['Facebook Pixel & Conversions API', 'Google Ads remarketing', 'Snapchat Pixel', 'TikTok Pixel', 'Hotjar / Microsoft Clarity'].map(item => (
          <div key={item} className="flex items-center gap-2 text-sm text-gray-400">
            <span className="text-[#F59E0B]">→</span> {item}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Create Abandoned Cart shell**

`src/app/(platform)/dashboard/integrations/abandoned-cart/page.tsx`:

```tsx
'use client'
import { ShoppingCart } from 'lucide-react'

export default function AbandonedCartPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">← Intégrations</a>
      <div>
        <h2 className="text-2xl font-bold text-white">Récupération de paniers abandonnés</h2>
        <p className="text-gray-500 text-sm mt-1">Relancez automatiquement les clients qui n&apos;ont pas finalisé leur commande</p>
      </div>
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-red-500/10">
          <ShoppingCart size={28} className="text-red-400" />
        </div>
        <p className="text-white font-bold text-lg">Relance automatique</p>
        <p className="text-gray-500 text-sm max-w-sm">
          Détectez les visiteurs qui ont rempli leur nom et téléphone mais n&apos;ont pas commandé. Un message WhatsApp automatique sera envoyé après 30 minutes.
        </p>
        <div className="grid grid-cols-3 gap-4 w-full mt-2">
          {[
            { label: 'Visiteurs captés', value: '—' },
            { label: 'Relances envoyées', value: '—' },
            { label: 'Récupérés', value: '—' },
          ].map(s => (
            <div key={s.label} className="bg-white/3 rounded-xl p-4 text-center border border-white/5">
              <p className="text-2xl font-black text-white">{s.value}</p>
              <p className="text-gray-500 text-xs mt-1">{s.label}</p>
            </div>
          ))}
        </div>
        <span className="px-4 py-1.5 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20">Bientôt disponible</span>
      </div>
    </div>
  )
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/app/(platform)/dashboard/analytics/ src/app/(platform)/dashboard/integrations/
git commit -m "feat: add Pro feature shells (analytics, integrations, delivery, sheets, GTM, abandoned cart)"
```

---

## Task 11: Basic theme changer shell

**Files:**
- Create: `src/app/(platform)/dashboard/themes/page.tsx`

- [ ] **Create themes page**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Store } from '@/types/database'
import { Lock, Check } from 'lucide-react'

const THEMES = [
  {
    id: 'novalux-dark',
    name: 'Novalux Dark',
    niche: 'Universel',
    free: true,
    preview: '#0A0A0F',
    accent: '#3B82F6',
  },
  {
    id: 'beauty-fashion',
    name: 'Beauty & Fashion',
    niche: 'Beauté / Mode',
    free: false,
    preview: '#1A0A1A',
    accent: '#EC4899',
  },
  {
    id: 'home-lifestyle',
    name: 'Home & Lifestyle',
    niche: 'Maison / Art de vivre',
    free: false,
    preview: '#0F1A0A',
    accent: '#84CC16',
  },
  {
    id: 'automotive',
    name: 'Auto Accessories',
    niche: 'Accessoires auto',
    free: false,
    preview: '#0A0F1A',
    accent: '#EF4444',
  },
  {
    id: 'fitness-wellness',
    name: 'Fitness & Wellness',
    niche: 'Sport / Bien-être',
    free: false,
    preview: '#0A1A0A',
    accent: '#10B981',
  },
  {
    id: 'tech-mobile',
    name: 'Tech & Mobile',
    niche: 'Tech / Accessoires mobile',
    free: false,
    preview: '#0A0A1A',
    accent: '#8B5CF6',
  },
]

export default function ThemesPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [activeTheme, setActiveTheme] = useState('novalux-dark')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data } = await supabase.from('stores').select('*').eq('owner_id', user.id).single()
      if (data) setStore(data as Store)
    })
  }, [router])

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Thèmes</h2>
        <p className="text-gray-500 text-sm mt-1">Choisissez le look de votre boutique selon votre niche</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {THEMES.map(theme => {
          const isActive = activeTheme === theme.id
          const isLocked = !theme.free

          return (
            <div key={theme.id}
              className={`relative rounded-2xl overflow-hidden border-2 transition-all ${
                isLocked ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:scale-[1.02]'
              } ${isActive ? 'border-[#3B82F6]' : 'border-white/10'}`}
              onClick={() => { if (!isLocked) setActiveTheme(theme.id) }}>

              {/* Preview swatch */}
              <div className="h-28 flex items-end p-4"
                style={{ background: `linear-gradient(135deg, ${theme.preview}, ${theme.accent}20)` }}>
                <div className="w-full h-2 rounded-full" style={{ background: theme.accent }} />
              </div>

              {/* Info */}
              <div className="bg-[#111118] p-3">
                <p className="text-white text-sm font-semibold">{theme.name}</p>
                <p className="text-gray-500 text-xs mt-0.5">{theme.niche}</p>
              </div>

              {/* Active badge */}
              {isActive && (
                <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#3B82F6] flex items-center justify-center">
                  <Check size={12} className="text-white" />
                </div>
              )}

              {/* Lock overlay */}
              {isLocked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-[2px]">
                  <Lock size={22} className="text-white/70" />
                  <a href="/dashboard/billing/upgrade"
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(245,158,11,0.2)', color: '#F59E0B' }}
                    onClick={e => e.stopPropagation()}>
                    Passer à Pro
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
        <p className="text-gray-400 text-sm">
          💡 Les designs complets des thèmes niches seront disponibles très prochainement.
          Les couleurs et typographies sont personnalisables pour chaque niche.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Commit**

```bash
git add src/app/(platform)/dashboard/themes/page.tsx
git commit -m "feat: add Basic theme changer shell with 1 free + 5 locked niche themes"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Inline order form (Task 2–3) — `OrderFormFields` on landing page with `#order-form` anchor
- ✅ Sticky CTA scrolls to form (Task 4) — `<a href="#order-form">` in header
- ✅ Visual redesign ayor.ai quality (Task 4) — full-bleed hero, Cairo/Sora fonts, trust bar
- ✅ Pro: countdown timer (Task 4) — `CountdownTimer` component, Pro+ only
- ✅ Pro: sticky mobile bottom bar (Task 4) — fixed bottom, sm:hidden
- ✅ Ultimate: Recent clients ticker (Task 4) — marquee animation
- ✅ Settings extended (Task 5) — bio, email, address, banner, TikTok, Snapchat, YouTube
- ✅ Puppeteer templates (Task 6) — 3 HTML templates
- ✅ generate-photo API route (Task 7) — Pro-gated, returns JPG
- ✅ Photo gen UI on pages/[id] (Task 8) — format picker, template picker, locked for Basic
- ✅ Nav extended (Task 9) — Analytiques, Intégrations, Thèmes
- ✅ Pro shells (Task 10) — analytics, integrations overview, delivery, sheets, GTM, abandoned cart
- ✅ Basic theme changer (Task 11) — 1 free + 5 locked with niche labels

**Type consistency check:**
- `OrderFormFields` props use `product: Product | null`, `overridePrice?: number`, `landingPageId?: string`, `isRTL?: boolean` — matches usage in `LandingPageRenderer` and `StoreOrderModal`
- `StoreSettings.bannerUrl`, `.bio`, `.email`, `.address`, `.tiktok`, `.snapchat`, `.youtube` added in Task 1 — used in Task 5
- `generate-photo` route reads `lp.content._meta?.price` and `lp.content.hero.headline` — both exist on `LandingPageContent`

**No placeholders confirmed** — all code steps are complete.
