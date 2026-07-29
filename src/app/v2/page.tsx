'use client'

import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, Check, ChevronRight, ShoppingBag, MessageCircle, Sparkles,
  ShieldCheck, Percent, Smartphone, Truck, Palette, LineChart, Menu, X,
  TrendingUp, MapPin, Bot, Fingerprint,
} from 'lucide-react'

// ─── Krenix's own Éclat tokens — SAME brand colours as the live homepage.
// The reference site (getzimam.com) informed the LAYOUT rhythm below
// (floating pill nav, glowing hero + dashboard preview, alternating feature
// showcases, big rounded closing CTA) — not the colours or type, which stay
// unmistakably Krenix. Typography deliberately breaks from the live
// homepage's Bodoni Moda serif: Syne (geometric, already bundled, unused on
// the current page) carries the headlines here for a distinct personality.
const INK = 'var(--color-dash-ink)'
const INK_SOFT = 'var(--color-dash-ink-soft)'
const INK_FAINT = 'var(--color-dash-ink-faint)'
const SAGE = 'var(--color-dash-accent)'
const SAGE_DK = 'var(--color-dash-accent-dark)'
const SAGE_SOFT = 'var(--color-dash-accent-soft)'
const GOLD = 'var(--color-dash-gold)'
const GOLD_DK = 'var(--color-dash-gold-dark)'
const GOLD_SOFT = 'var(--color-dash-gold-soft)'
const PAGE = 'var(--color-dash-page)'
const SURF = 'var(--color-dash-surface)'
const SURF2 = 'var(--color-dash-surface-2)'
const BORDER = 'var(--color-dash-border)'
const DISPLAY = 'var(--font-heading)' // Syne
const SANS = 'var(--font-dash-sans)'  // Manrope

const EASE = [0.16, 1, 0.3, 1] as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
  hidden: { opacity: 0, y: 40, filter: 'blur(8px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.75, delay: i * 0.08, ease: EASE },
  }),
}

const Phoenix = ({ size = 28 }: { size?: number }) => (
  <Image src="/brand/krenix-phoenix.png" alt="Krenix" width={size} height={size} unoptimized
    style={{ width: size, height: size, objectFit: 'contain' }} />
)

function useCounter(target: number, duration = 1800, active = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    const steps = 50
    let frame = 0
    const timer = setInterval(() => {
      frame++
      setValue(Math.min(target, Math.floor((target / steps) * frame)))
      if (frame >= steps) clearInterval(timer)
    }, duration / steps)
    return () => clearInterval(timer)
  }, [active, target, duration])
  return value
}

