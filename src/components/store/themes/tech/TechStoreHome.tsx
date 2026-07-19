'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'
import StoreOrderModal from '../../StoreOrderModal'
import { toWaNumber } from '@/lib/whatsapp'
import { sanitizeFontName } from '@/lib/fonts'
import { TECH_TOKENS, TECH_DEFAULTS } from './techDefaults'

export default function TechStoreHome({ store, products, landingPages = [], landingByProduct = {} }: {
  store: Store; products: Product[]; landingPages?: LandingPage[]; landingByProduct?: Record<string, string>
}) {
  const [selected, setSelected] = useState<Product | null>(null)
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
  // A product backing a published landing page opens that page instead of the modal.
  const openProduct = (p: Product) => {
    const ls = landingByProduct[p.id]
    if (ls) { router.push(`${storeBase}/p/${ls}${qs}`); return }
    setSelected(p)
  }

  const cfg = store.theme?.config
  const c = {
    bg: cfg?.colors.background ?? TECH_TOKENS.bg,
    card: cfg?.colors.card ?? TECH_TOKENS.card,
    primary: cfg?.colors.primary ?? TECH_TOKENS.primary,
    secondary: cfg?.colors.secondary ?? TECH_TOKENS.secondary,
    text: cfg?.colors.text ?? TECH_TOKENS.text,
    muted: cfg?.colors.textMuted ?? TECH_TOKENS.textMuted,
    border: cfg?.colors.border ?? TECH_TOKENS.border,
  }
  const headingName = sanitizeFontName(cfg?.fonts?.heading ?? TECH_TOKENS.heading)
  const bodyName = sanitizeFontName(cfg?.fonts?.body ?? TECH_TOKENS.body)
  const H: React.CSSProperties = { fontFamily: `'${headingName}', sans-serif` }
  const B: React.CSSProperties = { fontFamily: `'${bodyName}', sans-serif` }
  const fontUrl = `https://fonts.googleapis.com/css2?family=${headingName.replace(/ /g, '+')}:wght@400;500;600;700;800&family=${bodyName.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`

  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  const d = TECH_DEFAULTS
  const sc = store.settings?.storeContent
  const heroHeadline = sc?.heroHeadline?.trim() || d.hero.headline
  const heroSubtitle = sc?.heroSubtitle?.trim() || d.hero.subtitle
  const heroCta = sc?.heroCta?.trim() || d.hero.cta
  const hotDealTitle = sc?.promoTitle?.trim() || d.hotDeal.title
  const footerTagline = sc?.footerTagline?.trim() || d.footer.tagline

  const heroProduct = products.find(p => p.images?.[0]) ?? products[0] ?? null
  const dealProduct = products.find(p => p.compare_price) ?? products[0] ?? null

  const socials = [
    { label: 'Instagram', url: store.settings?.instagram },
    { label: 'Facebook', url: store.settings?.facebook },
    { label: 'TikTok', url: store.settings?.tiktok },
    { label: 'YouTube', url: store.settings?.youtube },
  ].filter(s => s.url && s.url.trim())

  const priceTag = (n: number) => `${Number(n).toLocaleString('fr-DZ')} DA`

  return (
    <div id="top" style={{ background: c.bg, color: c.text, minHeight: '100vh', ...B }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('${fontUrl}');` }} />

      {/* ── Announcement ── */}
      <div className="text-center text-xs py-2 px-4 font-medium" style={{ background: c.text, color: '#fff' }}>
        {d.announcement}
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-10" style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name} className="w-9 h-9 rounded-lg object-contain" />
              : <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 700 }}>{store.name.charAt(0)}</div>}
            <span className="text-xl font-extrabold tracking-tight" style={H}>{store.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium" style={{ color: c.muted }}>
            {d.navLinks.map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
          </nav>
          <a href={commanderHref} {...(waNumber ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:opacity-90"
            style={{ background: c.primary, color: '#fff' }}>Commander</a>
        </div>
      </header>

      {/* Store Banner */}
      {store.settings?.bannerUrl && (
        <div className="max-w-6xl mx-auto px-5 pt-5">
          <div className="w-full aspect-[3/1] rounded-xl overflow-hidden border" style={{ borderColor: c.border }}>
            <img src={store.settings.bannerUrl} alt="Bannière boutique" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* ── Hero (split) ── */}
      <section className="max-w-6xl mx-auto px-5 py-14 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-5" style={{ background: `${c.primary}1a`, color: c.primary }}>{d.hero.kicker}</span>
          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4" style={{ ...H, color: c.text }}>{heroHeadline}</h1>
          <p className="text-lg mb-7 leading-relaxed" style={{ color: c.muted, maxWidth: 440 }}>{heroSubtitle}</p>
          <div className="flex items-center gap-3">
            <a href="#produits" className="px-7 py-3.5 rounded-lg font-bold transition-all hover:opacity-90" style={{ background: c.primary, color: '#fff' }}>{heroCta}</a>
            {heroProduct && <a href="#produits" className="px-6 py-3.5 rounded-lg font-semibold transition-all hover:bg-black/5" style={{ border: `1px solid ${c.border}`, color: c.text }}>Voir l’offre</a>}
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl" style={{ background: `${c.primary}14`, transform: 'rotate(-3deg)' }} />
          <div className="relative rounded-3xl overflow-hidden aspect-square" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            {heroProduct?.images?.[0]
              ? <img src={heroProduct.images[0]} alt={heroProduct.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: c.primary, opacity: 0.4 }}>◈</div>}
          </div>
        </div>
      </section>

      {/* ── Featured campaigns ── */}
      {landingPages.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pb-4">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {landingPages.map(lp => {
              const meta = lp.content._meta
              const img = meta?.imageUrl ?? lp.content.hero.background_image ?? null
              return (
                <a key={lp.id} href={`${storeBase}/p/${lp.slug}${qs}`}
                  className="flex-shrink-0 w-56 rounded-xl overflow-hidden transition-all hover:-translate-y-0.5"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}>
                  <div className="h-32 overflow-hidden" style={{ background: `${c.primary}0d` }}>
                    {img && <img src={img} alt={lp.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm font-semibold line-clamp-2 leading-snug" style={{ color: c.text }}>{lp.content.hero.headline}</p>
                    {meta?.price != null && <p className="mt-2 font-extrabold" style={{ color: c.primary }}>{priceTag(meta.price)}</p>}
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Popular products ── */}
      <main id="produits" className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-3xl font-extrabold" style={{ ...H, color: c.text }}>{d.popularTitle}</h2>
          <span className="text-sm" style={{ color: c.muted }}>{products.length} produit{products.length > 1 ? 's' : ''}</span>
        </div>
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p style={{ color: c.muted }}>Aucun produit disponible pour le moment.</p>
            <p className="text-sm" style={{ color: c.muted, opacity: 0.6 }}>Revenez bientôt !</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map(product => (
              <div key={product.id} onClick={() => openProduct(product)}
                className="cursor-pointer group overflow-hidden transition-all hover:-translate-y-1"
                style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 14 }}>
                <div className="aspect-square overflow-hidden relative" style={{ background: '#fff' }}>
                  {product.images?.[0]
                    ? <img src={product.images[0]} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: c.primary, opacity: 0.4 }}>◈</div>}
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md text-xs font-bold" style={{ background: c.secondary, color: '#fff' }}>PROMO</span>}
                </div>
                <div className="p-3.5">
                  <p className="text-sm font-semibold truncate" style={{ color: c.text }}>{product.name}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="font-extrabold" style={{ color: c.text }}>{priceTag(product.price)}</span>
                    {product.compare_price && <span className="text-xs line-through" style={{ color: c.muted }}>{priceTag(product.compare_price)}</span>}
                  </div>
                  <div className="mt-3 py-2 rounded-lg text-xs font-bold text-center transition-all group-hover:opacity-90" style={{ background: c.primary, color: '#fff' }}>Commander</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Hot deal of the week ── */}
      {dealProduct && (
        <section id="offre" style={{ background: c.text }}>
          <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-2 gap-8 items-center">
            <div className="rounded-2xl overflow-hidden aspect-video md:aspect-square" style={{ background: '#fff' }}>
              {dealProduct.images?.[0]
                ? <img src={dealProduct.images[0]} alt={dealProduct.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: c.primary, opacity: 0.5 }}>◈</div>}
            </div>
            <div style={{ color: '#fff' }}>
              <span className="inline-block px-3 py-1 rounded-full text-xs font-bold mb-4" style={{ background: c.primary, color: '#fff' }}>{d.hotDeal.kicker}</span>
              <h2 className="text-3xl md:text-4xl font-extrabold mb-3" style={H}>{hotDealTitle}</h2>
              <p className="text-base mb-5" style={{ color: 'rgba(255,255,255,0.65)' }}>{dealProduct.name}</p>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl font-extrabold" style={{ color: c.primary }}>{priceTag(dealProduct.price)}</span>
                {dealProduct.compare_price && <span className="text-lg line-through" style={{ color: 'rgba(255,255,255,0.5)' }}>{priceTag(dealProduct.compare_price)}</span>}
                <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ background: c.secondary, color: '#fff' }}>{d.hotDeal.note}</span>
              </div>
              <button onClick={() => openProduct(dealProduct)}
                className="px-8 py-3.5 rounded-lg font-bold transition-all hover:opacity-90" style={{ background: c.primary, color: '#fff' }}>{d.hotDeal.cta}</button>
            </div>
          </div>
        </section>
      )}

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-2 md:grid-cols-4 gap-5">
        {d.features.map(f => (
          <div key={f.title} className="rounded-xl p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <div className="w-10 h-10 rounded-lg mb-3 flex items-center justify-center font-bold" style={{ background: `${c.primary}1a`, color: c.primary }}>✓</div>
            <p className="font-bold text-sm" style={{ color: c.text }}>{f.title}</p>
            <p className="text-xs mt-1" style={{ color: c.muted }}>{f.sub}</p>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ background: c.card, borderTop: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              {store.logo_url
                ? <img src={store.logo_url} alt={store.name} className="w-8 h-8 rounded-lg object-contain" />
                : <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 700 }}>{store.name.charAt(0)}</div>}
              <span className="text-lg font-extrabold" style={H}>{store.name}</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: c.muted, maxWidth: 320 }}>{footerTagline}</p>
            {socials.length > 0 && (
              <div className="flex gap-4 mt-4 text-sm font-medium" style={{ color: c.primary }}>
                {socials.map(s => <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer" className="hover:opacity-70">{s.label}</a>)}
              </div>
            )}
          </div>
          {d.footer.columns.map(col => (
            <div key={col.title}>
              <p className="font-bold text-sm mb-3" style={{ color: c.text }}>{col.title}</p>
              <ul className="space-y-2 text-sm" style={{ color: c.muted }}>
                {col.links.map(link => <li key={link}><a href="#produits" className="hover:opacity-70">{link}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center py-5 text-xs" style={{ color: c.muted, borderTop: `1px solid ${c.border}` }}>
          © {new Date().getFullYear()} {store.name} · Propulsé par <span style={{ color: c.primary }}>Krenix</span>
        </div>
      </footer>

      {selected && <StoreOrderModal product={selected} store={store} onClose={() => setSelected(null)} />}
    </div>
  )
}
