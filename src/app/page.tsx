'use client'

import { motion, useInView, useScroll, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  ShoppingBag, BarChart3, Star, MessageCircle, CreditCard, Layers,
  CheckCircle2, Clock, Rocket, Building2, Globe2, Sparkles,
} from 'lucide-react'
import { IconStore, IconAIPage, IconChatbot, IconRocket, IconPackage, IconAnalytics } from '@/components/ui/KrenixIcons'

// ─── Éclat palette (mirrors the dashboard's dash-* tokens) ────────────────────
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
const HEADING = 'var(--font-dash-heading)'
const SANS = 'var(--font-dash-sans)'

const EASE = [0.16, 1, 0.3, 1] as const

// ─── Motion variants ──────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
  hidden: { opacity: 0, y: 34, filter: 'blur(6px)' },
  visible: (i = 0) => ({
    opacity: 1, y: 0, filter: 'blur(0px)',
    transition: { duration: 0.7, delay: i * 0.09, ease: EASE },
  }),
}

const Phoenix = ({ size = 28, className = '', style }: { size?: number; className?: string; style?: React.CSSProperties }) => (
  <Image src="/brand/krenix-phoenix.png" alt="Krenix" width={size} height={size} unoptimized priority
    className={className} style={{ width: size, height: size, objectFit: 'contain', ...style }} />
)

// A refined lockup: teal phoenix + serif wordmark.
const Lockup = ({ mark = 60, text = 40 }: { mark?: number; text?: number }) => (
  <span className="flex items-center gap-2.5">
    <Phoenix size={mark} />
    <span style={{ fontFamily: HEADING, fontSize: text, color: INK, letterSpacing: '0.14em', fontWeight: 500 }}>
      KRENIX
    </span>
  </span>
)

// ─── Animated counter ─────────────────────────────────────────────────────────
function useCounter(target: number, duration = 2000, active = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    const steps = 60
    const inc = target / steps
    let current = 0, frame = 0
    const timer = setInterval(() => {
      frame++
      current = Math.min(current + inc, target)
      setValue(Math.floor(current))
      if (frame >= steps) clearInterval(timer)
    }, duration / steps)
    return () => clearInterval(timer)
  }, [active, target, duration])
  return value
}

