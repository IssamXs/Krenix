'use client'

import { useState, useEffect } from 'react'
import type { LandingPage, Store, LandingPageCoreContent } from '@/types/database'
import { Star, Shield, Truck, Zap, Package, ChevronDown, ChevronUp, AlertTriangle, Phone, CheckCircle } from 'lucide-react'
import OrderFormFields from './OrderFormFields'
import StoreOrderModal from './StoreOrderModal'
import { buildWaLink } from '@/lib/whatsapp'

function LeadCaptureForm({ storeId, landingPageId, primary, bg, card, border, text, textMuted, isRTL }: {
  storeId: string; landingPageId: string; primary: string; bg: string; card: string;
  border: string; text: string; textMuted: string; isRTL: boolean
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [wilaya, setWilaya] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async () => {
    if (!name.trim() || !phone.trim()) {
      setError(isRTL ? 'الاسم والهاتف مطلوبان' : 'Nom et téléphone requis.')
      return
    }
    setSubmitting(true)
    setError('')
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store_id: storeId, landing_page_id: landingPageId, name, phone, wilaya }),
    })
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
    } else {
      const data = await res.json()
      setError(data.error ?? (isRTL ? 'حدث خطأ' : 'Erreur, réessayez.'))
    }
  }

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: '10px',
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${border}`,
    color: text, outline: 'none', fontSize: '13px',
  } as const

  if (done) {
    return (
      <div className="flex items-center gap-3 py-3 px-4 rounded-2xl" style={{ background: `${primary}10`, border: `1px solid ${primary}30` }}>
        <CheckCircle size={18} style={{ color: primary }} />
        <p className="text-sm font-semibold" style={{ color: primary }}>
          {isRTL ? 'تم تسجيل طلبك! سنتصل بك قريباً.' : 'Enregistré ! Nous vous contacterons bientôt.'}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl p-5 space-y-3" style={{ background: card, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-2 mb-1">
        <Phone size={15} style={{ color: textMuted }} />
        <p className="text-sm font-semibold" style={{ color: text }}>
          {isRTL ? 'غير مستعد للطلب؟ اترك بياناتك وسنتصل بك' : 'Pas encore prêt ? Laissez vos coordonnées'}
        </p>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <input value={name} onChange={e => setName(e.target.value)} placeholder={isRTL ? 'الاسم' : 'Votre nom'} style={inputStyle} />
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="06 XX XX XX XX" style={inputStyle} type="tel" />
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-2.5 rounded-xl text-sm font-bold transition-all hover:opacity-90 disabled:opacity-50"
        style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${border}`, color: text }}
      >
        {isRTL ? 'أخبرونني عن هذا المنتج' : 'Être rappelé pour ce produit'}
      </button>
    </div>
  )
}

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
      {[1, 2, 3, 4, 5].map(i => (
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

// Product image gallery: one main image + a tappable thumbnail strip of every
// photo (all AI-generated shots, or the product's own images). Keeps all photos
// visible together at the top instead of scattering them down the page.
function HeroGallery({ images, alt, primary, bg, border, isRTL }: {
  images: string[]; alt: string; primary: string; bg: string; border: string; isRTL: boolean
}) {
  const [active, setActive] = useState(0)
  const idx = Math.min(active, images.length - 1)
  return (
    <div style={{ background: bg }}>
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: '1 / 1' }}>
        <img src={images[idx]} alt={alt} className="absolute inset-0 w-full h-full object-cover" />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}`}
              className="flex-shrink-0 rounded-xl overflow-hidden transition-all"
              style={{ width: 60, height: 60, border: `2px solid ${i === idx ? primary : border}`, opacity: i === idx ? 1 : 0.6 }}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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

  const product = landingPage.product ?? null
  // All product photos for the top gallery: prefer AI-generated shots, then the
  // product's own images, then any single fallback image.
  const generatedImgs = (landingPage.generated_images ?? []).filter(Boolean)
  const singleFallback = meta?.imageUrl ?? raw.hero.background_image ?? null
  const heroImages: string[] = generatedImgs.length
    ? generatedImgs
    : product?.images?.length
      ? product.images
      : singleFallback
        ? [singleFallback]
        : []
  const comparePrice = product?.compare_price ?? null
  const displayPrice = product?.price ?? meta?.price ?? 0

  // Inventory gate: stock === null means untracked (legacy pages) → always orderable.
  const outOfStock = landingPage.stock !== null && landingPage.stock <= 0
  const lowStock = landingPage.stock !== null && landingPage.stock > 0 && landingPage.stock <= 5
  const ctaText = outOfStock ? (isRTL ? 'نفدت الكمية' : 'Rupture de stock') : c.hero.cta_text

  const headingFont = isRTL ? "'Cairo', sans-serif" : "'Sora', sans-serif"

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ background: bg, color: text, minHeight: '100vh', fontFamily: isRTL ? "'Cairo', sans-serif" : "'Sora', sans-serif" }}>

      {/* Font loader */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&family=Sora:wght@400;600;800&display=swap');`}</style>

      {/* Sticky header */}
      <header
        className="sticky top-0 z-20 px-4 py-3"
        style={{ background: `${card}ee`, backdropFilter: 'blur(12px)', borderBottom: `1px solid ${border}` }}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name} className="w-7 h-7 rounded-lg object-contain" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: primary }}>
                  <Zap size={12} style={{ color: bg }} />
                </div>}
            <span className="font-semibold text-sm">{store.name}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasAr && !isArOnly && (
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: border }}>
                <button
                  onClick={() => setActiveLang('fr')}
                  className="px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{ background: activeLang === 'fr' ? primary : 'transparent', color: activeLang === 'fr' ? bg : textMuted }}>
                  FR
                </button>
                <button
                  onClick={() => setActiveLang('ar')}
                  className="px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{ background: activeLang === 'ar' ? primary : 'transparent', color: activeLang === 'ar' ? bg : textMuted }}>
                  عربي
                </button>
              </div>
            )}
            <a
              href="#order-form"
              className="px-4 py-2 rounded-xl text-xs font-black transition-all hover:opacity-90 active:scale-95"
              style={{ background: primary, color: bg }}>
              {ctaText}
            </a>
          </div>
        </div>
      </header>

      {/* HERO — product gallery on top, all text below it */}
      <section className="relative" style={{ background: bg }}>
        <div className="max-w-2xl mx-auto">
          {heroImages.length
            ? <HeroGallery
                images={heroImages}
                alt={meta?.productName ?? product?.name ?? ''}
                primary={primary}
                bg={bg}
                border={border}
                isRTL={isRTL}
              />
            : <div className="w-full" style={{ aspectRatio: '1 / 1', background: `linear-gradient(135deg, ${primary}30, ${bg})` }} />}

          <div className="px-5 pt-6 pb-8">
          {/* Urgency badge */}
          {c.urgency && (
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-xs font-bold"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5' }}>
              <AlertTriangle size={12} /> {c.urgency.text}
            </div>
          )}

          <h1
            className="text-3xl font-black leading-tight mb-3"
            style={{ fontFamily: headingFont, color: text }}>
            {c.hero.headline}
          </h1>
          <p className="text-base mb-6" style={{ color: textMuted }}>{c.hero.subheadline}</p>

          {/* Price badge */}
          <div className="flex items-center gap-3 mb-6">
            <span
              className="px-5 py-2.5 rounded-2xl font-black text-2xl"
              style={{ background: primary, color: bg, boxShadow: `0 4px 20px ${primary}60` }}>
              {Number(displayPrice).toLocaleString('fr-DZ')} DA
            </span>
            {comparePrice && (
              <span className="text-lg line-through" style={{ color: textMuted }}>
                {Number(comparePrice).toLocaleString('fr-DZ')} DA
              </span>
            )}
          </div>

          <a
            href="#order-form"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-base transition-all hover:opacity-90 active:scale-95 shadow-2xl"
            style={{ background: primary, color: bg, boxShadow: `0 8px 30px ${primary}50` }}>
            {ctaText}{outOfStock ? '' : ' ←'}
          </a>

          <p className="text-xs mt-3" style={{ color: textMuted }}>
            {isRTL ? '🚚 التوصيل إلى جميع ولايات الجزائر الـ 58' : '🚚 Livraison partout en Algérie — 58 wilayas'}
          </p>
          </div>
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
          <div className="mt-6 p-4 rounded-2xl text-center"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <p className="text-red-400 text-sm font-bold mb-2">
              {isRTL ? '⚡ العرض ينتهي خلال:' : '⚡ Offre expire dans :'}
            </p>
            <CountdownTimer primary={primary} bg={bg} isRTL={isRTL} />
          </div>
        )}

        {/* Ultimate: Recent clients ticker */}
        {isUltimate && (
          <div className="mt-4 overflow-hidden rounded-xl py-2 px-4"
            style={{ background: `${primary}08`, border: `1px solid ${primary}20` }}>
            <div className="flex gap-6 animate-marquee whitespace-nowrap">
              {[...RECENT_CLIENTS, ...RECENT_CLIENTS].map((client, i) => (
                <span key={i} className="text-xs font-medium flex-shrink-0" style={{ color: primary }}>
                  🛍️ {client} {isRTL ? 'طلب للتو' : 'vient de commander'}
                </span>
              ))}
            </div>
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

        {/* Product details accordion */}
        {c.product_details.sections.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-black mb-4" style={{ color: text, fontFamily: headingFont }}>
              {isRTL ? 'تفاصيل المنتج' : 'Détails du produit'}
            </h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${border}` }}>
              {c.product_details.sections.map((section, i) => (
                <div
                  key={i}
                  style={{ borderBottom: i < c.product_details.sections.length - 1 ? `1px solid ${border}` : undefined }}>
                  <button
                    onClick={() => setOpenSection(openSection === i ? null : i)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:opacity-80"
                    style={{ background: card, color: text }}>
                    <span className="font-semibold text-sm">{section.title}</span>
                    {openSection === i
                      ? <ChevronUp size={16} style={{ color: textMuted }} />
                      : <ChevronDown size={16} style={{ color: textMuted }} />}
                  </button>
                  {openSection === i && (
                    <div className="px-5 pb-4 pt-2 text-sm leading-relaxed"
                      style={{ background: `${card}80`, color: textMuted }}>
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

        {/* LEAD CAPTURE */}
        <div className="mb-4">
          <LeadCaptureForm
            storeId={store.id}
            landingPageId={landingPage.id}
            primary={primary} bg={bg} card={card} border={border}
            text={text} textMuted={textMuted} isRTL={isRTL}
          />
        </div>

        {/* INLINE ORDER FORM */}
        <section id="order-form" className="mb-12 p-6 rounded-3xl scroll-mt-20"
          style={{ background: `${primary}08`, border: `2px solid ${primary}30` }}>
          {outOfStock ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <AlertTriangle size={36} style={{ color: '#EF4444' }} />
              <p className="text-xl font-black" style={{ color: text, fontFamily: headingFont }}>
                {isRTL ? 'نفدت الكمية' : 'Rupture de stock'}
              </p>
              <p className="text-sm" style={{ color: textMuted }}>
                {isRTL
                  ? 'هذا المنتج غير متوفر حالياً. عد قريباً!'
                  : 'Ce produit est momentanément indisponible. Revenez bientôt !'}
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-black mb-1 text-center" style={{ color: text, fontFamily: headingFont }}>
                {c.order_form.title}
              </h2>
              <p className="text-sm mb-2 text-center" style={{ color: textMuted }}>
                {isRTL
                  ? '🚚 اطلب الآن والدفع عند الاستلام'
                  : '🚚 Commandez maintenant — Paiement à la livraison'}
              </p>
              {lowStock && (
                <p className="text-sm mb-6 text-center font-bold" style={{ color: '#EF4444' }}>
                  {isRTL
                    ? `🔥 لم يتبقَّ سوى ${landingPage.stock} قطعة!`
                    : `🔥 Plus que ${landingPage.stock} en stock !`}
                </p>
              )}
              {!lowStock && <div className="mb-6" />}
              <OrderFormFields
                product={product}
                store={store}
                landingPageId={landingPage.id}
                overridePrice={Number(displayPrice)}
                isRTL={isRTL}
                upsell={{
                  enabled: landingPage.upsell_enabled,
                  text: landingPage.upsell_text,
                  product_name: landingPage.upsell_product_name,
                  price: landingPage.upsell_price,
                }}
              />
            </>
          )}
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
        <div
          className="fixed bottom-0 left-0 right-0 z-30 p-3 sm:hidden"
          style={{ background: `${card}f0`, backdropFilter: 'blur(12px)', borderTop: `1px solid ${border}` }}>
          <a
            href="#order-form"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-black text-sm"
            style={{ background: primary, color: bg, opacity: outOfStock ? 0.6 : 1 }}>
            {outOfStock
              ? (isRTL ? 'نفدت الكمية' : 'Rupture de stock')
              : isRTL
                ? `اطلب الآن — ${Number(displayPrice).toLocaleString('fr-DZ')} دج`
                : `Commander — ${Number(displayPrice).toLocaleString('fr-DZ')} DA`}
          </a>
        </div>
      )}

      {/* WhatsApp fallback (no product + no price) */}
      {showModal && !product && !displayPrice && store.settings?.whatsapp && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70"
          onClick={() => setShowModal(false)}>
          <div
            className="w-full max-w-sm rounded-3xl p-6 text-center"
            style={{ background: card }}
            onClick={e => e.stopPropagation()}>
            <p className="font-bold text-lg mb-2" style={{ color: text }}>
              {isRTL ? 'للطلب عبر واتساب' : 'Commander via WhatsApp'}
            </p>
            <a
              href={buildWaLink(
                store.settings.whatsapp,
                isRTL ? `أريد الطلب: ${c.hero.headline}` : `Je veux commander: ${c.hero.headline}`
              ) ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-3 mt-4 rounded-2xl font-bold text-sm"
              style={{ background: '#25D366', color: '#fff' }}>
              WhatsApp →
            </a>
          </div>
        </div>
      )}

      {/* Product modal fallback (for StoreHomepage product cards) */}
      {showModal && product && (
        <StoreOrderModal product={product} store={store} onClose={() => setShowModal(false)} />
      )}

    </div>
  )
}
