'use client'

import { motion, useInView, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowRight, Check, ChevronDown,
  ShoppingBag, BarChart3, Star, MessageCircle, CreditCard, Layers,
  CheckCircle2, Clock,
} from 'lucide-react'
import NovaluxLogo from '@/components/ui/NovaluxLogo'
import { IconStore, IconAIPage, IconChatbot, IconRocket, IconPackage, IconAnalytics } from '@/components/ui/NovaluxIcons'

// ─── Fade-up variant ─────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fadeUp: any = {
  hidden: { opacity: 0, y: 32 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.65, delay: i * 0.1, ease: 'easeOut' },
  }),
}

// ─── Animated counter ────────────────────────────────────────────────────────
function useCounter(target: number, duration = 2000, active = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    const steps = 60
    const inc = target / steps
    let current = 0
    let frame = 0
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

// ─── Dashboard Mockup ────────────────────────────────────────────────────────
function DashboardMockup() {
  return (
    <div className="relative w-full max-w-[520px] mx-auto select-none" style={{ perspective: 1200 }}>
      <div className="absolute inset-0 rounded-3xl blur-3xl opacity-25 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #3B82F6 0%, transparent 70%)', transform: 'translateY(40px) scaleX(0.8)' }} />

      <motion.div
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="relative rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #151520 0%, #0F0F1A 100%)',
          border: '1px solid rgba(59,130,246,0.18)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)',
          transform: 'rotateX(6deg) rotateY(-4deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        <div className="flex">
          {/* Sidebar */}
          <div className="w-14 flex flex-col items-center py-5 gap-5 border-r border-white/5 flex-shrink-0" style={{ background: '#0D0D18' }}>
            <div className="flex items-center justify-center px-1">
              <NovaluxLogo compact height={14} color="#fff" />
            </div>
            {[BarChart3, Layers, ShoppingBag, MessageCircle].map((Icon, i) => (
              <div key={i} className={`w-8 h-8 rounded-xl flex items-center justify-center`}
                style={{ background: i === 0 ? 'rgba(59,130,246,0.15)' : 'transparent' }}>
                <Icon size={14} style={{ color: i === 0 ? '#3B82F6' : 'rgba(255,255,255,0.2)' }} />
              </div>
            ))}
          </div>

          {/* Main content */}
          <div className="flex-1 p-4 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-white text-xs font-semibold">Tableau de bord</p>
                <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>Aujourd'hui · 28 juin</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
                <Star size={9} className="text-blue-500" />
                <span className="text-blue-500 text-[9px] font-semibold">5 crédits</span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: 'Commandes', value: '24', color: '#3B82F6' },
                { label: 'Revenus', value: '87K', color: '#3B82F6' },
                { label: 'Produits', value: '6', color: '#10B981' },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl p-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[9px] mb-1" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</p>
                  <p className="text-white text-sm font-bold">{value} <span className="text-[8px]" style={{ color }}>DA</span></p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="rounded-xl p-3 mb-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-[9px] mb-2" style={{ color: 'rgba(255,255,255,0.3)' }}>Ventes — 7 derniers jours</p>
              <svg viewBox="0 0 200 36" className="w-full h-7">
                <defs>
                  <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0,32 L28,25 L56,20 L84,27 L112,16 L140,10 L168,6 L200,2 L200,36 L0,36Z" fill="url(#cg)" />
                <path d="M0,32 L28,25 L56,20 L84,27 L112,16 L140,10 L168,6 L200,2" fill="none" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="200" cy="2" r="2.5" fill="#3B82F6" />
              </svg>
            </div>

            {/* Orders */}
            <div className="space-y-1">
              {[
                { name: 'Amira B.', wilaya: 'Alger', amount: '4 200', status: 'confirmed' },
                { name: 'Youcef M.', wilaya: 'Oran', amount: '2 800', status: 'pending' },
                { name: 'Sara K.', wilaya: 'Constantine', amount: '6 500', status: 'livree' },
              ].map(({ name, wilaya, amount, status }) => (
                <div key={name} className="flex items-center justify-between px-2 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-black flex-shrink-0" style={{ background: '#3B82F6' }}>{name[0]}</div>
                    <div>
                      <p className="text-[9px] font-medium text-white">{name}</p>
                      <p className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{wilaya}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-semibold text-blue-500">{amount} DA</p>
                    <div className={`text-[7px] px-1.5 py-0.5 rounded-full inline-block mt-0.5 ${
                      status === 'confirmed' ? 'bg-blue-400/10 text-blue-400' :
                      status === 'livree' ? 'bg-green-400/10 text-green-400' :
                      'bg-yellow-400/10 text-yellow-400'
                    }`}>{status === 'confirmed' ? 'Confirmée' : status === 'livree' ? 'Livrée' : 'En attente'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        animate={{ y: [0, -7, 0], rotate: [0, 1, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        className="absolute -top-5 -right-4 flex items-center gap-2 px-3 py-2 rounded-2xl text-xs font-semibold shadow-xl"
        style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)', color: '#000', boxShadow: '0 8px 32px rgba(59,130,246,0.45)' }}
      >
        <Star size={12} fill="currentColor" /> Page IA générée
      </motion.div>

      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        className="absolute -bottom-3 -left-4 flex items-center gap-2 px-3 py-2 rounded-2xl text-xs shadow-xl"
        style={{ background: '#111118', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      >
        <CheckCircle2 size={12} /> Commande confirmée !
      </motion.div>
    </div>
  )
}

// ─── Ticker ──────────────────────────────────────────────────────────────────
const BRANDS = ['Moda Alger', 'Tissus Royaux', 'La Belle Maison', 'Élégance Oran', 'Bijoux du Sud', 'Casa Décor', 'Mode Tizi', 'Textile Pro', 'Maison Setif', 'Blida Fashion', 'Smart Shop DZ', 'Algiers Store']

function Ticker() {
  return (
    <div className="relative overflow-hidden py-5 border-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
      <div className="absolute left-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: 'linear-gradient(to right, #0A0A0F, transparent)' }} />
      <div className="absolute right-0 top-0 bottom-0 w-20 z-10 pointer-events-none" style={{ background: 'linear-gradient(to left, #0A0A0F, transparent)' }} />
      <div className="flex gap-12 whitespace-nowrap" style={{ animation: 'ticker 30s linear infinite' }}>
        {[...BRANDS, ...BRANDS].map((brand, i) => (
          <span key={i} className="flex items-center gap-3 text-sm font-medium" style={{ color: 'rgba(255,255,255,0.22)' }}>
            <span className="w-1 h-1 rounded-full inline-block" style={{ background: '#3B82F6', opacity: 0.5 }} />
            {brand}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Feature Card ────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, desc, preview, delay }: {
  icon: React.ElementType; title: string; desc: string; preview: React.ReactNode; delay: number
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <motion.div
      variants={fadeUp}
      custom={delay}
      whileHover={{ y: -6 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="rounded-3xl p-6 flex flex-col gap-5"
      style={{
        background: 'linear-gradient(135deg, #111118 0%, #0D0D16 100%)',
        border: `1px solid ${hovered ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.07)'}`,
        transition: 'border-color 0.3s',
      }}
    >
      <div className="rounded-2xl h-48 flex items-center justify-center overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
        {preview}
      </div>
      <div>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <Icon size={16} className="text-blue-500" />
          </div>
          <h3 className="text-white font-semibold text-sm" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h3>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>{desc}</p>
      </div>
    </motion.div>
  )
}

// ─── Pricing Card ────────────────────────────────────────────────────────────
function PricingCard({ plan, price, period, features, highlight, cta }: {
  plan: string; price: string; period: string; features: string[]; highlight?: boolean; cta: string
}) {
  return (
    <motion.div
      variants={fadeUp}
      whileHover={{ y: -5, scale: 1.01 }}
      className="rounded-3xl p-7 flex flex-col gap-6 relative"
      style={{
        background: highlight ? 'linear-gradient(135deg, #1A1508, #121005)' : 'linear-gradient(135deg, #111118, #0D0D16)',
        border: highlight ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(255,255,255,0.07)',
        boxShadow: highlight ? '0 0 60px rgba(59,130,246,0.07)' : 'none',
      }}
    >
      {highlight && (
        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-bold text-black whitespace-nowrap"
          style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}>
          <Star size={10} fill="currentColor" /> Populaire
        </div>
      )}
      <div>
        <p className="text-xs uppercase tracking-widest mb-3 font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>{plan}</p>
        <div className="flex items-end gap-2 mb-1">
          <span className="text-3xl font-black text-white" style={{ fontFamily: 'var(--font-heading)' }}>{price}</span>
          <span className="text-xs mb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{period}</span>
        </div>
      </div>
      <ul className="space-y-3 flex-1">
        {features.map(f => (
          <li key={f} className="flex items-start gap-2.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
            <Check size={13} className="text-blue-500 flex-shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
      </ul>
      <Link
        href="/auth/register"
        className={`w-full py-3.5 rounded-2xl text-sm font-semibold text-center transition-all hover:opacity-90 active:scale-95 block ${
          highlight ? 'text-black' : 'text-white'
        }`}
        style={highlight
          ? { background: 'linear-gradient(135deg, #3B82F6, #2563EB)', boxShadow: '0 4px 20px rgba(59,130,246,0.35)' }
          : { border: '1px solid rgba(255,255,255,0.12)' }
        }
      >
        {cta}
      </Link>
    </motion.div>
  )
}

// ─── FAQ Item ────────────────────────────────────────────────────────────────
function FAQItem({ q, a, i }: { q: string; a: string; i: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div variants={fadeUp} custom={i * 0.05} className="border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-5 text-left gap-4 group">
        <span className="text-white text-sm font-medium group-hover:text-blue-500 transition-colors">{q}</span>
        <motion.div animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.2 }} className="flex-shrink-0">
          <ChevronDown size={16} style={{ color: open ? '#3B82F6' : 'rgba(255,255,255,0.3)' }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="text-xs leading-relaxed pb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function NovaluxLanding() {
  const statsRef = useRef(null)
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' })
  const [navScrolled, setNavScrolled] = useState(false)

  const c1 = useCounter(500, 1800, statsInView)
  const c2 = useCounter(12000, 2000, statsInView)
  const c3 = useCounter(98, 1500, statsInView)

  useEffect(() => {
    const fn = () => setNavScrolled(window.scrollY > 20)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const FAQ = [
    { q: 'Puis-je tester Novalux avant de payer ?', a: 'Oui. Demandez un accès à la boutique de démonstration via Instagram ou WhatsApp. Issam vous envoie un lien pour explorer toutes les fonctionnalités en conditions réelles avant tout paiement.' },
    { q: 'Comment fonctionne le paiement ?', a: 'Vous payez via BaridiMob, CIB, Edahabia ou virement bancaire. Après confirmation du paiement par notre équipe (généralement en moins de 2h), votre plan est activé instantanément.' },
    { q: 'Mes données sont-elles sécurisées ?', a: 'Absolument. Chaque boutique est totalement isolée grâce à notre architecture multi-tenant avec Row Level Security. Vos données ne sont jamais accessibles depuis une autre boutique.' },
    { q: 'Puis-je connecter mon propre domaine ?', a: 'Oui, avec les plans Pro et Ultimate vous pouvez connecter votre propre nom de domaine (ex: maboutique.dz) en plus du sous-domaine Novalux fourni par défaut.' },
    { q: 'Le chatbot parle-t-il darija ?', a: 'Oui ! Le chatbot (Ultimate uniquement) est alimenté par Gemini AI et répond naturellement en français et en darija algérien — comme un vrai vendeur. Il prend aussi les commandes automatiquement.' },
  ]

  return (
    <div style={{ background: '#0A0A0F', color: '#fff', fontFamily: 'var(--font-sans)', overflowX: 'hidden' }}>

      <style>{`
        @keyframes ticker { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes gpulse { 0%,100% { opacity:.03 } 50% { opacity:.065 } }
        .grid-bg {
          background-image:
            linear-gradient(rgba(59,130,246,0.07) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59,130,246,0.07) 1px, transparent 1px);
          background-size: 64px 64px;
          animation: gpulse 7s ease-in-out infinite;
        }
        ::selection { background: rgba(59,130,246,0.25); color:#fff; }
        * { scroll-behavior: smooth; }
      `}</style>

      {/* ── NAVBAR ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50 transition-all duration-300"
        style={{
          background: navScrolled ? 'rgba(10,10,15,0.85)' : 'transparent',
          backdropFilter: navScrolled ? 'blur(20px)' : 'none',
          borderBottom: navScrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
        }}>
        <nav className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center group transition-opacity duration-200 hover:opacity-80">
            <NovaluxLogo height={22} color="#fff" />
          </Link>

          <div className="hidden md:flex items-center gap-8">
            {[['Fonctionnalités', '#features'], ['Tarifs', '#pricing'], ['FAQ', '#faq']].map(([label, href]) => (
              <a key={label} href={href} className="text-sm transition-colors duration-200 hover:text-blue-500"
                style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</a>
            ))}
          </div>

          <Link href="/auth/login"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 hover:scale-105 active:scale-95"
            style={{ border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)' }}>
            Se connecter
          </Link>
        </nav>
      </header>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-20 pb-16 px-6 overflow-hidden">
        <div className="absolute inset-0 grid-bg" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.1) 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 70%)' }} />

        <div className="max-w-6xl mx-auto w-full grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-medium mb-7"
              style={{ background: 'rgba(59,130,246,0.09)', border: '1px solid rgba(59,130,246,0.22)', color: '#3B82F6' }}
            >
              <IconRocket size={11} /> Première plateforme e-commerce algérienne
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 28 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="text-5xl lg:text-6xl xl:text-7xl font-black leading-[1.02] mb-6 tracking-tight"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Vendez plus.<br />
              <span style={{ background: 'linear-gradient(135deg,#3B82F6,#93C5FD)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Gérez tout.
              </span>
              <br />
              <span style={{ color: 'rgba(255,255,255,0.28)' }}>Depuis l'Algérie.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.22 }}
              className="text-base mb-8 leading-relaxed max-w-md mx-auto lg:mx-0"
              style={{ color: 'rgba(255,255,255,0.42)' }}
            >
              Boutique en ligne, landing pages IA, chatbot en darija, gestion commandes — tout ce qu'un dropshipper algérien a besoin, en un seul endroit.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.33 }}
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start mb-8"
            >
              <Link href="/auth/register"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-semibold text-sm text-black transition-all hover:opacity-90 hover:scale-[1.03] active:scale-95"
                style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', boxShadow: '0 8px 32px rgba(59,130,246,0.42)' }}>
                Créer ma boutique <ArrowRight size={15} />
              </Link>
              <a href="#features"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-medium text-sm transition-all hover:bg-white/5"
                style={{ border: '1px solid rgba(255,255,255,0.11)', color: 'rgba(255,255,255,0.65)' }}>
                Voir les fonctionnalités
              </a>
            </motion.div>

            {/* Social proof */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="flex items-center gap-3 justify-center lg:justify-start"
            >
              <div className="flex -space-x-2">
                {['#3B82F6', '#3B82F6', '#10B981', '#8B5CF6'].map((c, i) => (
                  <div key={i} className="w-7 h-7 rounded-full border-2 flex items-center justify-center text-[10px] font-bold text-black flex-shrink-0"
                    style={{ borderColor: '#0A0A0F', background: c }}>
                    {['A', 'Y', 'K', 'S'][i]}
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex">
                  {[...Array(5)].map((_, i) => <Star key={i} size={11} fill="#3B82F6" className="text-blue-500" />)}
                </div>
                <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>+500 boutiques actives</span>
              </div>
            </motion.div>
          </div>

          {/* Right — mockup */}
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="hidden lg:block"
          >
            <DashboardMockup />
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
          style={{ color: 'rgba(255,255,255,0.18)' }}>
          <span className="text-[10px] uppercase tracking-widest">Découvrir</span>
          <motion.div animate={{ y: [0, 5, 0] }} transition={{ duration: 1.4, repeat: Infinity }}>
            <ChevronDown size={15} />
          </motion.div>
        </motion.div>
      </section>

      {/* ── TICKER ─────────────────────────────────────────────────────────── */}
      <div className="relative">
        <div className="absolute -top-px inset-x-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.28), transparent)' }} />
        <Ticker />
        <div className="absolute -bottom-px inset-x-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.28), transparent)' }} />
      </div>

      {/* ── FEATURES ───────────────────────────────────────────────────────── */}
      <section id="features" className="py-28 px-6">
        <div className="max-w-6xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6' }}>
              <Layers size={11} /> Fonctionnalités
            </div>
            <h2 className="text-4xl lg:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
              Tout pour vendre en Algérie<br />
              <span style={{ color: 'rgba(255,255,255,0.25)' }}>sans friction</span>
            </h2>
            <p className="text-sm max-w-lg mx-auto leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>
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
              desc="Choisissez un thème, ajoutez vos produits et lancez votre boutique avec votre propre sous-domaine novalux.com."
              preview={
                <div className="w-full h-full p-4 flex flex-col gap-2">
                  <div className="flex gap-1 mb-2">
                    <div className="w-12 h-1.5 rounded-full" style={{ background: '#3B82F6' }} />
                    <div className="w-8 h-1.5 rounded-full bg-white/10" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 flex-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="aspect-square" style={{ background: `linear-gradient(135deg, rgba(59,130,246,${0.04 + i*0.02}), rgba(59,130,246,0.03))` }} />
                        <div className="p-1.5">
                          <div className="h-1.5 w-3/4 rounded bg-white/15 mb-1" />
                          <div className="h-1.5 w-1/2 rounded" style={{ background: 'rgba(59,130,246,0.5)' }} />
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
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.22)' }}>
                    <IconAIPage size={18} className="text-blue-500" />
                  </div>
                  <div className="w-full space-y-2">
                    {[100, 75, 90].map((w, i) => (
                      <motion.div key={i}
                        initial={{ width: '20%' }}
                        animate={{ width: `${w}%` }}
                        transition={{ duration: 1.2, delay: i * 0.4, repeat: Infinity, repeatType: 'reverse', repeatDelay: 1.5 }}
                        className="h-1.5 rounded-full"
                        style={{ background: i === 0 ? '#3B82F6' : 'rgba(255,255,255,0.1)' }}
                      />
                    ))}
                  </div>
                  <p className="text-[10px] font-medium" style={{ color: 'rgba(59,130,246,0.6)' }}>✓ Page générée — 1 crédit</p>
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
                      <div className={`max-w-[80%] px-2.5 py-1.5 rounded-xl text-[9px] leading-relaxed`}
                        style={{ background: m.side === 'bot' ? 'rgba(255,255,255,0.07)' : '#3B82F6', color: m.side === 'bot' ? 'rgba(255,255,255,0.7)' : '#000' }}>
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
      <section ref={statsRef} className="py-20 px-6 relative">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(180deg, transparent, rgba(59,130,246,0.025), transparent)' }} />
        <div className="max-w-4xl mx-auto grid grid-cols-3 gap-6">
          {[
            { val: c1, suf: '+', label: 'Boutiques créées', sub: 'En Algérie' },
            { val: c2, suf: '+', label: 'Commandes traitées', sub: 'Chaque mois' },
            { val: c3, suf: '%', label: 'Clients satisfaits', sub: 'Note 4.9/5' },
          ].map(({ val, suf, label, sub }) => (
            <motion.div key={label} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center">
              <p className="font-black mb-1.5" style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(2rem,5vw,3.5rem)',
                background: 'linear-gradient(135deg,#3B82F6,#93C5FD)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}>
                {val.toLocaleString()}{suf}
              </p>
              <p className="text-white font-semibold text-sm mb-0.5">{label}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{sub}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────────── */}
      <section className="py-28 px-6">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6' }}>
              <Clock size={11} /> En 3 étapes simples
            </div>
            <h2 className="text-4xl lg:text-5xl font-black" style={{ fontFamily: 'var(--font-heading)' }}>
              Lancez-vous<br /><span style={{ color: 'rgba(255,255,255,0.25)' }}>aujourd'hui même</span>
            </h2>
          </motion.div>

          <div className="relative grid md:grid-cols-3 gap-10">
            <div className="hidden md:block absolute top-10 left-[calc(16.66%+24px)] right-[calc(16.66%+24px)] h-px"
              style={{ background: 'linear-gradient(90deg, rgba(59,130,246,0.4), rgba(59,130,246,0.08), rgba(59,130,246,0.4))' }} />

            {[
              { icon: IconRocket, title: 'Créez votre compte', desc: 'Inscrivez-vous en 30 secondes, choisissez le nom et l\'adresse de votre boutique novalux.com unique.' },
              { icon: IconPackage, title: 'Ajoutez vos produits', desc: 'Importez vos photos, définissez prix, couleurs et tailles. La boutique est en ligne immédiatement.' },
              { icon: IconAnalytics, title: 'Vendez et gérez', desc: 'Suivez vos commandes, confirmez les livraisons, générez des landing pages IA et analysez vos ventes.' },
            ].map(({ icon: Icon, title, desc }, i) => (
              <motion.div key={title} variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center flex flex-col items-center">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#151520,#111118)', border: '1px solid rgba(59,130,246,0.18)', boxShadow: '0 0 40px rgba(59,130,246,0.06)' }}>
                    <Icon size={26} className="text-blue-500" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-black"
                    style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)' }}>{i + 1}</div>
                </div>
                <h3 className="text-white font-bold text-sm mb-2" style={{ fontFamily: 'var(--font-heading)' }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.38)' }}>{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-28 px-6 relative">
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(59,130,246,0.04), transparent 55%)' }} />
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-5"
              style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: '#3B82F6' }}>
              <CreditCard size={11} /> Tarifs transparents en DZD
            </div>
            <h2 className="text-4xl lg:text-5xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Choisissez votre plan</h2>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Payable via BaridiMob, CIB, Edahabia ou virement bancaire</p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            className="grid md:grid-cols-3 gap-5"
          >
            <PricingCard plan="Basic" price="15 000 DA" period="paiement unique" cta="Commencer" features={[
              'Boutique en ligne complète', 'Sous-domaine novalux.com', '3 thèmes inclus',
              'Gestion commandes & produits', '5 crédits IA', 'Support email',
            ]} />
            <PricingCard plan="Pro" price="3 000 DA" period="/mois" cta="Passer au Pro" features={[
              'Tout du plan Basic', '20 crédits IA / mois', 'Thèmes Pro débloqués',
              'Domaine personnalisé', 'Statistiques avancées', 'Support prioritaire',
            ]} />
            <PricingCard plan="Ultimate" price="9 000 DA" period="/mois" highlight cta="Passer à Ultimate" features={[
              'Tout du plan Pro', '100 crédits IA / mois', 'Chatbot darija (150 msgs/j)',
              'Commandes auto via chatbot', 'Tous les thèmes', 'Support 7j/7',
            ]} />
          </motion.div>

          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Vous avez besoin de plus ? Découvrez nos offres Growth, Business, Agency et Enterprise.
            </p>
            <Link
              href="/pricing"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all hover:opacity-80"
              style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', color: '#F59E0B' }}
            >
              Voir l'offre personnalisée <ArrowRight size={12} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-14">
            <h2 className="text-4xl font-black mb-3" style={{ fontFamily: 'var(--font-heading)' }}>Questions fréquentes</h2>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.38)' }}>D'autres questions ? Contactez-nous via Instagram ou WhatsApp.</p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={{ visible: { transition: { staggerChildren: 0.07 } } }}>
            {FAQ.map((item, i) => <FAQItem key={i} q={item.q} a={item.a} i={i} />)}
          </motion.div>
        </div>
      </section>

      {/* ── CTA BANNER ─────────────────────────────────────────────────────── */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="rounded-3xl p-12 text-center relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg,#1A1206,#121005,#0F0C04)', border: '1px solid rgba(59,130,246,0.22)', boxShadow: '0 0 80px rgba(59,130,246,0.08)' }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-40 blur-3xl opacity-35 pointer-events-none"
              style={{ background: 'radial-gradient(ellipse, #3B82F6, transparent 70%)' }} />
            <div className="relative">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-6"
                style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                <IconRocket size={22} className="text-blue-500" />
              </div>
              <h2 className="text-4xl lg:text-5xl font-black mb-4" style={{ fontFamily: 'var(--font-heading)' }}>
                Prêt à lancer<br />votre boutique ?
              </h2>
              <p className="text-sm mb-8 max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Rejoignez les commerçants algériens qui vendent déjà avec Novalux. Configuration en 5 minutes.
              </p>
              <Link href="/auth/register"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-black text-sm transition-all hover:opacity-90 hover:scale-[1.04] active:scale-95"
                style={{ background: 'linear-gradient(135deg,#3B82F6,#2563EB)', boxShadow: '0 8px 40px rgba(59,130,246,0.5)' }}>
                Créer ma boutique maintenant <ArrowRight size={15} />
              </Link>
              <p className="text-xs mt-4" style={{ color: 'rgba(255,255,255,0.22)' }}>Aucune carte de crédit requise</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="border-t px-6 py-16" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="mb-4">
                <NovaluxLogo height={20} color="#fff" />
              </div>
              <p className="text-xs leading-relaxed" style={{ color: 'rgba(255,255,255,0.28)' }}>La plateforme e-commerce pensée pour l'Algérie.</p>
            </div>

            {[
              { title: 'Produit', links: ['Fonctionnalités', 'Tarifs', 'Démo', 'Changelog'] },
              { title: 'Ressources', links: ['Documentation', 'FAQ', 'Boutiques exemples', 'Blog'] },
              { title: 'Entreprise', links: ['À propos', 'Contact', 'CGU', 'Confidentialité'] },
            ].map(({ title, links }) => (
              <div key={title}>
                <p className="text-white text-xs font-semibold uppercase tracking-widest mb-4">{title}</p>
                <ul className="space-y-3">
                  {links.map(link => (
                    <li key={link}><a href="#" className="text-xs hover:text-blue-500 transition-colors" style={{ color: 'rgba(255,255,255,0.28)' }}>{link}</a></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-8 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>© {new Date().getFullYear()} Novalux — Tous droits réservés.</p>
            <div className="flex items-center gap-5">
              {['Instagram', 'Facebook', 'WhatsApp'].map(s => (
                <a key={s} href="#" className="text-xs hover:text-blue-500 transition-colors" style={{ color: 'rgba(255,255,255,0.22)' }}>{s}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

    </div>
  )
}