// ─── "Control tower" dashboard mockup — deliberately richer than the live
// homepage's mockup (stat ring, wilaya leaderboard, revenue trend), the same
// structural idea as the reference's dashboard preview, built from Krenix's
// own real data model (wilayas, order statuses, confirmation rate). ─────────
function ControlTowerMockup() {
  const pct = useCounter(89, 1600, true)
  const bars = [38, 52, 44, 61, 58, 70, 66]
  const wilayas = [
    { name: 'Alger', orders: 187, rate: 91 },
    { name: 'Oran', orders: 142, rate: 84 },
    { name: 'Constantine', orders: 98, rate: 88 },
  ]
  return (
    <div className="relative w-full max-w-[560px] mx-auto select-none" style={{ perspective: 1600 }}>
      <div className="absolute inset-0 rounded-[40px] blur-3xl opacity-50 pointer-events-none"
        style={{ background: `radial-gradient(ellipse, ${SAGE_SOFT} 0%, ${GOLD_SOFT} 45%, transparent 72%)`, transform: 'translateY(50px) scale(1.05)' }} />
      <motion.div
        animate={{ y: [0, -14, 0], rotateZ: [-0.6, 0.6, -0.6] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-[28px] overflow-hidden"
        style={{
          background: SURF, border: `1px solid ${BORDER}`,
          boxShadow: '0 50px 100px rgba(30,40,55,0.20), 0 10px 30px rgba(30,40,55,0.08)',
          transform: 'rotateX(6deg) rotateY(-6deg)', transformStyle: 'preserve-3d',
        }}
      >
        {/* Chrome bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5" style={{ background: SURF2, borderBottom: `1px solid ${BORDER}` }}>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#F59E0B' }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: GOLD }} />
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: SAGE }} />
          <span className="ml-3 text-[10px] font-mono" style={{ color: INK_FAINT }}>tableau-de-bord.krenix.store</span>
        </div>

        <div className="p-4 grid grid-cols-2 gap-3">
          {/* Confirmation ring */}
          <div className="col-span-1 rounded-2xl p-4 flex flex-col items-center justify-center" style={{ background: SURF2 }}>
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke={BORDER} strokeWidth="7" />
                <motion.circle cx="40" cy="40" r="34" fill="none" stroke={SAGE} strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 34}
                  animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - pct / 100) }}
                  transition={{ duration: 1.6, ease: EASE }} />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-black text-lg" style={{ color: INK }}>{pct}%</span>
              </div>
            </div>
            <p className="text-[10px] mt-2 font-semibold" style={{ color: INK_SOFT }}>Confirmation</p>
          </div>

          {/* Revenue bars */}
          <div className="col-span-1 rounded-2xl p-4" style={{ background: SURF2 }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: INK_FAINT }}>Chiffre d&apos;affaires · 7j</p>
            <div className="flex items-end gap-1.5 h-14">
              {bars.map((h, i) => (
                <motion.div key={i} className="flex-1 rounded-t-md"
                  style={{ background: i === bars.length - 1 ? GOLD : SAGE_SOFT }}
                  initial={{ height: 0 }} animate={{ height: `${h}%` }}
                  transition={{ duration: 0.6, delay: 0.3 + i * 0.06, ease: EASE }} />
              ))}
            </div>
          </div>

          {/* Wilaya leaderboard */}
          <div className="col-span-2 rounded-2xl p-4" style={{ background: SURF2 }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <MapPin size={11} style={{ color: GOLD_DK }} />
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: INK_FAINT }}>Meilleures wilayas</p>
            </div>
            <div className="space-y-1.5">
              {wilayas.map((w, i) => (
                <div key={w.name} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0"
                    style={{ background: i === 0 ? GOLD_SOFT : SURF, color: i === 0 ? GOLD_DK : INK_FAINT }}>{i + 1}</span>
                  <span className="text-[11px] font-semibold flex-1" style={{ color: INK }}>{w.name}</span>
                  <span className="text-[10px]" style={{ color: INK_SOFT }}>{w.orders} cmd</span>
                  <span className="text-[10px] font-bold" style={{ color: SAGE }}>{w.rate}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating chip: 0% commission */}
      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        className="absolute -left-6 top-10 rounded-2xl px-4 py-3 flex items-center gap-2.5"
        style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 20px 40px rgba(30,40,55,0.15)' }}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: SAGE_SOFT }}>
          <Percent size={15} style={{ color: SAGE_DK }} />
        </div>
        <div>
          <p className="text-sm font-black" style={{ color: INK }}>0% commission</p>
          <p className="text-[10px]" style={{ color: INK_FAINT }}>Sur chaque vente</p>
        </div>
      </motion.div>
    </div>
  )
}

// ─── A soft colour bridge between two stacked sections — the SAME technique
// used to fix the dashboard's dark-sidebar/light-content seam, reused here so
// alternating light/cream sections never cut hard into each other. ─────────
function SectionBridge({ from, to }: { from: string; to: string }) {
  return <div aria-hidden="true" className="h-16" style={{ background: `linear-gradient(to bottom, ${from}, ${to})` }} />
}

