'use client'

import { useState } from 'react'
import Image from 'next/image'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import type { Store, Product, LandingPage } from '@/types/database'

import { toWaNumber } from '@/lib/whatsapp'
import { sanitizeFontName } from '@/lib/fonts'
import { HOME_TOKENS, HOME_DEFAULTS } from './homeDefaults'
import ProductCardImage from '../../ProductCardImage'
import GoogleFontLoader from '../../GoogleFontLoader'
import { normalizeSocialUrl } from '@/lib/social-links'
import { getHomepageEditor } from '@/lib/homepage-editor'
import { resolveSiteMenuLinks } from '@/lib/site-menu'
import HeroGallery from '../../HeroGallery'
import AutoCatalog from '../../AutoCatalog'

export default function HomeStoreHome({ store, products, landingPages = [], landingByProduct = {} }: {
  store: Store; products: Product[]; landingPages?: LandingPage[]; landingByProduct?: Record<string, string>
}) {
  // Products with an active promotional offer surface first so a promo
  // isn't buried below the fold; stable sort preserves relative order
  // within each group.
  const sortedProducts = [...products].sort((a, b) => Number(!!b.offer_active) - Number(!!a.offer_active))

  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''
  const qs = searchParams.toString() ? `?${searchParams.toString()}` : ''
  // A product backing a published landing page opens that page instead of the default product page.
  const openProduct = (p: Product) => {
    const ls = landingByProduct[p.id]
    if (ls) { router.push(`${storeBase}/p/${ls}${qs}`); return }
    router.push(`${storeBase}/product/${p.id}${qs}`)
  }

  const cfg = store.theme?.config
  const c = {
    bg: cfg?.colors.background ?? HOME_TOKENS.bg,
    card: cfg?.colors.card ?? HOME_TOKENS.card,
    primary: cfg?.colors.primary ?? HOME_TOKENS.primary,
    secondary: cfg?.colors.secondary ?? HOME_TOKENS.secondary,
    text: cfg?.colors.text ?? HOME_TOKENS.text,
    muted: cfg?.colors.textMuted ?? HOME_TOKENS.textMuted,
    border: cfg?.colors.border ?? HOME_TOKENS.border,
  }
  const headingName = sanitizeFontName(cfg?.fonts?.heading ?? HOME_TOKENS.heading)
  const bodyName = sanitizeFontName(cfg?.fonts?.body ?? HOME_TOKENS.body)
  const H: React.CSSProperties = { fontFamily: `'${headingName}', sans-serif` }
  const B: React.CSSProperties = { fontFamily: `'${bodyName}', sans-serif` }
  const fontUrl = `https://fonts.googleapis.com/css2?family=${headingName.replace(/ /g, '+')}:wght@400;500;600;700;800&family=${bodyName.replace(/ /g, '+')}:wght@400;500;600;700;800&display=swap`

  const waNumber = toWaNumber(store.settings?.whatsapp)
  const commanderHref = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Bonjour ${store.name}, je souhaite commander.`)}`
    : '#produits'

  const d = HOME_DEFAULTS
  const sc = store.settings?.storeContent
  const heroHeadline = sc?.heroHeadline?.trim() || d.hero.headline
  const heroSubtitle = sc?.heroSubtitle?.trim() || d.hero.subtitle
  const heroCta = sc?.heroCta?.trim() || d.hero.cta
  const promoTitle = sc?.promoTitle?.trim() || d.promo.title
  const footerTagline = sc?.footerTagline?.trim() || d.footer.tagline

  const heroProduct = products.find(p => p.images?.[0]) ?? products[0] ?? null
  const dealProduct = products.find(p => p.compare_price) ?? products[0] ?? null

  const socials = [
    { label: 'Instagram', url: store.settings?.instagram },
    { label: 'Facebook', url: store.settings?.facebook },
    { label: 'TikTok', url: store.settings?.tiktok },
    { label: 'YouTube', url: store.settings?.youtube },
  ].map(s => ({ ...s, url: normalizeSocialUrl(s.label.toLowerCase(), s.url ?? '') }))
    .filter(s => s.url && s.url.trim())

  const priceTag = (n: number) => `${Number(n).toLocaleString('fr-DZ')} DA`

  // Pro-édition homepage layout (Ultimate+). Absent = everything visible.
  const hp = getHomepageEditor(store.settings)

  return (
    <div id="top" style={{ background: c.bg, color: c.text, minHeight: '100vh', ...B }}>
      <GoogleFontLoader href={fontUrl} />

      {/* ── Announcement ── */}
      {hp.sections.announcement && (
        <div className="text-center text-xs py-2 px-4 font-medium" style={{ background: c.card, color: c.muted, borderBottom: `1px solid ${c.border}` }}>
          {d.announcement}
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-10" style={{ background: `${c.bg}f2`, backdropFilter: 'blur(8px)', borderBottom: `1px solid ${c.border}` }}>
        <div className="max-w-6xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {store.logo_url
              ? <Image src={store.logo_url} alt={store.name} width={36} height={36} className="rounded-full object-contain" />
              : <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 700 }}>{store.name.charAt(0)}</div>}
            <span className="text-xl font-bold" style={H}>{store.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm" style={{ color: c.muted }}>
            {[...d.navLinks, ...resolveSiteMenuLinks(store.settings?.siteMenu, storeBase)].map(l => <a key={l.href} href={l.href} className="hover:text-current transition-colors">{l.label}</a>)}
          </nav>
          <a href={commanderHref} {...(waNumber ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:opacity-90"
            style={{ background: c.primary, color: '#fff' }}>Commander</a>
        </div>
      </header>

      {/* Store Banner */}
      {hp.sections.banner && store.settings?.bannerUrl && (
        <div className="max-w-6xl mx-auto px-5 pt-5">
          <div className="relative w-full aspect-[3/1] rounded-3xl overflow-hidden border" style={{ borderColor: c.border }}>
            <Image src={store.settings.bannerUrl} alt="Bannière boutique" fill sizes="(max-width: 1024px) 100vw, 1024px" className="object-cover" priority />
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      {hp.sections.hero && (
        <section className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-5" style={{ background: `${c.secondary}14`, color: c.secondary }}>{d.hero.kicker}</span>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-4" style={{ ...H, color: c.text }}>{heroHeadline}</h1>
            <p className="text-lg mb-8 leading-relaxed" style={{ color: c.muted, maxWidth: 440 }}>{heroSubtitle}</p>
            <a href="#produits" className="inline-block px-8 py-4 rounded-full font-semibold transition-all hover:opacity-90"
              style={{ background: c.primary, color: '#fff' }}>{heroCta}</a>
          </div>
          <div className="relative">
            <div className="absolute -inset-3 rounded-[2rem]" style={{ background: `${c.primary}10` }} />
            {hp.photoSwipe ? (
              <HeroGallery
                images={heroProduct?.images ?? []}
                alt={heroProduct?.name ?? ''}
                className="relative rounded-[1.75rem] overflow-hidden aspect-square"
                style={{ background: c.card, border: `1px solid ${c.border}` }}
                placeholder="❦"
              />
            ) : (
              <div className="relative rounded-[1.75rem] overflow-hidden aspect-square" style={{ background: c.card, border: `1px solid ${c.border}` }}>
                {heroProduct?.images?.[0]
                  ? <Image src={heroProduct.images[0]} alt={heroProduct.name} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" priority />
                  : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: c.primary, opacity: 0.35 }}>❦</div>}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Collections ── */}
      {hp.sections.collections && (
        <section id="collections" className="max-w-6xl mx-auto px-5 pb-4">
          <h2 className="text-3xl font-bold mb-6" style={{ ...H, color: c.text }}>{d.collectionsTitle}</h2>
          <div className="grid sm:grid-cols-3 gap-5">
            {d.collections.map(col => (
              <a key={col.name} href="#produits" className="block rounded-3xl p-7 transition-all hover:-translate-y-1"
                style={{ background: c.card, border: `1px solid ${c.border}` }}>
                <div className="w-11 h-11 rounded-full mb-4 flex items-center justify-center" style={{ background: `${c.primary}12`, color: c.primary }}>❖</div>
                <p className="text-xl font-bold" style={{ ...H, color: c.text }}>{col.name}</p>
                <p className="text-sm mt-1" style={{ color: c.muted }}>{col.sub}</p>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── Featured campaigns ── */}
      {hp.sections.campaigns && landingPages.length > 0 && (
        <section className="max-w-6xl mx-auto px-5 pt-10">
          <div className="flex gap-4 overflow-x-auto pb-2">
            {landingPages.map(lp => {
              const meta = lp.content._meta
              const img = meta?.imageUrl ?? lp.content.hero.background_image ?? null
              return (
                <a key={lp.id} href={`${storeBase}/p/${lp.slug}${qs}`}
                  className="flex-shrink-0 w-56 rounded-2xl overflow-hidden transition-all hover:-translate-y-0.5"
                  style={{ background: c.card, border: `1px solid ${c.border}` }}>
                  <div className="relative h-32 overflow-hidden" style={{ background: `${c.primary}0d` }}>
                    {img && <Image src={img} alt={lp.title} fill sizes="224px" loading="lazy" className="object-cover" />}
                  </div>
                  <div className="p-4">
                    <p className="text-sm font-semibold line-clamp-2 leading-snug" style={{ ...H, color: c.text }}>{lp.content.hero.headline}</p>
                    {meta?.price != null && <p className="mt-2 font-bold" style={{ color: c.primary }}>{priceTag(meta.price)}</p>}
                  </div>
                </a>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Products ── */}
      {hp.sections.products && (
        <main id="produits" className="max-w-6xl mx-auto px-5 py-14">
          <div className="flex items-end justify-between mb-8">
            <h2 className="text-3xl font-bold" style={{ ...H, color: c.text }}>{d.productsTitle}</h2>
            <span className="text-sm" style={{ color: c.muted }}>{products.length} produit{products.length > 1 ? 's' : ''}</span>
          </div>

          {hp.autoCatalog && products.length > 0 && (
            <AutoCatalog
              products={products}
              storePlan={store.plan}
              showBadgeEmojis={store.settings?.showBadgeEmojis}
              onOpen={openProduct}
              priceTag={priceTag}
              primary={c.primary}
              text={c.text}
              muted={c.muted}
              border={c.border}
              cardBg={c.card}
            />
          )}

          {products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <p style={{ color: c.muted }}>Aucun produit disponible pour le moment.</p>
              <p className="text-sm" style={{ color: c.muted, opacity: 0.6 }}>Revenez bientôt !</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              {sortedProducts.map(product => (
                <div key={product.id} id={`product-${product.id}`} onClick={() => openProduct(product)}
                  className="scroll-mt-24 cursor-pointer group overflow-hidden transition-all hover:-translate-y-1"
                  style={{ background: c.card, border: `1px solid ${c.border}`, borderRadius: 22 }}>
                  <ProductCardImage product={product} storePlan={store.plan} showBadgeEmojis={store.settings?.showBadgeEmojis} aspect="aspect-square" className="m-2 rounded-2xl" bg={`${c.primary}0a`} placeholder="❦" />
                  <div className="px-4 pb-4 pt-1">
                    <p className="text-sm font-semibold truncate" style={{ ...H, color: c.text }}>{product.name}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-bold" style={{ color: c.primary }}>{priceTag(product.price)}</span>
                      {product.compare_price && <span className="text-xs line-through" style={{ color: c.muted }}>{priceTag(product.compare_price)}</span>}
                    </div>
                    <div className="mt-3 py-2 rounded-full text-xs font-semibold text-center transition-all" style={{ background: `${c.primary}12`, color: c.primary }}>Commander</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ── Promo band ── */}
      {hp.sections.promo && dealProduct && (
        <section className="max-w-6xl mx-auto px-5 pb-14">
          <div className="rounded-[2rem] overflow-hidden grid md:grid-cols-2 gap-0" style={{ background: c.card, border: `1px solid ${c.border}` }}>
            <div className="p-10 flex flex-col justify-center">
              <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4 self-start" style={{ background: `${c.secondary}14`, color: c.secondary }}>{d.promo.kicker}</span>
              <h2 className="text-3xl font-bold mb-2" style={{ ...H, color: c.text }}>{promoTitle}</h2>
              <p className="text-sm mb-4" style={{ color: c.muted }}>{dealProduct.name}</p>
              <div className="flex items-center gap-3 mb-6">
                <span className="text-2xl font-bold" style={{ color: c.primary }}>{priceTag(dealProduct.price)}</span>
                {dealProduct.compare_price && <span className="text-base line-through" style={{ color: c.muted }}>{priceTag(dealProduct.compare_price)}</span>}
              </div>
              <button onClick={() => openProduct(dealProduct)}
                className="px-7 py-3.5 rounded-full font-semibold self-start transition-all hover:opacity-90" style={{ background: c.primary, color: '#fff' }}>{d.promo.cta}</button>
            </div>
            <div className="relative aspect-video md:aspect-auto min-h-[240px]" style={{ background: `${c.primary}0a` }}>
              {dealProduct.images?.[0]
                ? <Image src={dealProduct.images[0]} alt={dealProduct.name} fill sizes="(max-width: 768px) 100vw, 50vw" loading="lazy" className="object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: c.primary, opacity: 0.3 }}>❦</div>}
            </div>
          </div>
        </section>
      )}

      {/* ── Values ── */}
      {hp.sections.values && (
        <section style={{ background: c.card, borderTop: `1px solid ${c.border}`, borderBottom: `1px solid ${c.border}` }}>
          <div className="max-w-6xl mx-auto px-5 py-14">
            <h2 className="text-3xl font-bold text-center mb-10" style={{ ...H, color: c.text }}>{d.valuesTitle}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {d.values.map(v => (
                <div key={v.title} className="text-center">
                  <div className="w-12 h-12 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: `${c.secondary}14`, color: c.secondary }}>✦</div>
                  <p className="font-semibold text-sm" style={{ ...H, color: c.text }}>{v.title}</p>
                  <p className="text-xs mt-1" style={{ color: c.muted }}>{v.sub}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Footer ── */}
      {hp.sections.footer && (
        <footer id="contact" style={{ background: c.bg }}>
        <div className="max-w-6xl mx-auto px-5 py-12 grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5 mb-3">
              {store.logo_url
                ? <Image src={store.logo_url} alt={store.name} width={32} height={32} className="rounded-full object-contain" />
                : <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: c.primary, color: '#fff', ...H, fontWeight: 700 }}>{store.name.charAt(0)}</div>}
              <span className="text-lg font-bold" style={H}>{store.name}</span>
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
      )}
    </div>
  )
}
