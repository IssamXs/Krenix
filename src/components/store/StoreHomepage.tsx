'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'
import { ShoppingBag, Package, Zap, ArrowRight } from 'lucide-react'
import { toWaNumber } from '@/lib/whatsapp'
import { sanitizeFontName } from '@/lib/fonts'
import StoreOrderModal from './StoreOrderModal'

interface Props {
  store: Store
  products: Product[]
  landingPages?: LandingPage[]
  landingByProduct?: Record<string, string>
}

// Builds a single Google Fonts CSS2 URL for up to 2 font families.
// Names are sanitized (letters/digits/spaces only) before interpolation since
// the result is injected as raw CSS via dangerouslySetInnerHTML below.
function buildGoogleFontsUrl(heading?: string, body?: string): string | null {
  const families = [...new Set([heading, body].map(sanitizeFontName).filter(Boolean))]
  if (!families.length) return null
  const params = families
    .map(f => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700;800;900`)
    .join('&')
  return `https://fonts.googleapis.com/css2?${params}&display=swap`
}

export default function StoreHomepage({ store, products, landingPages = [], landingByProduct = {} }: Props) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : ''
  // A product backing a published landing page opens that page instead of the modal.
  const openProduct = (p: Product) => {
    const ls = landingByProduct[p.id]
    if (ls) { router.push(`${storeBase}/p/${ls}${queryString}`); return }
    setSelectedProduct(p)
  }

  const theme = store.theme?.config
  const bg = theme?.colors.background ?? '#0A0A0F'
  const card = theme?.colors.card ?? '#111118'
  const primary = theme?.colors.primary ?? '#3B82F6'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'
  const headingFont = theme?.fonts?.heading
  const bodyFont = theme?.fonts?.body
  const fontUrl = buildGoogleFontsUrl(headingFont, bodyFont)
  const headingStyle = headingFont ? { fontFamily: `'${headingFont}', sans-serif` } : {}
  const bodyStyle = bodyFont ? { fontFamily: `'${bodyFont}', sans-serif` } : {}

  // Header CTA: WhatsApp link only when the store has a valid number; otherwise
  // scroll to the products section so the button is never a dead wa.me/ link.
  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  return (
    <div style={{ background: bg, color: text, minHeight: '100vh', ...bodyStyle }}>
      {/* Niche theme font loader */}
      {fontUrl && (
        <style dangerouslySetInnerHTML={{ __html: `@import url('${fontUrl}');` }} />
      )}
      {/* Header */}
      <header
        style={{ background: card, borderBottom: `1px solid ${border}` }}
        className="sticky top-0 z-10 px-4 py-4"
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {store.logo_url ? (
              <img src={store.logo_url} alt={store.name} className="w-8 h-8 rounded-xl object-contain" />
            ) : (
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: primary }}>
                <Zap size={14} style={{ color: '#000' }} />
              </div>
            )}
            <span className="font-bold text-lg" style={headingStyle}>{store.name}</span>
          </div>
          <a
            href={commanderHref}
            {...(waNumber ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="text-sm font-medium px-4 py-2 rounded-xl transition-all hover:opacity-80"
            style={{ background: primary, color: bg }}
          >
            Commander
          </a>
        </div>
      </header>

      {/* Store Banner */}
      {store.settings?.bannerUrl && (
        <div className="max-w-5xl mx-auto px-4 pt-4">
          <div className="w-full aspect-[3/1] rounded-2xl overflow-hidden border" style={{ borderColor: border }}>
            <img src={store.settings.bannerUrl} alt="Bannière boutique" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* Welcome message */}
      {store.settings?.welcomeMessage && (
        <div
          className="text-center py-4 px-4 text-sm"
          style={{ background: `${primary}10`, borderBottom: `1px solid ${primary}20`, color: primary }}
        >
          {store.settings.welcomeMessage}
        </div>
      )}

      {/* Featured Landing Pages (published campaigns) */}
      {landingPages.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 pt-8">
          <h2 className="text-lg font-bold mb-4" style={{ color: text, ...headingStyle }}>🔥 Offres spéciales</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {landingPages.map(lp => {
              const meta = lp.content._meta
              const heroImage = meta?.imageUrl ?? lp.content.hero.background_image ?? null
              const isAr = meta?.lang === 'ar'
              return (
                <a
                  key={lp.id}
                  href={`${storeBase}/p/${lp.slug}${queryString}`}
                  className="flex-shrink-0 w-48 rounded-2xl overflow-hidden transition-all hover:scale-[1.02]"
                  style={{ background: card, border: `1px solid ${border}` }}
                >
                  {heroImage ? (
                    <div className="h-28 overflow-hidden">
                      <img src={heroImage} alt={lp.title} className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-28 flex items-center justify-center" style={{ background: `${primary}10` }}>
                      <Zap size={28} style={{ color: primary, opacity: 0.4 }} />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="font-semibold text-xs line-clamp-2 leading-snug mb-2" dir={isAr ? 'rtl' : 'ltr'} style={{ color: text }}>
                      {lp.content.hero.headline}
                    </p>
                    {meta?.price && (
                      <p className="font-black text-sm" style={{ color: primary }}>
                        {Number(meta.price).toLocaleString('fr-DZ')} DA
                      </p>
                    )}
                    <div className="mt-2 flex items-center gap-1 text-xs font-medium" style={{ color: primary }}>
                      {isAr ? 'اطلب الآن' : 'Voir l\'offre'} <ArrowRight size={11} />
                    </div>
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* Products */}
      <main id="produits" className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6" style={{ color: text, ...headingStyle }}>
          Nos Produits
        </h1>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Package size={40} style={{ color: textMuted }} />
            <p style={{ color: textMuted }}>Aucun produit disponible pour le moment.</p>
            <p className="text-sm" style={{ color: textMuted, opacity: 0.6 }}>Revenez bientôt !</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {products.map(product => (
              <div
                key={product.id}
                className="rounded-2xl overflow-hidden cursor-pointer group transition-all duration-200 hover:scale-[1.02]"
                style={{ background: card, border: `1px solid ${border}` }}
                onClick={() => openProduct(product)}
              >
                {/* Image */}
                <div className="aspect-square overflow-hidden relative">
                  {product.images?.[0] ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: `${primary}10` }}>
                      <Package size={32} style={{ color: primary, opacity: 0.5 }} />
                    </div>
                  )}
                  {product.compare_price && (
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: '#EF4444', color: '#fff' }}>
                      PROMO
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  <p className="font-medium text-sm truncate" style={{ color: text }}>{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="font-bold text-sm" style={{ color: primary }}>
                      {Number(product.price).toLocaleString('fr-DZ')} DA
                    </p>
                    {product.compare_price && (
                      <p className="text-xs line-through" style={{ color: textMuted }}>
                        {Number(product.compare_price).toLocaleString('fr-DZ')} DA
                      </p>
                    )}
                  </div>
                  {product.colors?.length > 0 && (
                    <p className="text-xs mt-1 truncate" style={{ color: textMuted }}>
                      {product.colors.slice(0, 3).join(', ')}{product.colors.length > 3 ? '…' : ''}
                    </p>
                  )}
                </div>

                {/* CTA */}
                <div
                  className="mx-3 mb-3 py-2 rounded-xl text-xs font-semibold text-center transition-all"
                  style={{ background: `${primary}15`, color: primary, border: `1px solid ${primary}30` }}
                >
                  <ShoppingBag size={12} className="inline mr-1" />
                  Commander
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-8 px-4 mt-8" style={{ borderTop: `1px solid ${border}` }}>
        <p className="text-xs" style={{ color: textMuted }}>
          © {new Date().getFullYear()} {store.name} · Propulsé par{' '}
          <span style={{ color: primary }}>Krenix</span>
        </p>
      </footer>

      {/* Order modal */}
      {selectedProduct && (
        <StoreOrderModal
          product={selectedProduct}
          store={store}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </div>
  )
}
