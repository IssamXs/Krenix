'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'
import StoreOrderModal from '../../StoreOrderModal'
import { toWaNumber } from '@/lib/whatsapp'
import { CAR_TOKENS, CAR_DEFAULTS } from './carDefaults'

export default function CarStoreHome({ store, products, landingPages = [], landingByProduct = {} }: {
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
    bg: cfg?.colors.background ?? CAR_TOKENS.bg,
    card: cfg?.colors.card ?? CAR_TOKENS.card,
    primary: cfg?.colors.primary ?? CAR_TOKENS.primary,
    secondary: cfg?.colors.secondary ?? CAR_TOKENS.secondary,
    text: cfg?.colors.text ?? CAR_TOKENS.text,
    muted: cfg?.colors.textMuted ?? CAR_TOKENS.textMuted,
    border: cfg?.colors.border ?? CAR_TOKENS.border,
  }
  const headingName = cfg?.fonts?.heading ?? CAR_TOKENS.heading
  const bodyName = cfg?.fonts?.body ?? CAR_TOKENS.body
  const H: React.CSSProperties = { fontFamily: `'${headingName}', sans-serif`, textTransform: 'uppercase', letterSpacing: '0.01em' }
  const B: React.CSSProperties = { fontFamily: `'${bodyName}', sans-serif` }
  const fontUrl = `https://fonts.googleapis.com/css2?family=${headingName.replace(/ /g, '+')}:wght@500;600;700;800;900&family=${bodyName.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`

  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  const d = CAR_DEFAULTS
  const sc = store.settings?.storeContent
  const heroHeadline = sc?.heroHeadline?.trim() || d.hero.headline
  const heroSubtitle = sc?.heroSubtitle?.trim() || d.hero.subtitle
  const heroCta = sc?.heroCta?.trim() || d.hero.cta
  const dealTitle = sc?.promoTitle?.trim() || d.deal.title
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
      <div className="text-center text-xs py-2 px-4 font-bold uppercase tracking-wider" style={{ background: c.secondary, color: '#fff' }}>
        {d.announcement}
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-10" style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name} className="w-9 h-9 rounded object-contain" />
              : <div className="w-9 h-9 rounded flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 800 }}>{store.name.charAt(0)}</div>}
            <span className="text-2xl font-extrabold" style={H}>{store.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm font-semibold uppercase tracking-wide" style={{ color: c.muted }}>
            {d.navLinks.map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
          </nav>
          <a href={commanderHref} {...(waNumber ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="px-5 py-2.5 rounded text-sm font-extrabold uppercase tracking-wide transition-all hover:opacity-90"
            style={{ background: c.primary, color: '#fff' }}>Commander</a>
        </div>
      </header>

      {/* ── Hero (dark band) ── */}
      <section style={{ background: c.secondary }}>
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-5" style={{ background: c.primary, color: '#fff' }}>{d.hero.kicker}</span>
            <h1 className="text-6xl md:text-7xl font-extrabold leading-[0.92] mb-5" style={{ ...H, color: '#fff' }}>{heroHeadline}</h1>
            <p className="text-lg mb-8 leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)', maxWidth: 440 }}>{heroSubtitle}</p>
            <a href="#produits" className="inline-block px-9 py-4 rounded font-extrabold uppercase tracking-wide transition-all hover:opacity-90"
              style={{ background: c.primary, color: '#fff' }}>{heroCta}</a>
          </div>
          <div className="rounded-lg overflow-hidden aspect-square" style={{ background: '#1c1c1c', border: '1px solid rgba(255,255,255,0.1)' }}>
            {heroProduct?.images?.[0]
              ? <img src={heroProduct.images[0]} alt={heroProduct.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-6xl" style={{ color: c.primary, opacity: 0.5 }}>◆</div>}
          </div>
        </div>
      </section>

      {/* ── Categories ── */}
      <section className="max-w-6xl mx-auto px-5 py-14">
        <h2 className="text-4xl font-extrabold mb-8" style={{ ...H, color: c.text }}>{d.categoriesTitle}</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          {d.categories.map(cat => (
            <a key={cat.name} href="#produits" className="block rounded-lg p-6 transition-all hover:-translate-y-1"
              style={{ background: c.card, border: `1px solid ${c.border}`, borderLeft: `4px solid ${c.primary}` }}>
              <p className="text-2xl font-extrabold" style={{ ...H, color: c.text }}>{cat.name}</p>
              <p className="text-sm mt-1" style={{ color: c.muted }}>{cat.sub}</p>
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
                  className="flex-shrink-0 w-56 rounded-lg overflow-hidden transition-all hover:-translate-y-0.5"
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
            <p className="text-sm" style={{ color: c.muted, opacity: 0.6 }}>Revenez bientôt !</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {products.map(product => (
              <div key={product.id} onClick={() => openProduct(product)}
                className="cursor-pointer group overflow-hidden transition-all hover:-translate-y-1"
                style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 8 }}>
                <div className="aspect-square overflow-hidden relative" style={{ background: '#EDEDED' }}>
                  {product.images?.[0]
                    ? <img src={product.images[0]} alt={product.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    : <div className="w-full h-full flex items-center justify-center text-3xl" style={{ color: c.primary, opacity: 0.4 }}>◆</div>}
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-extrabold uppercase" style={{ background: c.primary, color: '#fff' }}>Promo</span>}
                </div>
                <div className="p-3.5">
                  <p className="text-base font-bold uppercase truncate" style={{ ...H, color: c.text }}>{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-extrabold" style={{ color: c.primary }}>{priceTag(product.price)}</span>
                    {product.compare_price && <span className="text-xs line-through" style={{ color: c.muted }}>{priceTag(product.compare_price)}</span>}
                  </div>
                  <div className="mt-3 py-2 rounded text-xs font-extrabold uppercase tracking-wide text-center transition-all group-hover:opacity-90" style={{ background: c.secondary, color: '#fff' }}>Commander</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Deal band ── */}
      {dealProduct && (
        <section id="offre" style={{ background: c.primary }}>
          <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-2 gap-8 items-center">
            <div style={{ color: '#fff' }}>
              <span className="inline-block px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-4" style={{ background: '#fff', color: c.primary }}>{d.deal.kicker}</span>
              <h2 className="text-4xl md:text-5xl font-extrabold mb-3" style={H}>{dealTitle}</h2>
              <p className="text-base mb-5" style={{ color: 'rgba(255,255,255,0.85)' }}>{dealProduct.name}</p>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-3xl font-extrabold" style={{ color: '#fff' }}>{priceTag(dealProduct.price)}</span>
                {dealProduct.compare_price && <span className="text-lg line-through" style={{ color: 'rgba(255,255,255,0.6)' }}>{priceTag(dealProduct.compare_price)}</span>}
                <span className="text-xs font-bold px-2 py-1 rounded uppercase" style={{ background: c.secondary, color: '#fff' }}>{d.deal.note}</span>
              </div>
              <button onClick={() => openProduct(dealProduct)}
                className="px-8 py-3.5 rounded font-extrabold uppercase tracking-wide transition-all hover:opacity-90" style={{ background: c.secondary, color: '#fff' }}>{d.deal.cta}</button>
            </div>
            <div className="rounded-lg overflow-hidden aspect-video md:aspect-square order-first md:order-last" style={{ background: '#1c1c1c' }}>
              {dealProduct.images?.[0]
                ? <img src={dealProduct.images[0]} alt={dealProduct.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: '#fff', opacity: 0.4 }}>◆</div>}
            </div>
          </div>
        </section>
      )}

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-5 py-12 grid grid-cols-2 md:grid-cols-4 gap-5">
        {d.features.map(f => (
          <div key={f.title} className="rounded-lg p-5" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <div className="w-10 h-10 rounded mb-3 flex items-center justify-center font-bold" style={{ background: `${c.primary}14`, color: c.primary }}>✓</div>
            <p className="font-bold text-sm uppercase" style={{ ...H, color: c.text }}>{f.title}</p>
            <p className="text-xs mt-1" style={{ color: c.muted }}>{f.sub}</p>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ background: c.secondary, borderTop: `3px solid ${c.primary}` }}>
        <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              {store.logo_url
                ? <img src={store.logo_url} alt={store.name} className="w-8 h-8 rounded object-contain" />
                : <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 800 }}>{store.name.charAt(0)}</div>}
              <span className="text-xl font-extrabold" style={{ ...H, color: '#fff' }}>{store.name}</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 320 }}>{footerTagline}</p>
            {socials.length > 0 && (
              <div className="flex gap-4 mt-4 text-sm font-semibold uppercase" style={{ color: c.primary }}>
                {socials.map(s => <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer" className="hover:opacity-70">{s.label}</a>)}
              </div>
            )}
          </div>
          {d.footer.columns.map(col => (
            <div key={col.title}>
              <p className="font-bold text-sm mb-3 uppercase" style={{ ...H, color: '#fff' }}>{col.title}</p>
              <ul className="space-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {col.links.map(link => <li key={link}><a href="#produits" className="hover:opacity-90">{link}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="text-center py-5 text-xs uppercase tracking-wide" style={{ color: 'rgba(255,255,255,0.4)', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          © {new Date().getFullYear()} {store.name} · Propulsé par <span style={{ color: c.primary }}>Novalux</span>
        </div>
      </footer>

      {selected && <StoreOrderModal product={selected} store={store} onClose={() => setSelected(null)} />}
    </div>
  )
}