// ─── Alternating 2-column feature showcase ─────────────────────────────────
function Showcase({
  eyebrow, eyebrowIcon: EyebrowIcon, title, description, bullets, tierBadge, reverse, visual, accentSoft = SAGE_SOFT, accentDark = SAGE_DK,
}: {
  eyebrow: string
  eyebrowIcon: React.ElementType
  title: string
  description: string
  bullets: { icon: React.ElementType; label: string; desc: string }[]
  tierBadge?: string
  reverse?: boolean
  visual: React.ReactNode
  accentSoft?: string
  accentDark?: string
}) {
  const ref = useRef(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  return (
    <div ref={ref} className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center ${reverse ? 'lg:[direction:rtl]' : ''}`}>
      <motion.div
        variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'}
        className={reverse ? 'lg:[direction:ltr]' : ''}
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5" style={{ background: accentSoft }}>
          <EyebrowIcon size={13} style={{ color: accentDark }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentDark, fontFamily: SANS }}>{eyebrow}</span>
          {tierBadge && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: accentDark }}>{tierBadge}</span>
          )}
        </div>
        <h3 style={{ fontFamily: DISPLAY, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 800, color: INK, lineHeight: 1.08, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
        <p className="mt-4 text-[17px] leading-relaxed max-w-md" style={{ color: INK_SOFT, fontFamily: SANS }}>{description}</p>

        <div className="mt-7 space-y-3.5">
          {bullets.map((b, i) => (
            <motion.div key={i} custom={i + 2} variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'}
              className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: accentSoft }}>
                <b.icon size={14} style={{ color: accentDark }} />
              </div>
              <div>
                <p className="text-sm font-bold" style={{ color: INK, fontFamily: SANS }}>{b.label}</p>
                <p className="text-[13px]" style={{ color: INK_FAINT, fontFamily: SANS }}>{b.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        className={reverse ? 'lg:[direction:ltr]' : ''}
        variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={1}
      >
        {visual}
      </motion.div>
    </div>
  )
}

// ─── Simple bordered visual card used inside showcases ────────────────────
function VisualCard({ children, accent = SAGE_SOFT }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="relative rounded-[28px] p-8 overflow-hidden" style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 30px 70px rgba(30,40,55,0.10)' }}>
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-60 pointer-events-none" style={{ background: accent }} />
      <div className="relative">{children}</div>
    </div>
  )
}

const NAV_LINKS: [string, string][] = [['Fonctionnalités', '#fonctionnalites'], ['Tarifs', '/pricing'], ['FAQ', '/#faq']]

export default function HomepageV2() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [navScrolled, setNavScrolled] = useState(false)
  const heroRef = useRef(null)
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroFade = useTransform(heroScroll, [0, 0.7], [1, 0])
  const heroY = useTransform(heroScroll, [0, 1], [0, 100])
  const statsRef = useRef(null)
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' })
  const c1 = useCounter(500, 1800, statsInView)

  return (
    <div style={{ background: PAGE, color: INK, fontFamily: SANS, overflowX: 'hidden' }}>
      <style>{`
        @keyframes v2drift1 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(50px,-40px) scale(1.12) } }
        @keyframes v2drift2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-60px,35px) scale(1.08) } }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── Floating pill navbar ─────────────────────────────────────── */}
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <motion.nav
          initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: EASE }}
          className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-5 py-2.5 rounded-full transition-all duration-300"
          style={{
            background: navScrolled ? SURF : `${SURF}CC`,
            border: `1px solid ${BORDER}`,
            boxShadow: navScrolled ? '0 12px 30px rgba(30,40,55,0.10)' : 'none',
            backdropFilter: 'blur(16px)',
          }}
          onViewportEnter={() => setNavScrolled(false)}
        >
          <Link href="/v2" className="flex items-center gap-2">
            <Phoenix size={26} />
            <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '0.02em' }}>KRENIX</span>
          </Link>
          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map(([label, href]) => (
              <a key={label} href={href} className="text-sm font-semibold transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>{label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Link href="/auth/login" className="px-4 py-2 rounded-full text-sm font-bold transition-colors hover:opacity-70" style={{ color: INK }}>
              Se connecter
            </Link>
            <Link href="/onboarding/step-1" className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white transition-transform hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})` }}>
              Créer ma boutique <ArrowRight size={14} />
            </Link>
          </div>
          <button className="md:hidden p-1.5" onClick={() => setMenuOpen(v => !v)} style={{ color: INK }}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </motion.nav>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto mt-2 rounded-3xl p-4 md:hidden"
              style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 20px 50px rgba(30,40,55,0.15)' }}
            >
              {NAV_LINKS.map(([label, href]) => (
                <a key={label} href={href} onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-semibold" style={{ color: INK }}>{label}</a>
              ))}
              <div className="flex gap-2 mt-2">
                <Link href="/auth/login" className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold" style={{ border: `1px solid ${BORDER}`, color: INK }}>Se connecter</Link>
                <Link href="/onboarding/step-1" className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: SAGE }}>Créer ma boutique</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative pt-40 pb-24 px-4 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-10%] left-[8%] w-[420px] h-[420px] rounded-full opacity-70" style={{ background: `radial-gradient(circle, ${SAGE_SOFT} 0%, transparent 70%)`, animation: 'v2drift1 18s ease-in-out infinite' }} />
          <div className="absolute top-[5%] right-[6%] w-[360px] h-[360px] rounded-full opacity-70" style={{ background: `radial-gradient(circle, ${GOLD_SOFT} 0%, transparent 70%)`, animation: 'v2drift2 22s ease-in-out infinite' }} />
        </div>

        <motion.div style={{ opacity: heroFade, y: heroY }} className="relative max-w-4xl mx-auto text-center">
          <motion.div variants={fadeUp} initial="hidden" animate="visible"
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-7" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: SAGE }} />
            <span className="text-xs font-bold" style={{ color: INK_SOFT }}>La 1ère plateforme e-commerce 100% algérienne</span>
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1}
            style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(40px,7.5vw,84px)', lineHeight: 0.98, letterSpacing: '-0.02em', color: INK }}>
            Votre boutique.
            <br />
            <span style={{ color: SAGE }}>En pilote automatique.</span>
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2}
            className="mt-6 text-lg max-w-xl mx-auto leading-relaxed" style={{ color: INK_SOFT }}>
            Landing pages générées par IA, chatbot en darija, stock par variante, sociétés de livraison connectées —
            tout ce qu&apos;il faut pour vendre en ligne, sans écrire une ligne de code.
          </motion.p>

          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/onboarding/step-1"
              className="flex items-center gap-2 px-7 py-4 rounded-full font-bold text-[15px] text-white transition-transform hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})`, boxShadow: `0 16px 40px ${SAGE}55` }}>
              Créer ma boutique gratuitement <ArrowRight size={17} />
            </Link>
            <Link href="/pricing"
              className="flex items-center gap-2 px-7 py-4 rounded-full font-bold text-[15px] transition-colors hover:opacity-70"
              style={{ color: INK, border: `1px solid ${BORDER}` }}>
              Voir les tarifs
            </Link>
          </motion.div>

          <motion.div ref={statsRef} variants={fadeUp} initial="hidden" animate="visible" custom={4}
            className="mt-10 flex items-center justify-center gap-6 flex-wrap text-sm">
            <span className="flex items-center gap-1.5 font-bold" style={{ color: SAGE_DK }}>
              <Percent size={14} /> 0% de commission — toujours
            </span>
            <span className="w-px h-4" style={{ background: BORDER }} />
            <span style={{ color: INK_SOFT }}>
              <strong style={{ color: INK }}>+{c1}</strong> boutiques actives
            </span>
          </motion.div>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={5} className="relative mt-16">
          <ControlTowerMockup />
        </motion.div>
      </section>

      <SectionBridge from={PAGE} to={SURF2} />

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section id="fonctionnalites" className="py-20 px-4" style={{ background: SURF2 }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: SAGE_DK }}>Ce que vous obtenez</p>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(30px,4vw,48px)', color: INK, marginTop: 10, letterSpacing: '-0.01em' }}>
              Tout Shopify. Pensé pour l&apos;Algérie.
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: Percent, title: '0% de commission', desc: 'Vous gardez 100% de vos ventes. Aucun prélèvement, jamais — contrairement à la plupart des plateformes.', accent: SAGE, soft: SAGE_SOFT, dark: SAGE_DK },
              { icon: Sparkles, title: 'Landing pages par IA', desc: 'Décrivez votre produit, l\'IA rédige le texte et génère les photos en quelques secondes.', accent: GOLD_DK, soft: GOLD_SOFT, dark: GOLD_DK },
              { icon: Bot, title: 'Chatbot en Darija', desc: 'Répond à vos clients 24/7, en arabe algérien, et peut créer la commande lui-même.', accent: SAGE, soft: SAGE_SOFT, dark: SAGE_DK },
              { icon: Palette, title: 'Stock par variante', desc: 'Couleurs et tailles avec leur propre stock — livré, le stock exact de la variante baisse, pas le total.', accent: GOLD_DK, soft: GOLD_SOFT, dark: GOLD_DK },
              { icon: Truck, title: 'Livraison connectée', desc: 'Yalidine, Maystro, ZR Express... créez le colis en un clic depuis votre commande.', accent: SAGE, soft: SAGE_SOFT, dark: SAGE_DK },
              { icon: LineChart, title: 'Analytics en direct', desc: 'Marge, taux de confirmation, meilleures wilayas — votre activité en un coup d\'œil.', accent: GOLD_DK, soft: GOLD_SOFT, dark: GOLD_DK },
            ].map((f, i) => (
              <motion.div key={f.title} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
                className="rounded-[22px] p-6 transition-transform hover:-translate-y-1"
                style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ background: f.soft }}>
                  <f.icon size={19} style={{ color: f.dark }} />
                </div>
                <p className="font-black text-[15px]" style={{ color: INK }}>{f.title}</p>
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: INK_FAINT }}>{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <SectionBridge from={SURF2} to={PAGE} />

      {/* ── Showcase: AI Landing pages ───────────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Showcase
            eyebrow="Intelligence artificielle" eyebrowIcon={Sparkles}
            title="Une page de vente qui convertit, écrite pour vous"
            description="Donnez le nom du produit et une photo — l'IA rédige le titre, les bénéfices, les témoignages, et génère jusqu'à 5 photos produit prêtes pour vos publicités."
            bullets={[
              { icon: Sparkles, label: 'Texte + photos en un clic', desc: 'Copywriting orienté conversion, adapté au marché algérien' },
              { icon: ShoppingBag, label: 'Publication instantanée', desc: 'En ligne sur votre boutique dès la génération terminée' },
            ]}
            visual={
              <VisualCard>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: SAGE_SOFT }}>
                    <Sparkles size={16} style={{ color: SAGE_DK }} />
                  </div>
                  <p className="text-sm font-bold" style={{ color: INK }}>Génération en cours…</p>
                </div>
                {['Analyse du produit', 'Rédaction du texte de vente', 'Création des visuels'].map((s, i) => (
                  <div key={s} className="flex items-center gap-3 py-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: i < 2 ? SAGE : SAGE_SOFT }}>
                      {i < 2 && <Check size={11} className="text-white" />}
                    </div>
                    <span className="text-sm" style={{ color: i < 2 ? INK : INK_FAINT }}>{s}</span>
                  </div>
                ))}
                <div className="h-2 rounded-full mt-4 overflow-hidden" style={{ background: SURF2 }}>
                  <div className="h-full rounded-full" style={{ width: '72%', background: SAGE }} />
                </div>
              </VisualCard>
            }
          />
        </div>
      </section>

      {/* ── Showcase: Krenix Shield (fake-order filtering) — Ultimate+ ── */}
      <section className="py-20 px-4" style={{ background: SURF2 }}>
        <div className="max-w-5xl mx-auto">
          <Showcase
            reverse
            eyebrow="Sécurité" eyebrowIcon={ShieldCheck}
            tierBadge="Ultimate & plus"
            title="Krenix Shield : votre rempart contre les fausses commandes"
            description="La fonctionnalité la plus demandée. Krenix analyse chaque commande — historique du numéro, cohérence de l'adresse, comportement suspect — et vous alerte avant qu'elle ne parte en livraison."
            bullets={[
              { icon: Fingerprint, label: 'Détection des commandes suspectes', desc: 'Score de fiabilité calculé sur chaque nouvelle commande' },
              { icon: ShieldCheck, label: 'Filtrage automatique', desc: 'Les commandes à risque sont isolées avant confirmation, pas après' },
            ]}
            accentSoft={GOLD_SOFT} accentDark={GOLD_DK}
            visual={
              <VisualCard accent={GOLD_SOFT}>
                <div className="flex items-center justify-center py-4">
                  <div className="relative w-24 h-24 rounded-full flex items-center justify-center" style={{ background: GOLD_SOFT }}>
                    <ShieldCheck size={40} style={{ color: GOLD_DK }} />
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: SURF2 }}>
                    <span className="text-xs font-semibold" style={{ color: INK }}>Commande #4821</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-dash-success-soft)', color: 'var(--color-dash-success)' }}>Fiable</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: SURF2 }}>
                    <span className="text-xs font-semibold" style={{ color: INK }}>Commande #4822</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-dash-danger-soft)', color: 'var(--color-dash-danger)' }}>À vérifier</span>
                  </div>
                </div>
              </VisualCard>
            }
          />
        </div>
      </section>

      <SectionBridge from={SURF2} to={PAGE} />

      {/* ── Showcase: Custom discount codes ──────────────────────────── */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <Showcase
            eyebrow="Ventes" eyebrowIcon={Percent}
            title="Vos propres codes de réduction, en quelques secondes"
            description="Créez un pourcentage ou un montant fixe de réduction, limitez-le dans le temps ou à un produit, et suivez exactement combien de ventes chaque code a généré."
            bullets={[
              { icon: Percent, label: 'Réduction en % ou montant fixe', desc: 'Vous choisissez la formule qui protège votre marge' },
              { icon: TrendingUp, label: 'Suivi des conversions', desc: 'Voyez quel code, quelle campagne, a réellement vendu' },
            ]}
            visual={
              <VisualCard>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: SAGE_SOFT }}>
                    <Percent size={16} style={{ color: SAGE_DK }} />
                  </div>
                  <p className="text-sm font-bold" style={{ color: INK }}>Nouveau code promo</p>
                </div>
                <div className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between" style={{ background: SURF2, border: `1px dashed ${SAGE}` }}>
                  <span className="font-mono font-bold text-sm" style={{ color: SAGE_DK }}>RAMADAN25</span>
                  <span className="text-xs font-black" style={{ color: INK }}>-25%</span>
                </div>
                <div className="flex items-center justify-between text-xs py-1.5" style={{ color: INK_SOFT }}>
                  <span>Utilisations</span><span className="font-bold" style={{ color: INK }}>142 / 500</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: SURF2 }}>
                  <div className="h-full rounded-full" style={{ width: '28%', background: GOLD }} />
                </div>
              </VisualCard>
            }
          />
        </div>
      </section>

      <SectionBridge from={PAGE} to={SURF2} />

      {/* ── Showcase: Mobile control ──────────────────────────────────── */}
      <section className="py-20 px-4" style={{ background: SURF2 }}>
        <div className="max-w-5xl mx-auto">
          <Showcase
            reverse
            eyebrow="Mobile" eyebrowIcon={Smartphone}
            title="Toute votre boutique, dans votre poche"
            description="Confirmez une commande à un feu rouge, changez un prix depuis le canapé, répondez à un client au marché — le tableau de bord Krenix est pensé mobile d'abord, contrôle total inclus."
            bullets={[
              { icon: Smartphone, label: 'Contrôle complet depuis le téléphone', desc: 'Aucune fonctionnalité réservée à l\'ordinateur' },
              { icon: MessageCircle, label: 'Notifications en temps réel', desc: 'Nouvelle commande, message client — vous êtes informé instantanément' },
            ]}
            visual={
              <div className="flex justify-center">
                <div className="relative w-[220px] rounded-[36px] p-2.5" style={{ background: INK, boxShadow: '0 40px 80px rgba(30,40,55,0.25)' }}>
                  <div className="rounded-[28px] overflow-hidden" style={{ background: SURF }}>
                    <div className="h-6 flex items-center justify-center" style={{ background: INK }}>
                      <div className="w-16 h-3 rounded-full" style={{ background: '#000' }} />
                    </div>
                    <div className="p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2 mb-1">
                        <Phoenix size={16} />
                        <span className="text-[11px] font-black" style={{ color: INK }}>KRENIX</span>
                      </div>
                      {[
                        { label: 'Nouvelle commande', color: SAGE },
                        { label: 'Stock faible : Hoodie S', color: GOLD },
                        { label: 'Message client', color: SAGE },
                      ].map(n => (
                        <div key={n.label} className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: SURF2 }}>
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                          <span className="text-[10px] font-semibold" style={{ color: INK }}>{n.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            }
          />
        </div>
      </section>

      <SectionBridge from={SURF2} to={PAGE} />

      {/* ── Final CTA ─────────────────────────────────────────────────── */}
      <section className="py-24 px-4">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }}
          className="max-w-4xl mx-auto rounded-[36px] p-12 sm:p-16 text-center relative overflow-hidden"
          style={{ background: INK }}>
          <div className="absolute top-[-30%] left-[-10%] w-[400px] h-[400px] rounded-full opacity-30 blur-3xl pointer-events-none" style={{ background: SAGE }} />
          <div className="absolute bottom-[-30%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-25 blur-3xl pointer-events-none" style={{ background: GOLD }} />
          <div className="relative">
            <Phoenix size={40} />
            <h2 className="mt-5" style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(28px,4.2vw,48px)', color: '#fff', letterSpacing: '-0.01em' }}>
              Prêt à faire grandir votre boutique ?
            </h2>
            <p className="mt-3 max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Créez votre boutique en moins de 5 minutes. Aucune carte bancaire requise pour commencer.
            </p>
            <Link href="/onboarding/step-1"
              className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-full font-bold text-[15px] transition-transform hover:scale-[1.03]"
              style={{ background: SAGE, color: '#fff', boxShadow: `0 16px 40px ${SAGE}66` }}>
              Créer ma boutique gratuitement <ChevronRight size={17} />
            </Link>
          </div>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="px-4 pb-10 pt-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 pt-8" style={{ borderTop: `1px solid ${BORDER}` }}>
          <div className="flex items-center gap-2">
            <Phoenix size={20} />
            <span style={{ fontFamily: DISPLAY, fontSize: 13, fontWeight: 800, color: INK }}>KRENIX</span>
          </div>
          <p className="text-xs" style={{ color: INK_FAINT }}>© {new Date().getFullYear()} Krenix — La plateforme e-commerce pour les vendeurs algériens.</p>
          <div className="flex items-center gap-4 text-xs" style={{ color: INK_SOFT }}>
            <Link href="/terms" className="hover:opacity-70 transition-opacity">Conditions</Link>
            <Link href="/privacy" className="hover:opacity-70 transition-opacity">Confidentialité</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
