'use client'

import { motion, useInView, useScroll, useSpring, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, Check, ChevronDown, ChevronRight,
  ShoppingBag, BarChart3, Star, MessageCircle, CreditCard, Layers,
  CheckCircle2, Clock, Rocket, Building2, Globe2, Sparkles, PlayCircle,
} from 'lucide-react'
import { IconStore, IconAIPage, IconChatbot, IconRocket, IconPackage, IconAnalytics } from '@/components/ui/KrenixIcons'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import LanguageSwitcher from '@/components/dashboard/ui/LanguageSwitcher'

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

// ─── Explainer video ──────────────────────────────────────────────────────────
// Paste your YouTube video URL here — any format works (a normal share link
// like youtube.com/watch?v=..., a youtu.be/... short link, a /shorts/... link,
// or an already-built /embed/... URL). Leave empty to show a placeholder.
const EXPLAINER_VIDEO_URL = ''

function toYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1)
      return id ? `https://www.youtube.com/embed/${id}` : null
    }
    if (u.hostname.includes('youtube.com')) {
      if (u.pathname === '/watch') {
        const id = u.searchParams.get('v')
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
      if (u.pathname.startsWith('/embed/')) return url
      if (u.pathname.startsWith('/shorts/')) {
        const id = u.pathname.split('/')[2]
        return id ? `https://www.youtube.com/embed/${id}` : null
      }
    }
    return null
  } catch {
    return null
  }
}

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
function PricingCard({ plan, price, period, features, missing, highlight, cta, popularLabel }: {
  plan: string; price: string; period: string; features: string[]; missing?: string[]; highlight?: boolean; cta: string; popularLabel: string
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
          <Star size={10} fill="currentColor" /> {popularLabel}
        </div>
      )}
      <div>
        <p className="text-xs uppercase tracking-widest mb-3 font-semibold" style={{ color: highlight ? GOLD_DK : INK_FAINT }}>{plan}</p>
        <div className="flex items-end gap-2 mb-1">
          {/* dir="ltr" isolates the digits from bidi reordering — without it, an
              RTL ancestor flips "15 000 DA" into "DA 000 15" (digit order intact,
              but the number/currency runs swap places). */}
          <span dir="ltr" className="text-4xl font-medium" style={{ fontFamily: HEADING, color: INK }}>{price}</span>
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

