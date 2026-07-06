'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'
import StoreOrderModal from '../../StoreOrderModal'
import { toWaNumber } from '@/lib/whatsapp'
import { SPORT_TOKENS, SPORT_DEFAULTS } from './sportDefaults'

export default function SportStoreHome({ store, products, landingPages = [], landingByProduct = {} }: {
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
    bg: cfg?.colors.background ?? SPORT_TOKENS.bg,
    card: cfg?.colors.card ?? SPORT_TOKENS.card,
    primary: cfg?.colors.primary ?? SPORT_TOKENS.primary,
    secondary: cfg?.colors.secondary ?? SPORT_TOKENS.secondary,
    text: cfg?.colors.text ?? SPORT_TOKENS.text,
    muted: cfg?.colors.textMuted ?? SPORT_TOKENS.textMuted,
    border: cfg?.colors.border ?? SPORT_TOKENS.border,
  }
  const headingName = cfg?.fonts?.heading ?? SPORT_TOKENS.heading
  const bodyName = cfg?.fonts?.body ?? SPORT_TOKENS.body
  const H: React.CSSProperties = { fontFamily: `'${headingName}', sans-serif`, textTransform: 'uppercase', letterSpacing: '0.01em' }
  const B: React.CSSProperties = { fontFamily: `'${bodyName}', sans-serif` }
  const fontUrl = `https://fonts.googleapis.com/css2?family=${headingName.replace(/ /g, '+')}:wght@500;600;700;800;900&family=${bodyName.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`

  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  const d = SPORT_DEFAULTS
  const sc = store.settings?.storeContent
  const heroHeadline = sc?.heroHeadline?.trim() || d.hero.headline
  const heroSubtitle = sc?.heroSubtitle?.trim() || d.hero.subtitle
  const heroCta = sc?.heroCta?.trim() || d.hero.cta
  const statsTitle = sc?.promoTitle?.trim() || d.statsTitle
  const footerTagline = sc?.footerTagline?.trim() || d.footer.tagline

  const heroProduct = products.find(p => p.images?.[0]) ?? products[0] ?? null

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
      <div className="text-center text-xs py-2 px-4 font-bold uppercase tracking-wider" style={{ background: c.primary, color: '#111' }}>
        {d.announcement}
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-10" style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name} className="w-9 h-9 rounded-lg object-contain" />
              : <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: c.primary, color: '#111', ...H, fontWeight: 800 }}>{store.name.charAt(0)}</div>}
            <span className="text-2xl font-extrabold" style={H}>{store.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
            {d.navLinks.map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
          </nav>
          <a href={commanderHref} {...(waNumber ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="px-5 py-2.5 rounded-lg text-sm font-extrabold uppercase tracking-wide transition-all hover:opacity-90"
            style={{ background: c.primary, color: '#111' }}>Commander</a>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-5" style={{ background: `${c.primary}1f`, color: c.primary }}>{d.hero.kicker}</span>
            <h1 className="text-6xl md:text-7xl font-extrabold leading-[0.95] mb-5" style={{ ...H, color: c.text }}>{heroHeadline}</h1>
            <p className="text-lg mb-8 leading-relaxed" style={{ color: c.muted, maxWidth: 440 }}>{heroSubtitle}</p>
            <a href="#produits" className="inline-block px-9 py-4 rounded-lg font-extrabold uppercase tracking-wide transition-all hover:opacity-90"
              style={{ background: c.primary, color: '#111' }}>{heroCta}</a>
          </div>
          <div className="rounded-2xl overflow-hidden aspect-square" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            {heroProduct?.images?.[0]
              ? <img src={heroProduct.images[0]} alt={heroProduct.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-6xl font-black" style={{ color: c.primary, opacity: 0.35, ...H }}>⚡</div>}
          </div>
        </div>
      </section>

      {/* ── Paths / objectives ── */}
      <section id="objectifs" className="max-w-6xl mx-auto px-5 py-14">
        <h2 className="text-4xl font-extrabold mb-8" style={{ ...H, color: c.text }}>{d.pathsTitle}</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {d.paths.map(p => (
            <a key={p.name} href="#produits" className="block rounded-xl p-6 transition-all hover:-translate-y-1"
              style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <p className="text-2xl font-extrabold" style={{ ...H, color: c.primary }}>{p.name}</p>
              <p className="text-sm mt-1" style={{ color: c.muted }}>{p.sub}</p>
            </a>
          ))}
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
                    {img && <img src={img} alt={lp.title} className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-3.5">
                    <p className="text-sm font-bold uppercase line-clamp-2 leading-snug" style={{ ...H, color: c.text }}>{lp.content.hero.headline}</p>
                    {meta?.price != null && <p className="mt-2 font-extrabold" style={{ color: c.primary }}>{priceTag(meta.price)}</p>}
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Products ── */}
      <main id="produits" className="max-w-6xl mx-auto px-5 py-12">
        <div className="flex items-end justify-between mb-8">
          <h2 className="text-4xl font-extrabold" style={{ ...H, color: c.text }}>{d.productsTitle}</h2>
          <span className="text-sm uppercase tracking-wide" style={{ color: c.muted }}>{products.length} produit{products.length > 1 ? 's' : ''}</span>
        </div>
        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <p style={{ color: c.muted }}>Aucun produit disponible pour le moment.</p>
            <p className="text-sm" style={{ color: c.muted, opacity: 0.6 }}>Reviens bientôt !</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map(product => (
              <div key={product.id} onClick={() => openProduct(product)}
                className="cursor-pointer group overflow-hidden transition-all hover:-translate-y-1"
                style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 12 }}>
                <div className="aspect-square overflow-hidden relative" style={{ background: '#0F0F0F' }}>
                  {product.images?.[0]
                    ? <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color: c.primary, opacity: 0.35 }}>⚡</div>}
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-extrabold uppercase" style={{ background: c.primary, color: '#111' }}>Promo</span>}
                </div>
                <div className="p-3.5">
                  <p className="text-base font-bold uppercase truncate" style={{ ...H, color: c.text }}>{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-extrabold" style={{ color: c.primary }}>{priceTag(product.price)}</span>
                    {product.compare_price && <span className="text-xs line-through" style={{ color: c.muted }}>{priceTag(product.compare_price)}</span>}
                  </div>
                  <div className="mt-3 py-2 rounded-lg text-xs font-extrabold uppercase tracking-wide text-center transition-all group-hover:opacity-90" style={{ background: c.primary, color: '#111' }}>Commander</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Stats band ── */}
      <section style={{ background: c.card, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-12">
          <h2 className="text-3xl font-extrabold text-center mb-8" style={{ ...H, color: c.text }}>{statsTitle}</h2>
          <div className="grid grid-cols-3 gap-6">
            {d.stats.map(s => (
              <div key={s.label} className="text-center">
                <p className="text-4xl md:text-5xl font-black" style={{ ...H, color: c.primary }}>{s.value}</p>
                <p className="text-xs md:text-sm mt-1 uppercase tracking-wide" style={{ color: c.muted }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Transformations ── */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <h2 className="text-4xl font-extrabold mb-8" style={{ ...H, color: c.text }}>{d.transformationsTitle}</h2>
        <div className="grid md:grid-cols-3 gap-4">
          {d.transformations.map(t => (
            <div key={t.name} className="rounded-xl p-6" style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <div className="text-sm mb-3" style={{ color: c.primary }}>★★★★★</div>
              <p className="text-sm leading-relaxed mb-4" style={{ color: c.text }}>{t.text}</p>
              <p className="text-sm font-bold uppercase" style={{ ...H, color: c.text }}>{t.name}</p>
              <p className="text-xs" style={{ color: c.muted }}>{t.location}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ background: '#0F0F0F', borderTop: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              {store.logo_url
                ? <img src={store.logo_url} alt={store.name} className="w-8 h-8 rounded-lg object-contain" />
                : <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.primary, color: '#111', ...H, fontWeight: 800 }}>{store.name.charAt(0)}</div>}
              <span className="text-xl font-extrabold" style={H}>{store.name}</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: c.muted, maxWidth: 320 }}>{footerTagline}</p>
            {socials.length > 0 && (
              <div className="flex gap-4 mt-4 text-sm font-semibold uppercase" style={{ color: c.primary }}>
                {socials.map(s => <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer" className="hover:opacity-70">{s.label}</a>)}
              </div>
            )}
          </div>
          {d.footer.columns.map(col => (
            <div key={col.title}>
              <p className="font-bold text-sm mb-3 uppercase" style={{ ...H, color: c.text }}>{col.title}</p>
              <ul className="space-y-2 text-sm" style={{ color: c.muted }}>
                {col.links.map(link => <li key={link}><a href="#produits" className="hover:opacity-70">{link}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center py-5 text-xs uppercase tracking-wide" style={{ color: c.muted, borderTop: `1px solid ${c.border}` }}>
          © {new Date().getFullYear()} {store.name} · Propulsé par <span style={{ color: c.primary }}>Krenix</span>
        </div>
      </footer>

      {selected && <StoreOrderModal product={selected} store={store} onClose={() => setSelected(null)} />}
    </div>
  )
}