// ─── Light dashboard mockup (mirrors the real Éclat dashboard) ───────────────
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto select-none" style={{ perspective: 1400 }}>
      <div className="absolute inset-0 rounded-[32px] blur-3xl opacity-40 pointer-events-none"
        style={{ background: `radial-gradient(ellipse, ${SAGE_SOFT} 0%, transparent 70%)`, transform: 'translateY(46px) scaleX(0.85)' }} />

      <motion.div
        animate={{ y: [0, -12, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-[26px] overflow-hidden"
        style={{
          background: SURF,
          border: `1px solid ${BORDER}`,
          boxShadow: '0 40px 90px rgba(30,40,55,0.18), 0 8px 24px rgba(30,40,55,0.06)',
          transform: 'rotateX(7deg) rotateY(-5deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="flex">
          {/* Dark sidebar — like the real dashboard */}
          <div className="w-14 flex flex-col items-center py-5 gap-5 flex-shrink-0"
            style={{ background: 'var(--color-dash-sidebar)' }}>
            <Phoenix size={22} />
            {[BarChart3, Layers, ShoppingBag, MessageCircle].map((Icon, i) => (
              <div key={i} className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: i === 0 ? 'rgba(255,255,255,0.08)' : 'transparent' }}>
                <Icon size={14} style={{ color: i === 0 ? '#fff' : 'rgba(255,255,255,0.28)' }} />
              </div>
            ))}
          </div>

          {/* Light content */}
          <div className="flex-1 p-4 min-w-0" style={{ background: PAGE }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p style={{ fontFamily: HEADING, color: INK }} className="text-sm font-medium">Tableau de bord</p>
                <p className="text-[10px]" style={{ color: INK_FAINT }}>Aujourd&apos;hui · 28 juin</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: GOLD_SOFT }}>
                <Sparkles size={9} style={{ color: GOLD_DK }} />
                <span className="text-[9px] font-semibold" style={{ color: GOLD_DK }}>105 crédits</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: 'Commandes', value: '24', tint: SAGE },
                { label: 'Revenus', value: '87K', tint: GOLD_DK },
                { label: 'Produits', value: '6', tint: SAGE },
              ].map(({ label, value, tint }) => (
                <div key={label} className="rounded-xl p-2" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                  <p className="text-[9px] mb-1" style={{ color: INK_FAINT }}>{label}</p>
                  <p className="text-sm font-bold" style={{ color: INK, fontFamily: HEADING }}>{value} <span className="text-[8px]" style={{ color: tint }}>DA</span></p>
                </div>
              ))}
            </div>

            <div className="rounded-xl p-3 mb-3" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
              <p className="text-[9px] mb-2" style={{ color: INK_FAINT }}>Ventes — 7 derniers jours</p>
              <svg viewBox="0 0 200 36" className="w-full h-7">
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={SAGE} stopOpacity="0.30" />
                    <stop offset="100%" stopColor={SAGE} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,32 L28,25 L56,20 L84,27 L112,16 L140,10 L168,6 L200,2 L200,36 L0,36Z" fill="url(#cg)" />
                <motion.path d="M0,32 L28,25 L56,20 L84,27 L112,16 L140,10 L168,6 L200,2" fill="none" stroke={SAGE} strokeWidth="1.5" strokeLinecap="round"
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: EASE, delay: 0.4 }} />
                <circle cx="200" cy="2" r="2.5" fill={SAGE} />
              </svg>
            </div>

            <div className="space-y-1">
              {[
                { name: 'Amira B.', wilaya: 'Alger', amount: '4 200', status: 'confirmed' },
                { name: 'Youcef M.', wilaya: 'Oran', amount: '2 800', status: 'pending' },
                { name: 'Sara K.', wilaya: 'Constantine', amount: '6 500', status: 'livree' },
              ].map(({ name, wilaya, amount, status }) => (
                <div key={name} className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white flex-shrink-0" style={{ background: SAGE }}>{name[0]}</div>
                    <div>
                      <p className="text-[9px] font-medium" style={{ color: INK }}>{name}</p>
                      <p className="text-[8px]" style={{ color: INK_FAINT }}>{wilaya}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-semibold" style={{ color: INK }}>{amount} DA</p>
                    <div className="text-[7px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 font-semibold" style={
                      status === 'confirmed' ? { background: 'var(--color-dash-info-soft)', color: 'var(--color-dash-info)' } :
                      status === 'livree' ? { background: 'var(--color-dash-success-soft)', color: 'var(--color-dash-success)' } :
                      { background: 'var(--color-dash-warning-soft)', color: 'var(--color-dash-warning-dark)' }
                    }>{status === 'confirmed' ? 'Confirmée' : status === 'livree' ? 'Livrée' : 'En attente'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -8, 0], rotate: [0, 1.5, 0] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -top-5 -right-3 flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold"
        style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: '#fff', boxShadow: '0 12px 30px rgba(180,140,40,0.35)' }}
      >
        <Star size={12} fill="currentColor" /> Page IA générée
      </motion.div>

      <motion.div
        animate={{ y: [0, 9, 0] }}
        transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute -bottom-3 -left-3 flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold"
        style={{ background: SURF, border: `1px solid var(--color-dash-success)`, color: 'var(--color-dash-success)', boxShadow: '0 12px 30px rgba(30,40,55,0.14)' }}
      >
        <CheckCircle2 size={12} /> Commande confirmée !
      </motion.div>
    </div>
  )
}

// ─── Ticker ─────────────────────────────────────────────────────────────────
const BRANDS = ['Dari Boutique', 'Ghali Store', 'Bnat Bladi', 'Lalla Fashion', 'Nesrine Collection', 'Chic DZ', 'Anaya Beauty', 'Souk El Nokhba', 'Warda Style', 'Cheikh Deals', 'Rayhana Shop', 'Bledi Mode', 'Sahara Textile', "Nadia's Closet"]

