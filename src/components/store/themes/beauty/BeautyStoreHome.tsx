'use client'

import { useState } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'
import StoreOrderModal from '../../StoreOrderModal'
import { toWaNumber } from '@/lib/whatsapp'
import { sanitizeFontName } from '@/lib/fonts'
import { BEAUTY_TOKENS, BEAUTY_DEFAULTS } from './beautyDefaults'

export default function BeautyStoreHome({ store, products, landingPages = [], landingByProduct = {} }: {
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
    bg: cfg?.colors.background ?? BEAUTY_TOKENS.bg,
    card: cfg?.colors.card ?? BEAUTY_TOKENS.card,
    primary: cfg?.colors.primary ?? BEAUTY_TOKENS.primary,
    secondary: cfg?.colors.secondary ?? BEAUTY_TOKENS.secondary,
    text: cfg?.colors.text ?? BEAUTY_TOKENS.text,
    muted: cfg?.colors.textMuted ?? BEAUTY_TOKENS.textMuted,
    border: cfg?.colors.border ?? BEAUTY_TOKENS.border,
  }
  const headingName = sanitizeFontName(cfg?.fonts?.heading ?? BEAUTY_TOKENS.heading)
  const bodyName = sanitizeFontName(cfg?.fonts?.body ?? BEAUTY_TOKENS.body)
  const H: React.CSSProperties = { fontFamily: `'${headingName}', serif` }
  const B: React.CSSProperties = { fontFamily: `'${bodyName}', sans-serif` }
  const fontUrl = `https://fonts.googleapis.com/css2?family=${headingName.replace(/ /g, '+')}:wght@400;500;600;700&family=${bodyName.replace(/ /g, '+')}:wght@400;500;600;700&display=swap`

  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  const d = BEAUTY_DEFAULTS
  // Merchant overrides for the main editorial slots (dashboard → Contenu de la boutique).
  const sc = store.settings?.storeContent
  const heroHeadline = sc?.heroHeadline?.trim() || d.hero.headline
  const heroSubtitle = sc?.heroSubtitle?.trim() || d.hero.subtitle
  const heroCta = sc?.heroCta?.trim() || d.hero.cta
  const footerTagline = sc?.footerTagline?.trim() || d.footer.tagline
  const heroImage = products.find(p => p.images?.[0])?.images?.[0] ?? null

  const socials = [
    { label: 'Instagram', url: store.settings?.instagram },
    { label: 'Facebook', url: store.settings?.facebook },
    { label: 'TikTok', url: store.settings?.tiktok },
    { label: 'Snapchat', url: store.settings?.snapchat },
    { label: 'YouTube', url: store.settings?.youtube },
  ].filter(s => s.url && s.url.trim())

  return (
    <div id="top" style={{ background: c.bg, color: c.text, minHeight: '100vh', ...B }}>
      <style dangerouslySetInnerHTML={{ __html: `@import url('${fontUrl}');` }} />

      {/* ── Header ── */}
      <header className="sticky top-0 z-10" style={{ background: c.bg, borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {store.logo_url
              ? <img src={store.logo_url} alt={store.name} className="w-9 h-9 rounded-xl object-contain" />
              : <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 700 }}>{store.name.charAt(0)}</div>}
            <span className="text-2xl font-bold" style={H}>{store.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-8 text-sm" style={{ color: c.muted }}>
            {d.navLinks.map(l => <a key={l.href} href={l.href} className="hover:opacity-70 transition-opacity">{l.label}</a>)}
          </nav>
          <a href={commanderHref} {...(waNumber ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: c.primary, color: '#fff' }}>Commander</a>
        </div>
      </header>

      {/* Store Banner */}
      {store.settings?.bannerUrl && (
        <div className="max-w-6xl mx-auto px-5 pt-5">
          <div className="w-full aspect-[3/1] rounded-3xl overflow-hidden border" style={{ borderColor: c.border }}>
            <img src={store.settings.bannerUrl} alt="Bannière boutique" className="w-full h-full object-cover" />
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-12 items-center">
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{d.hero.kicker}</span>
          <h1 className="text-5xl md:text-6xl font-semibold leading-none mt-4 mb-5" style={{ ...H, color: c.text }}>{heroHeadline}</h1>
          <p className="text-lg mb-8 leading-relaxed" style={{ color: c.muted, maxWidth: 440 }}>{heroSubtitle}</p>
          <a href="#produits" className="inline-block px-8 py-4 rounded-full font-semibold transition-all hover:opacity-90"
            style={{ background: c.primary, color: '#fff' }}>{heroCta}</a>
        </div>
        <div className="rounded-3xl overflow-hidden aspect-square" style={{ border: `1px solid ${c.border}`, background: `linear-gradient(135deg, ${c.primary}22, ${c.secondary}14)` }}>
          {/* Hero is the LCP element — load it eagerly and at high priority.
              Lazy-loading here would delay the largest paint, not speed it up. */}
          {heroImage && <img src={heroImage} alt="" fetchPriority="high" decoding="async" className="w-full h-full object-cover" />}
        </div>
      </section>

      {/* ── Collections ── */}
      <section className="max-w-6xl mx-auto px-5 pb-4">
        <div className="grid sm:grid-cols-3 gap-4">
          {d.collections.map(col => (
            <a key={col.name} href="#produits" className="block rounded-2xl p-6 transition-all hover:scale-[1.01]"
              style={{ background: c.card, border: `1px solid ${c.border}` }}>
              <p className="text-xl font-semibold" style={{ ...H, color: c.text }}>{col.name}</p>
              <p className="text-sm mt-1" style={{ color: c.muted }}>{col.sub}</p>
            </a>
          ))}
        </div>
      </section>

      {/* ── Featured campaigns ── */}
      {landingPages.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-10">
          <h2 className="text-3xl font-semibold mb-5" style={{ ...H, color: c.text }}>Offres spéciales</h2>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {landingPages.map(lp => {
              const meta = lp.content._meta
              const img = meta?.imageUrl ?? lp.content.hero.background_image ?? null
              return (
                <a key={lp.id} href={`${storeBase}/p/${lp.slug}${qs}`}
                  className="flex-shrink-0 w-56 rounded-2xl overflow-hidden transition-all hover:scale-[1.02]"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}>
                  <div className="h-32 overflow-hidden" style={{ background: `${c.primary}0d` }}>
                    {img && <img src={img} alt={lp.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold line-clamp-2 leading-snug" style={{ ...H, color: c.text }}>{lp.content.hero.headline}</p>
                    {meta?.price != null && <p className="mt-2 font-bold" style={{ color: c.primary }}>{Number(meta.price).toLocaleString('fr-DZ')} DA</p>}
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Products ── */}
      <main id="produits" className="max-w-6xl mx-auto px-5 py-14">
        <div className="text-center mb-10">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>Boutique</span>
          <h2 className="text-4xl font-semibold mt-2" style={{ ...H, color: c.text }}>Nos Produits</h2>
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
                className="cursor-pointer group overflow-hidden transition-all hover:scale-[1.01]"
                style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 16 }}>
                <div className="aspect-square overflow-hidden relative" style={{ background: `${c.primary}0d` }}>
                  {product.images?.[0]
                    ? <img src={product.images[0]} alt={product.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: c.primary, opacity: 0.5 }}>✦</div>}
                  {product.compare_price && <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg text-xs font-bold" style={{ background: c.primary, color: '#fff' }}>PROMO</span>}
                </div>
                <div className="p-3.5">
                  <div className="text-xs mb-1" style={{ color: c.secondary }}>★★★★★</div>
                  <p className="text-sm truncate" style={{ ...H, fontWeight: 600, color: c.text }}>{product.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span style={{ ...H, fontWeight: 700, color: c.primary }}>{Number(product.price).toLocaleString('fr-DZ')} DA</span>
                    {product.compare_price && <span className="text-xs line-through" style={{ color: c.muted }}>{Number(product.compare_price).toLocaleString('fr-DZ')} DA</span>}
                  </div>
                </div>
                <div className="mx-3.5 mb-3.5 py-2 rounded-xl text-xs font-semibold text-center"
                  style={{ background: `${c.primary}15`, color: c.primary, border: `1px solid ${c.primary}30` }}>Commander</div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Promo banners ── */}
      <section className="max-w-6xl mx-auto px-5 pb-14 grid md:grid-cols-2 gap-5">
        {d.promo.map((p, i) => (
          <div key={i} className="rounded-3xl p-10 flex flex-col justify-center"
            style={{ background: i === 0 ? `${c.primary}0d` : `${c.secondary}0d`, border: `1px solid ${c.border}` }}>
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{p.kicker}</span>
            <p className="text-3xl font-semibold my-3" style={{ ...H, color: c.text }}>{i === 0 ? (sc?.promoTitle?.trim() || p.title) : p.title}</p>
            <a href="#produits" className="text-sm font-semibold inline-flex items-center gap-1" style={{ color: c.primary }}>{p.cta} →</a>
          </div>
        ))}
      </section>

      {/* ── About + stats ── */}
      <section id="apropos" style={{ background: c.card, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-4xl mx-auto px-5 py-16 text-center">
          <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: c.primary }}>{d.about.kicker}</span>
          <h2 className="text-4xl font-semibold mt-3 mb-4" style={{ ...H, color: c.text }}>{d.about.title}</h2>
          <p className="text-lg leading-relaxed mx-auto" style={{ color: c.muted, maxWidth: 560 }}>{store.settings?.bio?.trim() || d.about.body}</p>
          <div className="grid grid-cols-3 gap-6 mt-12">
            {d.about.stats.map(s => (
              <div key={s.label}>
                <p className="text-3xl font-bold" style={{ ...H, color: c.primary }}>{s.value}</p>
                <p className="text-sm mt-1" style={{ color: c.muted }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust row ── */}
      <section className="max-w-6xl mx-auto px-5 py-14 grid grid-cols-2 md:grid-cols-4 gap-6">
        {d.trust.map(t => (
          <div key={t.title} className="text-center">
            <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center" style={{ background: `${c.primary}14`, color: c.primary }}>✓</div>
            <p className="font-semibold text-sm" style={{ ...H, color: c.text }}>{t.title}</p>
            <p className="text-xs mt-1" style={{ color: c.muted }}>{t.sub}</p>
          </div>
        ))}
      </section>

      {/* ── Footer ── */}
      <footer id="contact" style={{ background: c.bg, borderTop: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              {store.logo_url
                ? <img src={store.logo_url} alt={store.name} className="w-8 h-8 rounded-lg object-contain" />
                : <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 700 }}>{store.name.charAt(0)}</div>}
              <span className="text-xl font-bold" style={H}>{store.name}</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: c.muted, maxWidth: 320 }}>{footerTagline}</p>
            {socials.length > 0 && (
              <div className="flex gap-4 mt-4 text-sm" style={{ color: c.primary }}>
                {socials.map(s => <a key={s.label} href={s.url!} target="_blank" rel="noopener noreferrer" className="hover:opacity-70">{s.label}</a>)}
              </div>
            )}
          </div>
          {d.footer.columns.map(col => (
            <div key={col.title}>
              <p className="font-semibold text-sm mb-3" style={{ ...H, color: c.text }}>{col.title}</p>
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

      {/* Order modal */}
      {selected && <StoreOrderModal product={selected} store={store} onClose={() => setSelected(null)} />}
    </div>
  )
}