// ─── Locale-keyed marketing copy ─────────────────────────────────────────────
// This is page-local content (hero copy, feature descriptions, pricing card
// bullet lists, FAQ) rather than shared UI chrome, so it's kept here instead
// of bloating the global i18n Dictionary — same pattern as billing/page.tsx's
// MAIN_PLANS_BY_LOCALE.
const HOME_CONTENT = {
  fr: {
    heroBadge: 'Première plateforme e-commerce algérienne',
    heroLines: ['Vendez plus.', 'Gérez tout.', "Depuis l'Algérie."],
    heroDesc: "Boutique en ligne, landing pages IA, chatbot en darija, gestion commandes — tout ce qu'un dropshipper algérien a besoin, en un seul endroit.",
    ctaCreateStore: 'Créer ma boutique',
    ctaSeeFeatures: 'Voir les fonctionnalités',
    socialProof: '+500 boutiques actives',
    discover: 'Découvrir',

    featuresBadge: 'Fonctionnalités',
    featuresTitle: 'Tout pour vendre en Algérie',
    featuresTitleItalic: 'sans friction',
    featuresDesc: 'Conçu spécifiquement pour le marché algérien — paiement local, 58 wilayas, darija intégré.',
    feature1Title: 'Boutique en 5 minutes',
    feature1Desc: 'Choisissez un thème, ajoutez vos produits et lancez votre boutique avec votre propre sous-domaine krenix.store.',
    feature2Title: 'Landing pages IA',
    feature2Desc: 'Générez des pages produit qui convertissent avec Claude AI — headline, bénéfices, témoignages et urgence en quelques secondes.',
    feature2Badge: '✓ Page générée — 1 crédit',
    feature3Title: 'Chatbot en darija',
    feature3Desc: 'Votre assistant répond en français et darija algérien, prend les commandes automatiquement, 24h/24.',

    statShops: 'Boutiques créées', statShopsSub: 'En Algérie',
    statOrders: 'Commandes traitées', statOrdersSub: 'Chaque mois',
    statSatisfaction: 'Clients satisfaits', statSatisfactionSub: 'Note 4.9/5',

    stepsBadge: 'En 3 étapes simples',
    stepsTitle: 'Lancez-vous', stepsTitleItalic: "aujourd'hui même",
    step1Title: 'Créez votre compte', step1Desc: "Inscrivez-vous en 30 secondes, choisissez le nom et l'adresse de votre boutique krenix.store unique.",
    step2Title: 'Ajoutez vos produits', step2Desc: 'Importez vos photos, définissez prix, couleurs et tailles. La boutique est en ligne immédiatement.',
    step3Title: 'Vendez et gérez', step3Desc: 'Suivez vos commandes, confirmez les livraisons, générez des landing pages IA et analysez vos ventes.',

    videoBadge: 'Démo vidéo',
    videoTitle: 'Voyez Krenix',
    videoTitleItalic: 'en action',
    videoDesc: 'Une explication complète, étape par étape, pour prendre en main votre boutique en quelques minutes.',
    videoPlaceholder: 'Vidéo bientôt disponible',

    pricingBadge: 'Tarifs transparents en DZD',
    pricingTitle: 'Choisissez votre plan',
    pricingSubtitle: 'Payable via BaridiMob, CIB, Edahabia ou virement bancaire',
    oneTime: 'paiement unique', monthly: '/mois',
    ctaStart: 'Commencer', ctaUpgradePro: 'Passer au Pro', ctaUpgradeUltimate: 'Passer à Ultimate',
    popular: 'Populaire',
    basicFeatures: ['5 crédits IA (à vie)', 'Boutique en ligne', 'Thème par défaut', '10 produits max', '1 landing page IA', 'Facebook & TikTok Pixel', 'Export Excel commandes'],
    basicMissing: ['Thèmes niches', 'Chatbot IA', 'Domaine personnalisé', 'Landing pages illimitées'],
    proFeatures: ['20 crédits IA/mois', 'Produits illimités', '10 landing pages IA/mois', 'Thème niche Beauty & Fashion inclus', 'Facebook & TikTok Pixel', 'Export Excel commandes', 'Calculateur de profit'],
    proMissing: ['Chatbot IA', 'Domaine personnalisé'],
    ultimateFeatures: ['100 crédits IA/mois', 'Produits illimités', 'Landing pages illimitées', 'Tous les 5 thèmes niches', 'Chatbot IA (150 msg/jour)', 'Calculateur de profit', 'Intégrations livraison', "2 membres d'équipe"],
    ultimateMissing: ['Domaine personnalisé'],

    surMesureBadge: 'Plans sur mesure',
    surMesureTitle: 'Pour aller plus loin',
    surMesureSubtitle: 'Intégrations avancées, multi-boutiques, agences & grandes enseignes',
    growthTagline: 'Pour les marchands qui veulent scaler',
    businessTagline: 'Pour les boutiques sérieuses',
    agencyTagline: 'Pour les agences & drop multi-boutiques',
    enterpriseTagline: 'Infrastructure dédiée & développement custom',
    growthHighlights: ['Tout Ultimate +', '200 crédits IA/mois', 'Chatbot IA 300 msg/jour', 'Domaine personnalisé', "2 membres d'équipe", 'Statistiques de vente avancées', 'Rapport mensuel automatique', 'Support prioritaire par email'],
    businessHighlights: ['Tout Growth +', '400 crédits IA/mois', 'Impression étiquettes livraison auto', 'A/B testing landing pages', 'CRM clients & historique achats', 'SMS confirmation automatique', "5 membres d'équipe", '3 domaines personnalisés'],
    agencyHighlights: ['Tout Business +', '800 crédits IA/mois', 'Impression étiquettes auto', 'Vue agence — gérer toutes les boutiques en 1 dashboard', '5 boutiques simultanées', 'Membres illimités', 'Accès API', 'Manager de compte dédié'],
    enterpriseHighlights: ['Tout Agency +', '1 500 crédits IA/mois (affichés comme illimités)', 'Infrastructure dédiée (non partagée)', 'White label complet — votre logo sur la plateforme', 'Boutiques illimitées', 'Développement de fonctionnalités sur mesure', 'SLA garanti 99.9%', 'Ligne directe WhatsApp (prioritaire)'],
    choosePlan: 'Choisir',

    faqTitle: 'Questions fréquentes',
    faqSubtitle: "D'autres questions ? Contactez-nous via Instagram ou WhatsApp.",
    faq: [
      { q: 'Les photos IA rendent-elles vraiment comme des photos de studio ?', a: "Oui. Uploadez une simple photo prise avec votre téléphone, et notre IA la transforme en visuel de qualité studio — fond neutre, éclairage professionnel, mise en scène soignée. Idéal pour donner un rendu premium à vos produits sans matériel photo." },
      { q: 'Comment fonctionne le paiement ?', a: 'Vous payez via BaridiMob, CIB, Edahabia ou virement bancaire. Après confirmation du paiement par notre équipe (généralement en moins de 2h), votre plan est activé instantanément.' },
      { q: 'Mes données sont-elles sécurisées ?', a: 'Absolument. Chaque boutique est totalement isolée grâce à notre architecture multi-tenant avec Row Level Security. Vos données ne sont jamais accessibles depuis une autre boutique.' },
      { q: 'Puis-je connecter mon propre domaine ?', a: 'Oui, avec les plans Growth et supérieurs vous pouvez connecter votre propre nom de domaine (ex: maboutique.dz) en plus du sous-domaine Krenix fourni par défaut.' },
      { q: 'Puis-je connecter Yalidine pour gérer mes livraisons automatiquement ?', a: "Oui, avec les plans Ultimate et supérieurs. Connectez votre compte Yalidine et créez vos bordereaux d'expédition directement depuis Krenix, avec suivi des colis en temps réel — plus besoin de ressaisir vos commandes ailleurs." },
      { q: 'Le chatbot parle-t-il darija ?', a: 'Oui ! Le chatbot (Ultimate uniquement) est alimenté par Gemini AI et répond naturellement en français et en darija algérien — comme un vrai vendeur. Il prend aussi les commandes automatiquement.' },
      { q: 'Comment fonctionne le calculateur de profit ?', a: 'Le calculateur de profit (Ultimate et plus) calcule automatiquement votre marge réelle sur chaque vente — prix produit, coût de livraison, frais divers — pour que vous sachiez exactement combien vous gagnez, commande par commande.' },
    ],

    ctaBannerTitle: 'Prêt à lancer', ctaBannerTitleItalic: 'votre boutique ?',
    ctaBannerDesc: 'Rejoignez les commerçants algériens qui vendent déjà avec Krenix. Configuration en 5 minutes.',
    ctaBannerButton: 'Créer ma boutique maintenant',
    ctaBannerNote: 'Aucune carte de crédit requise',

    footerTagline: "La plateforme e-commerce pensée pour l'Algérie.",
    footerProductTitle: 'Produit', footerProductLinks: ['Fonctionnalités', 'Tarifs', 'Démo', 'Changelog'],
    footerResourcesTitle: 'Ressources', footerResourcesLinks: ['Documentation', 'FAQ', 'Boutiques exemples', 'Blog'],
    footerCompanyTitle: 'Entreprise', footerCompanyLinks: ['À propos', 'Contact', 'CGU', 'Confidentialité'],
    footerRights: (year: number) => `© ${year} Krenix — Tous droits réservés.`,
  },
  ar: {
    heroBadge: 'أول منصة تجارة إلكترونية جزائرية',
    heroLines: ['بيع أكثر.', 'أدر كل شيء.', 'من الجزائر.'],
    heroDesc: 'متجر إلكتروني، صفحات هبوط بالذكاء الاصطناعي، روبوت محادثة بالدارجة، إدارة الطلبات — كل ما يحتاجه تاجر التجارة الإلكترونية الجزائري في مكان واحد.',
    ctaCreateStore: 'أنشئ متجري',
    ctaSeeFeatures: 'اكتشف المميزات',
    socialProof: '+500 متجر نشط',
    discover: 'اكتشف المزيد',

    featuresBadge: 'المميزات',
    featuresTitle: 'كل ما تحتاجه للبيع في الجزائر',
    featuresTitleItalic: 'بدون تعقيد',
    featuresDesc: 'مصمم خصيصاً للسوق الجزائري — دفع محلي، 58 ولاية، دارجة مدمجة.',
    feature1Title: 'متجر في 5 دقائق',
    feature1Desc: 'اختر ثيماً، أضف منتجاتك وأطلق متجرك مع نطاقك الفرعي الخاص krenix.store.',
    feature2Title: 'صفحات هبوط بالذكاء الاصطناعي',
    feature2Desc: 'أنشئ صفحات منتج تُقنع بمساعدة Claude AI — عنوان رئيسي، مزايا، شهادات وإلحاحية في ثوانٍ.',
    feature2Badge: '✓ تم إنشاء الصفحة — رصيد واحد',
    feature3Title: 'روبوت محادثة بالدارجة',
    feature3Desc: 'مساعدك يرد بالفرنسية والدارجة الجزائرية، يأخذ الطلبات تلقائياً، على مدار الساعة.',

    statShops: 'متجر تم إنشاؤه', statShopsSub: 'في الجزائر',
    statOrders: 'طلب تمت معالجته', statOrdersSub: 'كل شهر',
    statSatisfaction: 'عملاء راضون', statSatisfactionSub: 'تقييم 4.9/5',

    stepsBadge: 'في 3 خطوات بسيطة',
    stepsTitle: 'انطلق', stepsTitleItalic: 'اليوم بالذات',
    step1Title: 'أنشئ حسابك', step1Desc: 'سجّل في 30 ثانية، اختر اسم وعنوان متجرك الفريد krenix.store.',
    step2Title: 'أضف منتجاتك', step2Desc: 'ارفع صورك، حدد الأسعار والألوان والمقاسات. المتجر يصبح متاحاً فوراً.',
    step3Title: 'بِع وأدر', step3Desc: 'تابع طلباتك، أكّد التوصيل، أنشئ صفحات هبوط بالذكاء الاصطناعي وحلّل مبيعاتك.',

    videoBadge: 'فيديو توضيحي',
    videoTitle: 'شاهد Krenix',
    videoTitleItalic: 'أثناء العمل',
    videoDesc: 'شرح كامل خطوة بخطوة للتحكم في متجرك خلال دقائق.',
    videoPlaceholder: 'الفيديو قريباً',

    pricingBadge: 'أسعار شفافة بالدينار الجزائري',
    pricingTitle: 'اختر خطتك',
    pricingSubtitle: 'الدفع عبر BaridiMob أو CIB أو Edahabia أو تحويل بنكي',
    oneTime: 'دفعة واحدة', monthly: '/شهرياً',
    ctaStart: 'ابدأ الآن', ctaUpgradePro: 'الترقية إلى Pro', ctaUpgradeUltimate: 'الترقية إلى Ultimate',
    popular: 'الأكثر طلباً',
    basicFeatures: ['5 أرصدة ذكاء اصطناعي (مدى الحياة)', 'متجر إلكتروني', 'ثيم افتراضي', '10 منتجات كحد أقصى', 'صفحة هبوط واحدة بالذكاء الاصطناعي', 'بيكسل فيسبوك وتيك توك', 'تصدير الطلبات إلى Excel'],
    basicMissing: ['ثيمات مخصصة', 'روبوت محادثة', 'دومين مخصص', 'صفحات هبوط غير محدودة'],
    proFeatures: ['20 رصيد ذكاء اصطناعي/شهرياً', 'منتجات غير محدودة', '10 صفحات هبوط بالذكاء الاصطناعي/شهرياً', 'ثيم Beauty & Fashion مضمّن', 'بيكسل فيسبوك وتيك توك', 'تصدير الطلبات إلى Excel', 'حاسبة الربح'],
    proMissing: ['روبوت محادثة', 'دومين مخصص'],
    ultimateFeatures: ['100 رصيد ذكاء اصطناعي/شهرياً', 'منتجات غير محدودة', 'صفحات هبوط غير محدودة', 'جميع الثيمات الخمسة', 'روبوت محادثة (150 رسالة/يوم)', 'حاسبة الربح', 'تكاملات التوصيل', 'عضوان في الفريق'],
    ultimateMissing: ['دومين مخصص'],

    surMesureBadge: 'خطط مخصصة',
    surMesureTitle: 'للمضي قدماً',
    surMesureSubtitle: 'تكاملات متقدمة، متاجر متعددة، وكالات وعلامات كبرى',
    growthTagline: 'للتجار الراغبين في التوسع',
    businessTagline: 'للمتاجر الجادة',
    agencyTagline: 'للوكالات ومتاجر الدروبشيبينغ المتعددة',
    enterpriseTagline: 'بنية تحتية مخصصة وتطوير حسب الطلب',
    growthHighlights: ['كل مزايا Ultimate +', '200 رصيد ذكاء اصطناعي/شهرياً', 'روبوت محادثة 300 رسالة/يوم', 'دومين مخصص', 'عضوان في الفريق', 'إحصائيات مبيعات متقدمة', 'تقرير شهري تلقائي', 'دعم أولوية عبر البريد الإلكتروني'],
    businessHighlights: ['كل مزايا Growth +', '400 رصيد ذكاء اصطناعي/شهرياً', 'طباعة تلقائية لبطاقات التوصيل', 'اختبار A/B لصفحات الهبوط', 'إدارة العملاء وسجل الشراء', 'تأكيد تلقائي عبر SMS', '5 أعضاء في الفريق', '3 دومينات مخصصة'],
    agencyHighlights: ['كل مزايا Business +', '800 رصيد ذكاء اصطناعي/شهرياً', 'طباعة تلقائية لبطاقات التوصيل', 'رؤية الوكالة — إدارة كل المتاجر من لوحة واحدة', '5 متاجر في آن واحد', 'أعضاء غير محدودين', 'وصول إلى API', 'مدير حساب مخصص'],
    enterpriseHighlights: ['كل مزايا Agency +', '1 500 رصيد ذكاء اصطناعي/شهرياً (تُعرض كغير محدودة)', 'بنية تحتية مخصصة (غير مشتركة)', 'وايت ليبل كامل — شعارك على المنصة', 'متاجر غير محدودة', 'تطوير ميزات حسب الطلب', 'اتفاقية SLA بضمان 99.9%', 'خط واتساب مباشر (أولوية)'],
    choosePlan: 'اختيار',

    faqTitle: 'الأسئلة الشائعة',
    faqSubtitle: 'أسئلة أخرى؟ تواصل معنا عبر إنستغرام أو واتساب.',
    faq: [
      { q: 'هل تجعل الصور بالذكاء الاصطناعي منتجاتي تبدو وكأنها صُورت في استوديو؟', a: 'نعم. ارفع صورة بسيطة التقطتها بهاتفك، ويحوّلها الذكاء الاصطناعي إلى صورة بجودة استوديو — خلفية نظيفة، إضاءة احترافية، وتنسيق أنيق. مثالية لإعطاء منتجاتك مظهراً راقياً دون معدات تصوير.' },
      { q: 'كيف يعمل الدفع؟', a: 'تدفع عبر BaridiMob أو CIB أو Edahabia أو تحويل بنكي. بعد تأكيد الدفع من طرف فريقنا (عادة في أقل من ساعتين)، يتم تفعيل خطتك فوراً.' },
      { q: 'هل بياناتي آمنة؟', a: 'بالتأكيد. كل متجر معزول تماماً بفضل بنيتنا متعددة المستأجرين مع أمان على مستوى الصفوف (Row Level Security). بياناتك لا يمكن الوصول إليها أبداً من متجر آخر.' },
      { q: 'هل يمكنني ربط نطاقي الخاص؟', a: 'نعم، مع خطط Growth وما فوق يمكنك ربط اسم نطاقك الخاص (مثل: matjar.dz) بالإضافة إلى نطاق Krenix الفرعي المقدم افتراضياً.' },
      { q: 'هل يمكنني ربط Yalidine لإدارة توصيلاتي تلقائياً؟', a: 'نعم، مع خطط Ultimate وما فوق. اربط حساب Yalidine الخاص بك وأنشئ بطاقات الشحن مباشرة من Krenix، مع تتبع الطرود في الوقت الفعلي — دون الحاجة لإعادة إدخال طلباتك في مكان آخر.' },
      { q: 'هل يتحدث الروبوت بالدارجة؟', a: 'نعم! الروبوت (حصرياً لخطة Ultimate) مدعوم بـ Gemini AI ويرد بشكل طبيعي بالفرنسية والدارجة الجزائرية — مثل بائع حقيقي. كما يأخذ الطلبات تلقائياً.' },
      { q: 'كيف تعمل حاسبة الربح؟', a: 'تحسب حاسبة الربح (Ultimate وما فوق) هامشك الحقيقي تلقائياً لكل عملية بيع — سعر المنتج، تكلفة التوصيل، مصاريف إضافية — لتعرف بالضبط كم تربح في كل طلبية.' },
    ],

    ctaBannerTitle: 'جاهز لإطلاق', ctaBannerTitleItalic: 'متجرك؟',
    ctaBannerDesc: 'انضم إلى التجار الجزائريين الذين يبيعون بالفعل مع Krenix. الإعداد في 5 دقائق.',
    ctaBannerButton: 'أنشئ متجري الآن',
    ctaBannerNote: 'لا حاجة لبطاقة ائتمان',

    footerTagline: 'منصة التجارة الإلكترونية المصممة للجزائر.',
    footerProductTitle: 'المنتج', footerProductLinks: ['المميزات', 'الأسعار', 'عرض تجريبي', 'سجل التحديثات'],
    footerResourcesTitle: 'الموارد', footerResourcesLinks: ['التوثيق', 'الأسئلة الشائعة', 'متاجر نموذجية', 'المدونة'],
    footerCompanyTitle: 'الشركة', footerCompanyLinks: ['من نحن', 'اتصل بنا', 'الشروط', 'الخصوصية'],
    footerRights: (year: number) => `© ${year} Krenix — جميع الحقوق محفوظة.`,
  },
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function KrenixLanding() {
  const { t, locale } = useI18n()
  const home = HOME_CONTENT[locale]
  const videoEmbedUrl = toYoutubeEmbedUrl(EXPLAINER_VIDEO_URL)
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

  const navLinks: [string, string][] = [[t('home.navFeatures'), '#features'], [t('home.navVideo'), '#video'], [t('home.navPricing'), '#pricing'], [t('home.navFaq'), '#faq']]

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
            <div className="hidden sm:block">
              <LanguageSwitcher />
            </div>
            <Link href="/auth/login"
              className="hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 hover:scale-105 active:scale-95"
              style={{ border: `1px solid ${BORDER}`, color: INK, background: SURF }}>
              {t('home.navSignIn')}
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
                <div className="mt-2 flex justify-center">
                  <LanguageSwitcher />
                </div>
                <Link href="/auth/login" className="mt-2 py-2.5 text-center rounded-xl text-sm font-semibold" style={{ background: SAGE, color: '#fff' }}>{t('home.navSignIn')}</Link>
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
          <div className="text-center lg:text-left rtl:lg:text-right">
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold mb-7"
              style={{ background: SAGE_SOFT, border: `1px solid color-mix(in oklab, ${SAGE} 30%, transparent)`, color: SAGE_DK }}
            >
              <IconRocket size={11} /> {home.heroBadge}
            </motion.div>

            <h1 className="text-[3.2rem] sm:text-6xl xl:text-7xl leading-[1.02] mb-6 tracking-tight" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              {home.heroLines.map((line, i) => (
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
              {home.heroDesc}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.62 }}
              className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start rtl:lg:justify-end mb-8"
            >
              <Link href="/auth/register"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-semibold text-sm text-white transition-all hover:scale-[1.03] active:scale-95"
                style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})`, boxShadow: '0 10px 34px rgba(60,110,80,0.28)' }}>
                {home.ctaCreateStore} <ArrowRight size={15} className="rtl:rotate-180" />
              </Link>
              <a href="#features"
                className="flex items-center justify-center gap-2 px-7 py-4 rounded-2xl font-semibold text-sm transition-all"
                style={{ border: `1px solid ${BORDER}`, color: INK, background: SURF }}>
                {home.ctaSeeFeatures}
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}
              className="flex items-center gap-3 justify-center lg:justify-start rtl:lg:justify-end"
            >
              <div className="flex -space-x-2 rtl:space-x-reverse">
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
                <span className="text-xs" style={{ color: INK_SOFT }}>{home.socialProof}</span>
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
          <span className="text-[10px] uppercase tracking-widest">{home.discover}</span>
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
              <Layers size={11} /> {home.featuresBadge}
            </div>
            <h2 className="text-4xl lg:text-5xl mb-4" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              {home.featuresTitle}<br />
              <span style={{ color: INK_FAINT, fontStyle: 'italic' }}>{home.featuresTitleItalic}</span>
            </h2>
            <p className="text-base max-w-lg mx-auto leading-relaxed" style={{ color: INK_SOFT }}>
              {home.featuresDesc}
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            className="grid md:grid-cols-3 gap-5"
          >
            <FeatureCard
              icon={IconStore} delay={0}
              title={home.feature1Title}
              desc={home.feature1Desc}
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
              title={home.feature2Title}
              desc={home.feature2Desc}
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
                  <p className="text-[10px] font-semibold" style={{ color: SAGE_DK }}>{home.feature2Badge}</p>
                </div>
              }
            />
            <FeatureCard
              icon={IconChatbot} delay={2}
              title={home.feature3Title}
              desc={home.feature3Desc}
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
            { val: c1, suf: '+', label: home.statShops, sub: home.statShopsSub },
            { val: c2, suf: '+', label: home.statOrders, sub: home.statOrdersSub },
            { val: c3, suf: '%', label: home.statSatisfaction, sub: home.statSatisfactionSub },
          ].map(({ val, suf, label, sub }, i) => (
            <motion.div key={label} variants={fadeUp} custom={i} initial="hidden" whileInView="visible" viewport={{ once: true }} className="text-center">
              <p dir="ltr" className="mb-1.5" style={{
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
              <Clock size={11} /> {home.stepsBadge}
            </div>
            <h2 className="text-4xl lg:text-5xl" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              {home.stepsTitle}<br /><span style={{ color: INK_FAINT, fontStyle: 'italic' }}>{home.stepsTitleItalic}</span>
            </h2>
          </motion.div>

          <div className="relative grid md:grid-cols-3 gap-10">
            <motion.div
              className="hidden md:block absolute top-10 left-[calc(16.66%+24px)] right-[calc(16.66%+24px)] h-px origin-left"
              style={{ background: `linear-gradient(90deg, ${SAGE}, ${GOLD})` }}
              initial={{ scaleX: 0 }} whileInView={{ scaleX: 1 }} viewport={{ once: true }} transition={{ duration: 1, ease: EASE }} />

            {[
              { icon: IconRocket, title: home.step1Title, desc: home.step1Desc },
              { icon: IconPackage, title: home.step2Title, desc: home.step2Desc },
              { icon: IconAnalytics, title: home.step3Title, desc: home.step3Desc },
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

      {/* ── VIDEO EXPLANATION ──────────────────────────────────────────────── */}
      <section id="video" className="py-24 sm:py-28 px-5 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5"
              style={{ background: SAGE_SOFT, color: SAGE_DK }}>
              <PlayCircle size={11} /> {home.videoBadge}
            </div>
            <h2 className="text-4xl lg:text-5xl mb-4" style={{ fontFamily: HEADING, fontWeight: 500 }}>
              {home.videoTitle}<br />
              <span style={{ color: INK_FAINT, fontStyle: 'italic' }}>{home.videoTitleItalic}</span>
            </h2>
            <p className="text-base max-w-lg mx-auto leading-relaxed" style={{ color: INK_SOFT }}>
              {home.videoDesc}
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
            className="rounded-[26px] overflow-hidden aspect-video"
            style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 24px 60px rgba(30,40,55,0.10)' }}
          >
            {videoEmbedUrl ? (
              <iframe
                className="w-full h-full"
                src={videoEmbedUrl}
                title="Krenix"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: INK_FAINT }}>
                <PlayCircle size={40} />
                <p className="text-sm">{home.videoPlaceholder}</p>
              </div>
            )}
          </motion.div>
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────────────────────────────── */}
      <section id="pricing" className="py-24 sm:py-28 px-5 sm:px-6 relative">
        <div className="max-w-5xl mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-5" style={{ background: GOLD_SOFT, color: GOLD_DK }}>
              <CreditCard size={11} /> {home.pricingBadge}
            </div>
            <h2 className="text-4xl lg:text-5xl mb-3" style={{ fontFamily: HEADING, fontWeight: 500 }}>{home.pricingTitle}</h2>
            <p className="text-sm" style={{ color: INK_SOFT }}>{home.pricingSubtitle}</p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
            className="grid md:grid-cols-3 gap-5"
          >
            <PricingCard plan="Basic" price="15 000 DA" period={home.oneTime} cta={home.ctaStart} popularLabel={home.popular}
              features={home.basicFeatures} missing={home.basicMissing} />
            <PricingCard plan="Pro" price="3 000 DA" period={home.monthly} cta={home.ctaUpgradePro} popularLabel={home.popular}
              features={home.proFeatures} missing={home.proMissing} />
            <PricingCard plan="Ultimate" price="9 000 DA" period={home.monthly} highlight cta={home.ctaUpgradeUltimate} popularLabel={home.popular}
              features={home.ultimateFeatures} missing={home.ultimateMissing} />
          </motion.div>

          {/* ── Sur Mesure section ── */}
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mt-16">
            <div className="text-center mb-8">
              <span className="px-3 py-1.5 rounded-full text-xs font-bold" style={{ background: 'var(--color-dash-purple-soft)', color: 'var(--color-dash-purple)' }}>
                {home.surMesureBadge}
              </span>
              <h3 className="text-2xl mt-3" style={{ fontFamily: HEADING, fontWeight: 500, color: INK }}>{home.surMesureTitle}</h3>
              <p className="text-sm mt-1" style={{ color: INK_SOFT }}>
                {home.surMesureSubtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                { id: 'growth', name: 'Growth', price: '12 000', period: home.monthly, icon: Rocket, color: 'var(--color-dash-success)', tagline: home.growthTagline, highlights: home.growthHighlights },
                { id: 'business', name: 'Business', price: '20 000', period: home.monthly, icon: Building2, color: 'var(--color-dash-purple)', tagline: home.businessTagline, highlights: home.businessHighlights },
                { id: 'agency', name: 'Agency', price: '35 000', period: home.monthly, icon: Globe2, color: 'var(--color-dash-danger)', tagline: home.agencyTagline, highlights: home.agencyHighlights },
                { id: 'enterprise', name: 'Enterprise', price: '60 000', period: home.monthly, icon: Star, color: GOLD_DK, tagline: home.enterpriseTagline, highlights: home.enterpriseHighlights },
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
                      <div className="text-right flex-shrink-0" dir="ltr">
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
                      {home.choosePlan} {plan.name}
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
            <h2 className="text-4xl mb-3" style={{ fontFamily: HEADING, fontWeight: 500 }}>{home.faqTitle}</h2>
            <p className="text-sm" style={{ color: INK_SOFT }}>{home.faqSubtitle}</p>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={{ visible: { transition: { staggerChildren: 0.07 } } }}>
            {home.faq.map((item, i) => <FAQItem key={i} q={item.q} a={item.a} i={i} />)}
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
                {home.ctaBannerTitle}<br /><span style={{ fontStyle: 'italic', color: SAGE_DK }}>{home.ctaBannerTitleItalic}</span>
              </h2>
              <p className="text-base mb-8 max-w-md mx-auto" style={{ color: INK_SOFT }}>
                {home.ctaBannerDesc}
              </p>
              <Link href="/auth/register"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-bold text-white text-sm transition-all hover:scale-[1.04] active:scale-95"
                style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})`, boxShadow: '0 10px 40px rgba(60,110,80,0.32)' }}>
                {home.ctaBannerButton} <ArrowRight size={15} className="rtl:rotate-180" />
              </Link>
              <p className="text-xs mt-4" style={{ color: INK_FAINT }}>{home.ctaBannerNote}</p>
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
              <p className="text-sm leading-relaxed" style={{ color: INK_SOFT }}>{home.footerTagline}</p>
            </div>

            {[
              { title: home.footerProductTitle, links: home.footerProductLinks.map(label => ({ label, href: '#' })) },
              { title: home.footerResourcesTitle, links: home.footerResourcesLinks.map(label => ({ label, href: '#' })) },
              { title: home.footerCompanyTitle, links: home.footerCompanyLinks.map((label, i) => ({ label, href: ['#', 'mailto:contact@krenix.store', '/terms', '/privacy'][i] ?? '#' })) },
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
            <p className="text-xs" style={{ color: INK_FAINT }}>{home.footerRights(new Date().getFullYear())}</p>
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