function Ticker() {
  return (
    <div className="relative overflow-hidden py-5">
      <div className="absolute left-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: `linear-gradient(to right, ${PAGE}, transparent)` }} />
      <div className="absolute right-0 top-0 bottom-0 w-24 z-10 pointer-events-none" style={{ background: `linear-gradient(to left, ${PAGE}, transparent)` }} />
      <div className="flex gap-12 whitespace-nowrap" style={{ animation: 'ticker 32s linear infinite' }}>
        {[...BRANDS, ...BRANDS].map((brand, i) => (
          <span key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: INK_FAINT }}>
            <span className="w-1 h-1 rounded-full inline-block" style={{ background: SAGE }} />
            {brand}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Feature Card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, preview, delay }: {
  icon: React.ElementType; title: string; desc: string; preview: React.ReactNode; delay: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      whileHover={{ y: -8 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-[26px] p-6 flex flex-col gap-5"
      style={{
        background: SURF,
        border: `1px solid ${hovered ? SAGE : BORDER}`,
        boxShadow: hovered ? '0 24px 50px rgba(30,40,55,0.10)' : '0 2px 12px rgba(30,40,55,0.04)',
        transition: 'border-color 0.3s, box-shadow 0.3s',
      }}
    >
      <div className="rounded-2xl h-48 flex items-center justify-center overflow-hidden"
        style={{ background: PAGE, border: `1px solid ${BORDER}` }}>
        {preview}
      </div>
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: SAGE_SOFT }}>
            <Icon size={16} style={{ color: SAGE }} />
          </div>
          <h3 className="font-semibold text-base" style={{ fontFamily: HEADING, color: INK }}>{title}</h3>
        </div>
        <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>{desc}</p>
      </div>
    </motion.div>
  )
}

// ─── Pricing Card ─────────────────────────────────────────────────────────────
function PricingCard({ plan, price, period, features, missing, highlight, cta }: {
  plan: string; price: string; period: string; features: string[]; missing?: string[]; highlight?: boolean; cta: string
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      className="rounded-[26px] p-7 flex flex-col gap-6 relative"
      style={{
        background: highlight ? GOLD_SOFT : SURF,
        border: `1px solid ${highlight ? GOLD : BORDER}`,
        boxShadow: highlight ? '0 24px 60px rgba(180,140,40,0.16)' : '0 2px 12px rgba(30,40,55,0.04)',
      }}
    >
      {highlight && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-bold text-white whitespace-nowrap"
          style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})` }}>
          <Star size={10} fill="currentColor" /> Populaire
        </div>
      )}
      <div>
        <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: highlight ? GOLD_DK : INK_FAINT }}>{plan}</p>
        <div className="flex items-end gap-2 mb-1">
          <span className="text-4xl font-medium" style={{ fontFamily: HEADING, color: INK }}>{price}</span>
          <span className="text-xs mb-2" style={{ color: INK_FAINT }}>{period}</span>
        </div>
      </div>
      <ul className="space-y-3 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: INK_SOFT }}>
            <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: SAGE }} />
            {f}
          </li>
        ))}
        {missing?.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-sm opacity-45">
            <span className="flex-shrink-0 mt-0.5 w-[14px] text-center text-[11px]" style={{ color: INK_FAINT }}>✕</span>
            <span className="line-through" style={{ color: INK_FAINT }}>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/auth/register"
        className="w-full py-3.5 rounded-2xl text-sm font-semibold text-center transition-all hover:opacity-90 active:scale-95 block"
        style={highlight
          ? { background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})`, color: '#fff', boxShadow: '0 6px 22px rgba(180,140,40,0.30)' }
          : { border: `1px solid ${INK}`, color: INK }
        }
      >
        {cta}
      </Link>
    </motion.div>
  )
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FAQItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div variants={fadeUp} custom={i * 0.05} className="border-b" style={{ borderColor: BORDER }}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between py-5 text-left gap-4 group">
        <span className="text-sm font-medium transition-colors" style={{ color: open ? SAGE : INK }}>{q}</span>
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
          <ChevronDown size={16} style={{ color: open ? SAGE : INK_FAINT }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="text-sm leading-relaxed pb-5" style={{ color: INK_SOFT }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function KrenixLanding() {
  const statsRef = useRef(null)
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' })
  const [navScrolled, setNavScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const { scrollYProgress } = useScroll()
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 })
  const heroRef = useRef(null)
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(heroScroll, [0, 1], [0, 120])
  const heroFade = useTransform(heroScroll, [0, 0.7], [1, 0])

  const c1 = useCounter(500, 1800, statsInView)
  const c2 = useCounter(12000, 2000, statsInView)
  const c3 = useCounter(98, 1500, statsInView)

  useEffect(() => {
    const fn = () => setNavScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const FAQ = [
    { q: 'Puis-je tester Krenix avant de payer ?', a: 'Oui. Demandez un accès à la boutique de démonstration via Instagram ou WhatsApp. Issam vous envoie un lien pour explorer toutes les fonctionnalités en conditions réelles avant tout paiement.' },
    { q: 'Comment fonctionne le paiement ?', a: 'Vous payez via BaridiMob, CIB, Edahabia ou virement bancaire. Après confirmation du paiement par notre équipe (généralement en moins de 2h), votre plan est activé instantanément.' },
    { q: 'Mes données sont-elles sécurisées ?', a: 'Absolument. Chaque boutique est totalement isolée grâce à notre architecture multi-tenant avec Row Level Security. Vos données ne sont jamais accessibles depuis une autre boutique.' },
    { q: 'Puis-je connecter mon propre domaine ?', a: 'Oui, avec les plans Growth et supérieurs vous pouvez connecter votre propre nom de domaine (ex: maboutique.dz) en plus du sous-domaine Krenix fourni par défaut.' },
    { q: 'Le chatbot parle-t-il darija ?', a: 'Oui ! Le chatbot (Ultimate uniquement) est alimenté par Gemini AI et répond naturellement en français et en darija algérien — comme un vrai vendeur. Il prend aussi les commandes automatiquement.' },
  ]

  const navLinks: [string, string][] = [['Fonctionnalités', '#features'], ['Tarifs', '#pricing'], ['FAQ', '#faq']]

  return (
    <div style={{ background: PAGE, color: INK, fontFamily: SANS, overflowX: 'hidden' }}>

      <style>{`
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes drift1 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(40px,-30px) scale(1.1) } }
        @keyframes drift2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-50px,30px) scale(1.08) } }
        .grain::before {
          content:''; position:fixed; inset:0; z-index:1; pointer-events:none; opacity:0.4; mix-blend-mode:multiply;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E");
        }
        ::selection { background: ${SAGE_SOFT}; color: ${INK}; }
        html { scroll-behavior: smooth; }
      `}</style>

      <div className="grain" />

      {/* Scroll progress bar */}
      <motion.div className="fixed top-0 left-0 right-0 h-[3px] z-[60] origin-left"
        style={{ scaleX: progress, background: `linear-gradient(90deg, ${SAGE}, ${GOLD})` }} />

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
        style={{
          background: navScrolled ? 'color-mix(in oklab, var(--color-dash-page) 82%, transparent)' : 'transparent',
          backdropFilter: navScrolled ? 'blur(18px)' : 'none',
          borderBottom: navScrolled ? `1px solid ${BORDER}` : '1px solid transparent',
        }}>
        <nav className="max-w-6xl mx-auto px-5 sm:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center transition-opacity duration-200 hover:opacity-80">
            <Lockup />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="text-sm font-medium transition-colors duration-200"
                style={{ color: INK_SOFT }}
                onMouseEnter={e => (e.currentTarget.style.color = SAGE)}
                onMouseLeave={e => (e.currentTarget.style.color = INK_SOFT)}>{label}</a>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Link href="/auth/login"
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-105 active:scale-95"
              style={{ border: `1px solid ${BORDER}`, color: INK, background: SURF }}>
              Se connecter
            </Link>
            <button className="md:hidden p-2 rounded-lg" style={{ color: INK }} onClick={() => setMenuOpen(o => !o)} aria-label="Menu">
              <motion.div animate={{ rotate: menuOpen ? 90 : 0 }}>{menuOpen ? <ChevronRight size={22} className="rotate-90" /> : <Layers size={20} />}</motion.div>
            </button>
          </div>
        </nav>

        {/* Mobile menu */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="md:hidden overflow-hidden" style={{ background: SURF, borderBottom: `1px solid ${BORDER}` }}>
              <div className="px-6 py-4 flex flex-col gap-1">
                {navLinks.map(([label, href]) => (
                  <a key={label} href={href} onClick={() => setMenuOpen(false)} className="py-2.5 text-sm font-medium" style={{ color: INK_SOFT }}>{label}</a>
                ))}
                <Link href="/auth/login" className="mt-2 py-2.5 text-center rounded-xl text-sm font-semibold" style={{ background: SAGE, color: '#fff' }}>Se connecter</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col justify-center pt-28 pb-16 px-5 sm:px-6 overflow-hidden">
        {/* Drifting glows */}
        <div className="absolute top-[-10%] left-[-5%] w-[520px] h-[520px] rounded-full blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${SAGE_SOFT} 0%, transparent 70%)`, animation: 'drift1 16s ease-in-out infinite', opacity: 0.7 }} />
        <div className="absolute bottom-[-10%] right-[-5%] w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${GOLD_SOFT} 0%, transparent 70%)`, animation: 'drift2 20s ease-in-out infinite', opacity: 0.7 }} />
        {/* Ghost phoenix watermark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 0.06, scale: 1 }} transition={{ duration: 1.4, ease: EASE }}
          className="absolute right-[-6%] top-1/2 -translate-y-1/2 pointer-events-none hidden lg:block">
          <Phoenix size={620} />
        </motion.div>

        <motion.div style={{ y: heroY, opacity: heroFade }} className="relative z-10 max-w-6xl mx-auto w-full grid lg:grid-cols-2 gap-14 items-center">
          {/* Left */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-7"
              style={{ background: SAGE_SOFT, border: `1px solid color-mix(in oklab, ${SAGE} 30%, transparent)`, color: SAGE_DK }}
            >
              <IconRocket size={11} /> Première plateforme e-commerce algérienne
            </motion.div>

            <h1 className="text-[3.2rem] sm:text-6xl xl:text-7xl leading-[1.02] mb-6 tracking-tight" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              {['Vendez plus.', 'Gérez tout.', "Depuis l'Algérie."].map((line, i) => (
                <motion.span key={line} className="block"
                  initial={{ opacity: 0, y: 30, filter: 'blur(8px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.8, delay: 0.15 + i * 0.13, ease: EASE }}
                  style={i === 1
                    ? { background: `linear-gradient(120deg, ${SAGE}, ${GOLD_DK})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontStyle: 'italic' }
                    : i === 2 ? { color: INK_FAINT } : { color: INK }}>
                  {line}
                </motion.span>
              ))}
            </h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.5 }}
              className="text-base sm:text-lg mb-8 leading-relaxed max-w-md mx-auto lg:mx-0" style={{ color: INK_SOFT }}
            >
              Boutique en ligne, landing pages IA, chatbot en darija, gestion commandes — tout ce qu&apos;un dropshipper algérien a besoin, en un seul endroit.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.62 }}
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8"
            >
              <Link href="/auth/register"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-semibold text-sm text-white transition-all hover:scale-[1.03] active:scale-95"
                style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})`, boxShadow: '0 10px 34px rgba(60,110,80,0.28)' }}>
                Créer ma boutique <ArrowRight size={15} />
              </Link>
              <a href="#features"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-semibold text-sm transition-all"
                style={{ border: `1px solid ${BORDER}`, color: INK, background: SURF }}>
                Voir les fonctionnalités
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              className="flex items-center gap-3 justify-center lg:justify-start"
            >
              <div className="flex -space-x-2">
                {[SAGE, GOLD, SAGE_DK, GOLD_DK].map((c, i) => (
                  <div key={i} className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
                    style={{ borderColor: PAGE, background: c }}>
                    {['A', 'Y', 'K', 'S'][i]}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {[...Array(5)].map((_, i) => <Star key={i} size={11} fill={GOLD} style={{ color: GOLD }} />)}
                </div>
                <span className="text-xs" style={{ color: INK_SOFT }}>+500 boutiques actives</span>
              </div>
            </motion.div>
          </div>

          {/* Right — mockup */}
          <motion.div
            initial={{ opacity: 0, x: 44 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
            className="hidden lg:block"
          >
            <DashboardMockup />
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2" style={{ color: INK_FAINT }}>
          <span className="text-[10px] uppercase tracking-widest">Découvrir</span>
          <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
            <ChevronDown size={15} />
          </motion.div>
        </motion.div>
      </section>

      {/* ── TICKER ─────────────────────────────────────────────────────────── */}
      <div className="relative border-y" style={{ borderColor: BORDER }}>
        <Ticker />
      </div>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-24 sm:py-28 px-5 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: SAGE_SOFT, color: SAGE_DK }}>
              <Layers size={11} /> Fonctionnalités
            </div>
            <h2 className="text-4xl lg:text-5xl mb-4" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              Tout pour vendre en Algérie<br />
              <span style={{ color: INK_FAINT, fontStyle: 'italic' }}>sans friction</span>
            </h2>
            <p className="text-base max-w-lg mx-auto leading-relaxed" style={{ color: INK_SOFT }}>
              Conçu spécifiquement pour le marché algérien — paiement local, 58 wilayas, darija intégré.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            className="grid md:grid-cols-3 gap-5"
          >
            <FeatureCard
              icon={IconStore} delay={0}
              title="Boutique en 5 minutes"
              desc="Choisissez un thème, ajoutez vos produits et lancez votre boutique avec votre propre sous-domaine krenix.store."
              preview={
                <div className="w-full h-full p-4 flex flex-col gap-2">
                  <div className="flex gap-1 mb-2">
                    <div className="w-12 h-1.5 rounded-full" style={{ background: SAGE }} />
                    <div className="w-8 h-1.5 rounded-full" style={{ background: BORDER }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="rounded-xl overflow-hidden" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                        <div className="aspect-square" style={{ background: `linear-gradient(135deg, ${SAGE_SOFT}, ${GOLD_SOFT})` }} />
                        <div className="p-1.5">
                          <div className="h-1.5 w-3/4 rounded mb-1" style={{ background: BORDER }} />
                          <div className="h-1.5 w-1/2 rounded" style={{ background: SAGE }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              }
            />
            <FeatureCard
              icon={IconAIPage} delay={1}
              title="Landing pages IA"
              desc="Générez des pages produit qui convertissent avec Claude AI — headline, bénéfices, témoignages et urgence en quelques secondes."
              preview={
                <div className="w-full h-full p-5 flex flex-col items-center justify-center gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: SAGE_SOFT }}>
                    <IconAIPage size={18} className="text-dash-accent" />
                  </div>
                  <div className="w-full space-y-2">
                    {[100, 75, 90].map((w, i) => (
                      <motion.div key={i}
                        initial={{ width: '20%' }} animate={{ width: `${w}%` }}
                        transition={{ duration: 1.2, delay: i * 0.4, repeat: Infinity, repeatType: 'reverse', repeatDelay: 1.5 }}
                        className="h-1.5 rounded-full" style={{ background: i === 0 ? SAGE : BORDER }} />
                    ))}
                  </div>
                  <p className="text-[10px] font-semibold" style={{ color: SAGE_DK }}>✓ Page générée — 1 crédit</p>
                </div>
              }
            />
            <FeatureCard
              icon={IconChatbot} delay={2}
              title="Chatbot en darija"
              desc="Votre assistant répond en français et darija algérien, prend les commandes automatiquement, 24h/24."
              preview={
                <div className="w-full h-full p-3 flex flex-col justify-end gap-1.5">
                  {[
                    { side: 'user', text: 'salam, bghit nshri...' },
                    { side: 'bot', text: 'Bonjour ! Bien sûr, quelle taille voulez-vous ?' },
                    { side: 'user', text: 'M s3hab, win twassal ?' },
                    { side: 'bot', text: 'Livraison partout en Algérie sous 2-4 jours 🚚' },
                  ].map((m, i) => (
                    <div key={i} className={`flex ${m.side === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className="max-w-[80%] px-2.5 py-1.5 rounded-xl text-[9px] leading-relaxed"
                        style={m.side === 'bot' ? { background: SURF2, color: INK_SOFT, border: `1px solid ${BORDER}` } : { background: SAGE, color: '#fff' }}>
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
              }
            />
          </motion.div>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────────────────────────── */}
      <section ref={statsRef} className="py-20 px-5 sm:px-6 relative">
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-4 sm:gap-6">
          {[
            { val: c1, suf: '+', label: 'Boutiques créées', sub: 'En Algérie' },
            { val: c2, suf: '+', label: 'Commandes traitées', sub: 'Chaque mois' },
            { val: c3, suf: '%', label: 'Clients satisfaits', sub: 'Note 4.9/5' },
          ].map(({ val, suf, label, sub }, i) => (
            <motion.div key={label} variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center">
              <p className="mb-1.5" style={{
                fontFamily: HEADING, fontWeight: 500, fontSize: 'clamp(1.9rem,5vw,3.5rem)',
                background: `linear-gradient(135deg, ${SAGE}, ${GOLD_DK})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {val.toLocaleString()}{suf}
              </p>
              <p className="font-semibold text-sm mb-0.5" style={{ color: INK }}>{label}</p>
              <p className="text-xs" style={{ color: INK_FAINT }}>{sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="py-24 sm:py-28 px-5 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5" style={{ background: SAGE_SOFT, color: SAGE_DK }}>
              <Clock size={11} /> En 3 étapes simples
            </div>
            <h2 className="text-4xl lg:text-5xl" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              Lancez-vous<br /><span style={{ color: INK_FAINT, fontStyle: 'italic' }}>aujourd&apos;hui même</span>
            </h2>
          </motion.div>

          <div className="relative grid md:grid-cols-3 gap-10">
            <motion.div
              className="hidden md:block absolute top-10 left-[calc(16.66%+24px)] right-[calc(16.66%+24px)] h-px origin-left"
              style={{ background: `linear-gradient(90deg, ${SAGE}, ${GOLD})` }}
              initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE }} />

            {[
              { icon: IconRocket, title: 'Créez votre compte', desc: 'Inscrivez-vous en 30 secondes, choisissez le nom et l\'adresse de votre boutique krenix.store unique.' },
              { icon: IconPackage, title: 'Ajoutez vos produits', desc: 'Importez vos photos, définissez prix, couleurs et tailles. La boutique est en ligne immédiatement.' },
              { icon: IconAnalytics, title: 'Vendez et gérez', desc: 'Suivez vos commandes, confirmez les livraisons, générez des landing pages IA et analysez vos ventes.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center flex flex-col items-center">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-[26px] flex items-center justify-center" style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 10px 30px rgba(30,40,55,0.06)' }}>
                    <Icon size={26} className="text-dash-accent" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${GOLD}, ${GOLD_DK})` }}>{i + 1}</div>
                </div>
                <h3 className="font-semibold text-base mb-2" style={{ fontFamily: HEADING, color: INK }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 sm:py-28 px-5 sm:px-6 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5" style={{ background: GOLD_SOFT, color: GOLD_DK }}>
              <CreditCard size={11} /> Tarifs transparents en DZD
            </div>
            <h2 className="text-4xl lg:text-5xl mb-3" style={{ fontFamily: HEADING, fontWeight: 500 }}>Choisissez votre plan</h2>
            <p className="text-sm" style={{ color: INK_SOFT }}>Payable via BaridiMob, CIB, Edahabia ou virement bancaire</p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            className="grid md:grid-cols-3 gap-5"
          >
            <PricingCard plan="Basic" price="15 000 DA" period="paiement unique" cta="Commencer" features={[
              '5 crédits IA (à vie)', 'Boutique en ligne', 'Thème par défaut', '10 produits max',
              '1 landing page IA', 'Facebook & TikTok Pixel', 'Export Excel commandes',
            ]} missing={['Thèmes niches', 'Chatbot IA', 'Domaine personnalisé', 'Landing pages illimitées']} />
            <PricingCard plan="Pro" price="3 000 DA" period="/mois" cta="Passer au Pro" features={[
              '20 crédits IA/mois', 'Produits illimités', '10 landing pages IA/mois', 'Thème niche Beauty & Fashion inclus',
              'Facebook & TikTok Pixel', 'Export Excel commandes', 'Calculateur de profit',
            ]} missing={['Chatbot IA', 'Domaine personnalisé']} />
            <PricingCard plan="Ultimate" price="9 000 DA" period="/mois" highlight cta="Passer à Ultimate" features={[
              '100 crédits IA/mois', 'Produits illimités', 'Landing pages illimitées', 'Tous les 5 thèmes niches',
              'Chatbot IA (150 msg/jour)', 'Calculateur de profit', 'Intégrations livraison', '2 membres d\'équipe',
            ]} missing={['Domaine personnalisé']} />
          </motion.div>

          {/* ── Sur Mesure section ── */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mt-16">
            <div className="text-center mb-8">
              <span className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'var(--color-dash-purple-soft)', color: 'var(--color-dash-purple)' }}>
                Plans sur mesure
              </span>
              <h3 className="text-2xl mt-3" style={{ fontFamily: HEADING, fontWeight: 500, color: INK }}>Pour aller plus loin</h3>
              <p className="text-sm mt-1" style={{ color: INK_SOFT }}>
                Intégrations avancées, multi-boutiques, agences &amp; grandes enseignes
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { id: 'growth', name: 'Growth', price: '12 000', period: '/mois', icon: Rocket, color: 'var(--color-dash-success)', tagline: 'Pour les marchands qui veulent scaler',
                  highlights: ['Tout Ultimate +', '200 crédits IA/mois', 'Chatbot IA 300 msg/jour', 'Domaine personnalisé', '2 membres d\'équipe', 'Statistiques de vente avancées', 'Rapport mensuel automatique', 'Support prioritaire par email'] },
                { id: 'business', name: 'Business', price: '20 000', period: '/mois', icon: Building2, color: 'var(--color-dash-purple)', tagline: 'Pour les boutiques sérieuses',
                  highlights: ['Tout Growth +', '400 crédits IA/mois', 'Impression étiquettes livraison auto', 'A/B testing landing pages', 'CRM clients & historique achats', 'SMS confirmation automatique', '5 membres d\'équipe', '3 domaines personnalisés'] },
                { id: 'agency', name: 'Agency', price: '35 000', period: '/mois', icon: Globe2, color: 'var(--color-dash-danger)', tagline: 'Pour les agences & drop multi-boutiques',
                  highlights: ['Tout Business +', '800 crédits IA/mois', 'Impression étiquettes auto', 'Vue agence — gérer toutes les boutiques en 1 dashboard', '5 boutiques simultanées', 'Membres illimités', 'Accès API', 'Manager de compte dédié'] },
                { id: 'enterprise', name: 'Enterprise', price: '60 000', period: '/mois', icon: Star, color: GOLD_DK, tagline: 'Infrastructure dédiée & développement custom',
                  highlights: ['Tout Agency +', '1 500 crédits IA/mois (affichés comme illimités)', 'Infrastructure dédiée (non partagée)', 'White label complet — votre logo sur la plateforme', 'Boutiques illimitées', 'Développement de fonctionnalités sur mesure', 'SLA garanti 99.9%', 'Ligne directe WhatsApp (prioritaire)'] },
              ].map(plan => {
                const Icon = plan.icon
                return (
                  <motion.div key={plan.id} variants={fadeUp} whileHover={{ y: -5 }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                    className="flex flex-col rounded-[24px] p-6 gap-4"
                    style={{ border: `1px solid ${BORDER}`, background: SURF, boxShadow: '0 2px 12px rgba(30,40,55,0.04)' }}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in oklab, ${plan.color} 14%, transparent)` }}>
                          <Icon size={18} style={{ color: plan.color }} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold" style={{ color: INK }}>{plan.name}</p>
                          <p className="text-xs truncate" style={{ color: INK_SOFT }}>{plan.tagline}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-medium text-xl" style={{ color: INK, fontFamily: HEADING }}>{plan.price}</p>
                        <p className="text-xs" style={{ color: INK_FAINT }}>DZD{plan.period}</p>
                      </div>
                    </div>

                    <ul className="space-y-2">
                      {plan.highlights.map(h => (
                        <li key={h} className="flex items-start gap-2 text-sm">
                          <ChevronRight size={13} className="flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                          <span style={{ color: INK_SOFT }}>{h}</span>
                        </li>
                      ))}
                    </ul>

                    <Link href="/auth/register" className="w-full py-2.5 rounded-xl text-sm font-bold text-center transition-all hover:opacity-90 block text-white"
                      style={{ background: SAGE }}>
                      Choisir {plan.name}
                    </Link>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 px-5 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <h2 className="text-4xl mb-3" style={{ fontFamily: HEADING, fontWeight: 500 }}>Questions fréquentes</h2>
            <p className="text-sm" style={{ color: INK_SOFT }}>D&apos;autres questions ? Contactez-nous via Instagram ou WhatsApp.</p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={{ visible: { transition: { staggerChildren: 0.07 } } }}>
            {FAQ.map((item, i) => <FAQItem key={i} q={item.q} a={item.a} i={i} />)}
          </motion.div>
        </div>
      </section>

      {/* ── CTA BANNER ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-5 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="rounded-[32px] p-10 sm:p-12 text-center relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${SURF}, ${SAGE_SOFT})`, border: `1px solid ${BORDER}`, boxShadow: '0 30px 70px rgba(30,40,55,0.10)' }}
          >
            <div className="absolute top-[-40%] left-1/2 -translate-x-1/2 w-full h-64 blur-3xl opacity-60 pointer-events-none"
              style={{ background: `radial-gradient(ellipse, ${GOLD_SOFT}, transparent 70%)` }} />
            <div className="relative">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                <IconRocket size={22} className="text-dash-accent" />
              </div>
              <h2 className="text-4xl lg:text-5xl mb-4" style={{ fontFamily: HEADING, fontWeight: 500 }}>
                Prêt à lancer<br /><span style={{ fontStyle: 'italic', color: SAGE_DK }}>votre boutique ?</span>
              </h2>
              <p className="text-base mb-8 max-w-md mx-auto" style={{ color: INK_SOFT }}>
                Rejoignez les commerçants algériens qui vendent déjà avec Krenix. Configuration en 5 minutes.
              </p>
              <Link href="/auth/register"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white text-sm transition-all hover:scale-[1.04] active:scale-95"
                style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})`, boxShadow: '0 10px 40px rgba(60,110,80,0.32)' }}>
                Créer ma boutique maintenant <ArrowRight size={15} />
              </Link>
              <p className="text-xs mt-4" style={{ color: INK_FAINT }}>Aucune carte de crédit requise</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="border-t px-5 sm:px-6 py-16" style={{ borderColor: BORDER }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="mb-4"><Lockup mark={56} text={36} /></div>
              <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>La plateforme e-commerce pensée pour l&apos;Algérie.</p>
            </div>

            {[
              { title: 'Produit', links: [{ label: 'Fonctionnalités', href: '#' }, { label: 'Tarifs', href: '#' }, { label: 'Démo', href: '#' }, { label: 'Changelog', href: '#' }] },
              { title: 'Ressources', links: [{ label: 'Documentation', href: '#' }, { label: 'FAQ', href: '#' }, { label: 'Boutiques exemples', href: '#' }, { label: 'Blog', href: '#' }] },
              { title: 'Entreprise', links: [{ label: 'À propos', href: '#' }, { label: 'Contact', href: 'mailto:contact@krenix.store' }, { label: 'CGU', href: '/terms' }, { label: 'Confidentialité', href: '/privacy' }] },
            ].map(({ title, links }) => (
              <div key={title}>
                <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: INK }}>{title}</p>
                <ul className="space-y-3">
                  {links.map(link => (
                    <li key={link.label}><a href={link.href} className="text-sm transition-colors" style={{ color: INK_SOFT }}
                      onMouseEnter={e => (e.currentTarget.style.color = SAGE)} onMouseLeave={e => (e.currentTarget.style.color = INK_SOFT)}>{link.label}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t" style={{ borderColor: BORDER }}>
            <p className="text-xs" style={{ color: INK_FAINT }}>© {new Date().getFullYear()} Krenix — Tous droits réservés.</p>
            <div className="flex items-center gap-5">
              {['Instagram', 'Facebook', 'WhatsApp'].map(s => (
                <a key={s} href="#" className="text-xs transition-colors" style={{ color: INK_SOFT }}
                  onMouseEnter={e => (e.currentTarget.style.color = SAGE)} onMouseLeave={e => (e.currentTarget.style.color = INK_SOFT)}>{s}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
