'use client'

import { motion, useInView, useScroll, useTransform, AnimatePresence } from 'framer-motion'
import { useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight, Check, ChevronRight, Menu, X, MapPin,
} from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import LanguageSwitcher from '@/components/dashboard/ui/LanguageSwitcher'
import { V2_COPY, type V2Locale } from './v2/copy'
import {
  IconCommission, IconSpark, IconChat, IconVariants, IconDelivery, IconAnalytics,
  IconShield, IconCoupon, IconMobile, IconScan, IconFilter, IconPublish, IconBell,
  ShieldDefenseScene,
} from './v2/icons'

// ─── Krenix's own Éclat tokens. Floating pill nav, glowing hero + dashboard
// preview, alternating feature showcases, big rounded closing CTA. Syne
// carries the headlines (swapped to Noto Kufi Arabic for locale=ar via the
// --v2-display CSS variable below, since Syne has no Arabic glyphs). ──────
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
const DISPLAY = 'var(--v2-display)'
const SANS = 'var(--font-dash-sans)'  // Manrope (auto-swaps to IBM Plex Sans Arabic for locale=ar)

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

function useCounter(target: number, duration = 1800, active = false, liveWobble = false) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (!active) return
    const steps = 50
    let frame = 0
    let t = 0
    let wobbleTimer: ReturnType<typeof setInterval> | undefined
    const timer = setInterval(() => {
      frame++
      setValue(Math.min(target, Math.floor((target / steps) * frame)))
      if (frame >= steps) {
        clearInterval(timer)
        // Once the count-up lands, keep the number gently "live" for a bit
        // instead of freezing immediately — but only briefly: a re-render
        // every 260ms for the entire time the page stays open is real,
        // needless CPU cost on top of everything else already animating.
        if (liveWobble) {
          let ticks = 0
          wobbleTimer = setInterval(() => {
            t += 0.2
            setValue(Math.round(target + Math.sin(t) * 2.2))
            if (++ticks >= 30) {
              clearInterval(wobbleTimer)
              setValue(target)
            }
          }, 260)
        }
      }
    }, duration / steps)
    return () => { clearInterval(timer); if (wobbleTimer) clearInterval(wobbleTimer) }
  }, [active, target, duration, liveWobble])
  return value
}

// Grows in once, then breathes gently forever — a static bar chart is the
// tell that a dashboard mockup is frozen rather than actually "live".
function RevenueBar({ h, delay, color }: { h: number; delay: number; color: string }) {
  const [settled, setSettled] = useState(false)
  return (
    <motion.div
      className="flex-1 rounded-t-md"
      style={{ background: color }}
      initial={{ height: 0 }}
      animate={settled
        ? { height: [`${h}%`, `${Math.max(8, h * 0.88)}%`, `${Math.min(100, h * 1.1)}%`, `${h}%`] }
        : { height: `${h}%` }}
      transition={settled
        ? { duration: 3.2, repeat: Infinity, ease: EASE }
        : { duration: 0.6, delay, ease: EASE }}
      onAnimationComplete={() => setSettled(true)}
    />
  )
}

const WILAYA_NAMES: Record<V2Locale, [string, string, string]> = {
  fr: ['Alger', 'Oran', 'Constantine'],
  ar: ['الجزائر', 'وهران', 'قسنطينة'],
}

// ─── "Control tower" dashboard mockup — stat ring, revenue trend, wilaya
// leaderboard, built from Krenix's own real data model. ────────────────────
function ControlTowerMockup({ locale, copy }: { locale: V2Locale; copy: typeof V2_COPY['fr']['mockup'] }) {
  const pct = useCounter(89, 1600, true, true)
  const bars = [38, 52, 44, 61, 58, 70, 66]
  const names = WILAYA_NAMES[locale]
  const wilayas = [
    { name: names[0], orders: 187, rate: 91 },
    { name: names[1], orders: 142, rate: 84 },
    { name: names[2], orders: 98, rate: 88 },
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
          <span className="ml-3 text-[10px] font-mono" dir="ltr" style={{ color: INK_FAINT }}>{copy.domain}</span>
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
                <span className="font-black text-lg" dir="ltr" style={{ color: INK }}>{pct}%</span>
              </div>
            </div>
            <p className="text-[10px] mt-2 font-semibold" style={{ color: INK_SOFT }}>{copy.confirmation}</p>
          </div>

          {/* Revenue bars */}
          <div className="col-span-1 rounded-2xl p-4" style={{ background: SURF2 }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: INK_FAINT }}>{copy.revenue}</p>
            <div className="flex items-end gap-1.5 h-14">
              {bars.map((h, i) => (
                <RevenueBar key={i} h={h} delay={0.3 + i * 0.06} color={i === bars.length - 1 ? GOLD : SAGE_SOFT} />
              ))}
            </div>
          </div>

          {/* Wilaya leaderboard */}
          <div className="col-span-2 rounded-2xl p-4" style={{ background: SURF2 }}>
            <div className="flex items-center gap-1.5 mb-2.5">
              <MapPin size={11} style={{ color: GOLD_DK }} />
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: INK_FAINT }}>{copy.wilayas}</p>
            </div>
            <div className="space-y-1.5">
              {wilayas.map((w, i) => (
                <div key={w.name} className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0" dir="ltr"
                    style={{ background: i === 0 ? GOLD_SOFT : SURF, color: i === 0 ? GOLD_DK : INK_FAINT }}>{i + 1}</span>
                  <span className="text-[11px] font-semibold flex-1" style={{ color: INK }}>{w.name}</span>
                  <span className="text-[10px]" dir="ltr" style={{ color: INK_SOFT }}>{w.orders} {copy.cmd}</span>
                  <span className="text-[10px] font-bold" dir="ltr" style={{ color: SAGE }}>{w.rate}%</span>
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
        className="absolute -left-6 top-10 rounded-2xl px-4 py-3 flex items-center gap-2.5 rtl:left-auto rtl:right-6"
        style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 20px 40px rgba(30,40,55,0.15)' }}
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: SAGE_SOFT }}>
          <IconCommission size={16} style={{ color: SAGE_DK }} />
        </div>
        <div>
          <p className="text-sm font-black" style={{ color: INK }}>{copy.chipTitle}</p>
          <p className="text-[10px]" style={{ color: INK_FAINT }}>{copy.chipDesc}</p>
        </div>
      </motion.div>
    </div>
  )
}

// ─── A soft colour bridge between two stacked sections ─────────────────────
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
    <div ref={ref} className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
      <motion.div
        variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'}
        className={reverse ? 'lg:order-2' : 'lg:order-1'}
      >
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full mb-5" style={{ background: accentSoft }}>
          <EyebrowIcon size={13} style={{ color: accentDark }} />
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: accentDark, fontFamily: SANS }}>{eyebrow}</span>
          {tierBadge && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: accentDark }}>{tierBadge}</span>
          )}
        </div>
        <h3 style={{ fontFamily: DISPLAY, fontSize: 'clamp(28px,3.4vw,42px)', fontWeight: 800, color: INK, lineHeight: 1.15, letterSpacing: '-0.01em' }}>
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
        className={reverse ? 'lg:order-1' : 'lg:order-2'}
        variants={fadeUp} initial="hidden" animate={inView ? 'visible' : 'hidden'} custom={1}
      >
        {visual}
      </motion.div>
    </div>
  )
}

// ─── Realistic iPhone frame with a continuously auto-scrolling mini dashboard
// feed inside — sells "your whole store in your pocket" far better than a
// static notification list. Side buttons + dynamic island for authenticity;
// the inner feed loops scroll → pause → scroll back, forever. ─────────────
function PhoneScrollMockup({ copy }: { copy: typeof V2_COPY['fr']['showcaseMobile'] }) {
  const screenH = 300
  const rows = [
    { label: copy.notif1, color: SAGE },
    { label: copy.notif2, color: GOLD },
    { label: copy.notif3, color: SAGE },
    { label: copy.notif1, color: GOLD },
    { label: copy.notif3, color: SAGE },
    { label: copy.notif2, color: GOLD },
  ]
  const scrollDist = 150

  return (
    <div className="flex justify-center">
      <div className="relative" style={{ width: 232 }}>
        {/* Side buttons */}
        <span className="absolute -left-[2px] top-[92px] w-[2px] h-6 rounded-l" style={{ background: '#000' }} />
        <span className="absolute -left-[2px] top-[124px] w-[2px] h-10 rounded-l" style={{ background: '#000' }} />
        <span className="absolute -left-[2px] top-[168px] w-[2px] h-10 rounded-l" style={{ background: '#000' }} />
        <span className="absolute -right-[2px] top-[130px] w-[2px] h-14 rounded-r" style={{ background: '#000' }} />

        <div className="relative rounded-[52px] p-[10px]" style={{ background: INK, boxShadow: '0 40px 80px rgba(30,40,55,0.28)' }}>
          <div className="relative rounded-[42px] overflow-hidden" style={{ background: SURF, height: screenH }}>
            {/* Dynamic island */}
            <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-[74px] h-[22px] rounded-full z-20" style={{ background: '#000' }} />

            {/* Status bar */}
            <div className="absolute top-0 left-0 right-0 h-9 flex items-end justify-between px-6 pb-1 z-10 text-[10px] font-bold" dir="ltr" style={{ color: INK }}>
              <span>9:41</span>
              <span>●●●</span>
            </div>

            {/* Scrolling feed */}
            <div className="absolute inset-0 pt-10 overflow-hidden">
              <motion.div
                className="px-3.5 space-y-2.5"
                animate={{ y: [0, 0, -scrollDist, -scrollDist, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: EASE, times: [0, 0.12, 0.5, 0.82, 1] }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Phoenix size={16} />
                  <span className="text-[11px] font-black" style={{ color: INK }}>KRENIX</span>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-1">
                  <div className="rounded-xl p-2.5" style={{ background: SURF2 }}>
                    <p className="text-sm font-black" dir="ltr" style={{ color: INK }}>89%</p>
                    <p className="text-[8px]" style={{ color: INK_FAINT }}>Confirmation</p>
                  </div>
                  <div className="rounded-xl p-2.5" style={{ background: SURF2 }}>
                    <p className="text-sm font-black" dir="ltr" style={{ color: SAGE_DK }}>+12%</p>
                    <p className="text-[8px]" style={{ color: INK_FAINT }}>Ventes · 7j</p>
                  </div>
                </div>

                {rows.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl px-2.5 py-2" style={{ background: SURF2 }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: n.color }} />
                    <span className="text-[10px] font-semibold" style={{ color: INK }}>{n.label}</span>
                  </div>
                ))}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Live price-drop demo — shows the actual mechanic a discount code
// performs: the original price gets struck through, then the discounted
// price pops in with the -25% badge. Loops forever so it reads as "watch
// the code apply itself" rather than a static number pair. ────────────────
function PriceDropDemo() {
  return (
    <div className="rounded-xl px-4 py-4 mb-3 flex items-center justify-center gap-3" style={{ background: SURF2 }} dir="ltr">
      <span className="relative text-base font-bold" style={{ color: INK_FAINT }}>
        2 500 DA
        <motion.span
          className="absolute left-0 right-0 top-1/2 h-[1.5px]"
          style={{ background: 'var(--color-dash-danger)', transformOrigin: 'left' }}
          animate={{ scaleX: [0, 0, 1, 1, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.28, 0.5, 0.82, 1], ease: 'easeInOut' }}
        />
      </span>
      <motion.div
        className="flex items-center gap-2"
        animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.7, 0.7, 1, 1, 0.85] }}
        transition={{ duration: 3.6, repeat: Infinity, times: [0, 0.5, 0.58, 0.85, 1], ease: EASE }}
      >
        <span className="text-lg font-black" style={{ color: SAGE_DK }}>1 875 DA</span>
        <span className="text-[10px] font-black px-2 py-0.5 rounded-full text-white" style={{ background: GOLD }}>-25%</span>
      </motion.div>
    </div>
  )
}

// ─── Contact section — plain controlled inputs + onClick submit (no <form>
// tag, per project convention), posts to /api/contact which forwards the
// lead to Krenix's inbox via the existing Resend helper. ───────────────────
function ContactSection({ copy }: { copy: typeof V2_COPY['fr']['contact'] }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  const submit = async () => {
    if (!name.trim() || !email.trim() || status === 'sending') return
    setStatus('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      })
      if (!res.ok) throw new Error('failed')
      setStatus('sent')
      setName(''); setEmail('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <section id="contact" className="py-20 px-4" style={{ background: SURF2 }}>
      <div className="max-w-3xl mx-auto text-center">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }}>
          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: SAGE_DK }}>{copy.eyebrow}</p>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(28px,3.6vw,42px)', color: INK, marginTop: 10, letterSpacing: '-0.01em' }}>
            {copy.title}
          </h2>
          <p className="mt-4 max-w-md mx-auto" style={{ color: INK_SOFT }}>{copy.desc}</p>
        </motion.div>

        <motion.div custom={1} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
          className="mt-8 rounded-[24px] p-6 sm:p-8 max-w-md mx-auto text-start" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
          {status === 'sent' ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--color-dash-success-soft)' }}>
                <Check size={20} style={{ color: 'var(--color-dash-success)' }} />
              </div>
              <p className="text-sm font-semibold" style={{ color: INK }}>{copy.success}</p>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: INK_FAINT }}>{copy.nameLabel}</label>
                <input
                  value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder={copy.namePlaceholder}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: SURF2, border: `1px solid ${BORDER}`, color: INK }}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-1.5" style={{ color: INK_FAINT }}>{copy.emailLabel}</label>
                <input
                  type="email" dir="ltr" value={email} onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submit()}
                  placeholder={copy.emailPlaceholder}
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none"
                  style={{ background: SURF2, border: `1px solid ${BORDER}`, color: INK }}
                />
              </div>
              {status === 'error' && <p className="text-xs" style={{ color: 'var(--color-dash-danger)' }}>{copy.error}</p>}
              <button
                onClick={submit} disabled={status === 'sending'}
                className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: SAGE }}
              >
                {status === 'sending' ? copy.sending : copy.submit}
              </button>
              <p className="text-xs text-center" style={{ color: INK_FAINT }}>
                {copy.directEmail} <a href="mailto:contact@krenix.store" dir="ltr" className="font-semibold" style={{ color: SAGE_DK }}>contact@krenix.store</a>
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}

// ─── FAQ accordion — plain state-driven expand/collapse, one open at a time. ─
function FaqSection({ copy }: { copy: typeof V2_COPY['fr']['faq'] }) {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section id="faq" className="py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-12">
          <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: SAGE_DK }}>{copy.eyebrow}</p>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(28px,3.6vw,42px)', color: INK, marginTop: 10, letterSpacing: '-0.01em' }}>
            {copy.title}
          </h2>
        </motion.div>

        <div className="space-y-3">
          {copy.items.map((item, i) => {
            const isOpen = open === i
            return (
              <motion.div key={item.q} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
                className="rounded-2xl overflow-hidden" style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-start"
                >
                  <span className="text-sm font-bold" style={{ color: INK }}>{item.q}</span>
                  <motion.span
                    animate={{ rotate: isOpen ? 45 : 0 }} transition={{ duration: 0.25, ease: EASE }}
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-lg font-bold"
                    style={{ background: SAGE_SOFT, color: SAGE_DK }}
                  >+</motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE }} style={{ overflow: 'hidden' }}
                    >
                      <p className="px-5 pb-4 text-sm leading-relaxed" style={{ color: INK_SOFT }}>{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── AI landing-page generation demo — steps check themselves off one by one
// (real timer-driven state, not a fake CSS loop) while a shimmering skeleton
// preview underneath sells "an actual page is being assembled right now".
// Loops forever so a visitor lingering on the section keeps seeing motion. ─
function AIGenerationDemo({ copy }: { copy: typeof V2_COPY['fr']['showcaseAI'] }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % 4), 1000)
    return () => clearInterval(t)
  }, [])
  const done = Math.min(step, 3)
  return (
    <VisualCard>
      <div className="flex items-center gap-2 mb-5">
        <motion.div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: SAGE_SOFT }}
          animate={{ rotate: 360 }} transition={{ duration: 2.4, repeat: Infinity, ease: 'linear' }}>
          <IconSpark size={16} style={{ color: SAGE_DK }} />
        </motion.div>
        <p className="text-sm font-bold" style={{ color: INK }}>{copy.genTitle}</p>
      </div>
      {copy.steps.map((s, i) => {
        const isDone = i < done
        return (
          <div key={s} className="flex items-center gap-3 py-1.5">
            <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-colors duration-500"
              style={{ background: isDone ? SAGE : SAGE_SOFT }}>
              {isDone && <Check size={11} className="text-white" />}
            </div>
            <span className="text-sm transition-colors duration-500" style={{ color: isDone ? INK : INK_FAINT }}>{s}</span>
          </div>
        )
      })}
      <div className="h-2 rounded-full mt-3 overflow-hidden" style={{ background: SURF2 }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${(done / 3) * 100}%`, background: SAGE }} />
      </div>

      {/* Skeleton landing-page preview — an actual page taking shape */}
      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="rounded-lg relative overflow-hidden" style={{ height: 64, background: SURF2 }}>
          <div className="absolute inset-0 v2-shimmer" />
        </div>
        <div className="space-y-1.5 mt-2.5">
          <div className="h-2 rounded-full relative overflow-hidden" style={{ width: '75%', background: SURF2 }}><div className="absolute inset-0 v2-shimmer" /></div>
          <div className="h-2 rounded-full relative overflow-hidden" style={{ width: '48%', background: SURF2 }}><div className="absolute inset-0 v2-shimmer" /></div>
        </div>
      </div>
    </VisualCard>
  )
}

// ─── Simple bordered visual card used inside showcases ────────────────────
function VisualCard({ children, accent = SAGE_SOFT }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className="relative rounded-[28px] p-8 overflow-hidden" style={{ background: SURF, border: `1px solid ${BORDER}`, boxShadow: '0 30px 70px rgba(30,40,55,0.10)' }}>
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full blur-3xl opacity-60 pointer-events-none rtl:right-auto rtl:-left-16" style={{ background: accent }} />
      <div className="relative">{children}</div>
    </div>
  )
}

export default function Home() {
  const { locale, dir } = useI18n()
  const L = (locale === 'ar' ? 'ar' : 'fr') as V2Locale
  const copy = V2_COPY[L]

  const [menuOpen, setMenuOpen] = useState(false)
  const heroRef = useRef(null)
  const { scrollYProgress: heroScroll } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroFade = useTransform(heroScroll, [0, 0.7], [1, 0])
  const heroY = useTransform(heroScroll, [0, 1], [0, 100])
  const statsRef = useRef(null)
  const statsInView = useInView(statsRef, { once: true, margin: '-100px' })
  const c1 = useCounter(500, 1800, statsInView)

  const navLinks: [string, string][] = [[copy.nav.features, '#fonctionnalites'], [copy.nav.pricing, '#tarifs'], [copy.nav.faq, '#faq']]

  return (
    <div dir={dir} style={{
      background: PAGE, color: INK, fontFamily: SANS, overflowX: 'hidden',
      '--v2-display': L === 'ar' ? 'var(--font-dash-heading-ar)' : 'var(--font-heading)',
    } as React.CSSProperties}>
      <style>{`
        @keyframes v2drift1 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(50px,-40px) scale(1.12) } }
        @keyframes v2drift2 { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-60px,35px) scale(1.08) } }
        @keyframes v2shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(100%) } }
        .v2-shimmer { background: linear-gradient(90deg, transparent, rgba(255,255,255,0.7), transparent); animation: v2shimmer 1.7s ease-in-out infinite; }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── Floating pill navbar ─────────────────────────────────────── */}
      <div className="fixed top-4 left-0 right-0 z-50 px-4">
        <motion.nav
          initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, ease: EASE }}
          className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-4 sm:px-5 py-2.5 rounded-full transition-all duration-300"
          style={{
            background: `${SURF}CC`,
            border: `1px solid ${BORDER}`,
            backdropFilter: 'blur(16px)',
          }}
        >
          <Link href="/" className="flex items-center gap-2">
            <Phoenix size={26} />
            <span style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 800, color: INK, letterSpacing: '0.02em' }}>KRENIX</span>
          </Link>
          <div className="hidden md:flex items-center gap-7">
            {navLinks.map(([label, href]) => (
              <a key={label} href={href} className="text-sm font-semibold transition-colors hover:opacity-70" style={{ color: INK_SOFT }}>{label}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/auth/login" className="px-4 py-2 rounded-full text-sm font-bold transition-colors hover:opacity-70" style={{ color: INK }}>
              {copy.nav.signIn}
            </Link>
            <Link href="/onboarding/step-1" className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-bold text-white transition-transform hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})` }}>
              {copy.nav.cta} <ArrowRight size={14} className="rtl:rotate-180" />
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
              {navLinks.map(([label, href]) => (
                <a key={label} href={href} onClick={() => setMenuOpen(false)} className="block py-2.5 text-sm font-semibold" style={{ color: INK }}>{label}</a>
              ))}
              <div className="py-2.5"><LanguageSwitcher /></div>
              <div className="flex gap-2 mt-2">
                <Link href="/auth/login" className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold" style={{ border: `1px solid ${BORDER}`, color: INK }}>{copy.nav.signIn}</Link>
                <Link href="/onboarding/step-1" className="flex-1 text-center py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: SAGE }}>{copy.nav.cta}</Link>
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
            <span className="text-xs font-bold" style={{ color: INK_SOFT }}>{copy.hero.badge}</span>
          </motion.div>

          <motion.h1 variants={fadeUp} initial="hidden" animate="visible" custom={1}
            style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(40px,7.5vw,84px)', lineHeight: 1.05, letterSpacing: '-0.02em', color: INK }}>
            {copy.hero.title1}
            <br />
            <span style={{ color: SAGE }}>{copy.hero.title2}</span>
          </motion.h1>

          <motion.p variants={fadeUp} initial="hidden" animate="visible" custom={2}
            className="mt-6 text-lg max-w-xl mx-auto leading-relaxed" style={{ color: INK_SOFT }}>
            {copy.hero.desc}
          </motion.p>

          <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={3}
            className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/onboarding/step-1"
              className="flex items-center gap-2 px-7 py-4 rounded-full font-bold text-[15px] text-white transition-transform hover:scale-[1.03]"
              style={{ background: `linear-gradient(135deg, ${SAGE}, ${SAGE_DK})`, boxShadow: `0 16px 40px ${SAGE}55` }}>
              {copy.hero.ctaPrimary} <ArrowRight size={17} className="rtl:rotate-180" />
            </Link>
            <a href="#tarifs"
              className="flex items-center gap-2 px-7 py-4 rounded-full font-bold text-[15px] transition-colors hover:opacity-70"
              style={{ color: INK, border: `1px solid ${BORDER}` }}>
              {copy.hero.ctaSecondary}
            </a>
          </motion.div>

          <motion.div ref={statsRef} variants={fadeUp} initial="hidden" animate="visible" custom={4}
            className="mt-10 flex items-center justify-center gap-6 flex-wrap text-sm">
            <span className="flex items-center gap-1.5 font-bold" style={{ color: SAGE_DK }}>
              <IconCommission size={15} /> {copy.hero.statCommission}
            </span>
            <span className="w-px h-4" style={{ background: BORDER }} />
            <span style={{ color: INK_SOFT }}>
              <strong dir="ltr" style={{ color: INK }}>+{c1}</strong> {copy.hero.statStores}
            </span>
          </motion.div>
        </motion.div>

        <motion.div variants={fadeUp} initial="hidden" animate="visible" custom={5} className="relative mt-16">
          <ControlTowerMockup locale={L} copy={copy.mockup} />
        </motion.div>
      </section>

      <SectionBridge from={PAGE} to={SURF2} />

      {/* ── Feature grid ─────────────────────────────────────────────── */}
      <section id="fonctionnalites" className="py-20 px-4" style={{ background: SURF2 }}>
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: SAGE_DK }}>{copy.features.eyebrow}</p>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(30px,4vw,48px)', color: INK, marginTop: 10, letterSpacing: '-0.01em' }}>
              {copy.features.title}
            </h2>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { icon: IconCommission, accent: SAGE, soft: SAGE_SOFT, dark: SAGE_DK },
              { icon: IconSpark, accent: GOLD_DK, soft: GOLD_SOFT, dark: GOLD_DK },
              { icon: IconChat, accent: SAGE, soft: SAGE_SOFT, dark: SAGE_DK },
              { icon: IconVariants, accent: GOLD_DK, soft: GOLD_SOFT, dark: GOLD_DK },
              { icon: IconDelivery, accent: SAGE, soft: SAGE_SOFT, dark: SAGE_DK },
              { icon: IconAnalytics, accent: GOLD_DK, soft: GOLD_SOFT, dark: GOLD_DK },
            ].map((f, i) => (
              <motion.div key={i} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
                className="rounded-[22px] p-6 transition-transform hover:-translate-y-1"
                style={{ background: SURF, border: `1px solid ${BORDER}` }}>
                <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ background: f.soft }}>
                  <f.icon size={19} style={{ color: f.dark }} />
                </div>
                <p className="font-black text-[15px]" style={{ color: INK }}>{copy.features.items[i].title}</p>
                <p className="text-sm mt-1.5 leading-relaxed" style={{ color: INK_FAINT }}>{copy.features.items[i].desc}</p>
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
            eyebrow={copy.showcaseAI.eyebrow} eyebrowIcon={IconSpark}
            title={copy.showcaseAI.title}
            description={copy.showcaseAI.desc}
            bullets={[
              { icon: IconSpark, label: copy.showcaseAI.bullets[0].label, desc: copy.showcaseAI.bullets[0].desc },
              { icon: IconPublish, label: copy.showcaseAI.bullets[1].label, desc: copy.showcaseAI.bullets[1].desc },
            ]}
            visual={<AIGenerationDemo copy={copy.showcaseAI} />}
          />
        </div>
      </section>

      {/* ── Showcase: Krenix Shield (fake-order filtering) — Ultimate+ ── */}
      <section className="py-20 px-4" style={{ background: SURF2 }}>
        <div className="max-w-5xl mx-auto">
          <Showcase
            reverse
            eyebrow={copy.showcaseShield.eyebrow} eyebrowIcon={IconShield}
            tierBadge={copy.showcaseShield.tier}
            title={copy.showcaseShield.title}
            description={copy.showcaseShield.desc}
            bullets={[
              { icon: IconScan, label: copy.showcaseShield.bullets[0].label, desc: copy.showcaseShield.bullets[0].desc },
              { icon: IconFilter, label: copy.showcaseShield.bullets[1].label, desc: copy.showcaseShield.bullets[1].desc },
            ]}
            accentSoft={GOLD_SOFT} accentDark={GOLD_DK}
            visual={
              <VisualCard accent={GOLD_SOFT}>
                <div className="flex items-center justify-center py-2">
                  <ShieldDefenseScene size={230} />
                </div>
                <div className="space-y-2 mt-2">
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: SURF2 }}>
                    <span className="text-xs font-semibold" style={{ color: INK }}>{copy.showcaseShield.order1}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-dash-success-soft)', color: 'var(--color-dash-success)' }}>{copy.showcaseShield.statusReliable}</span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: SURF2 }}>
                    <span className="text-xs font-semibold" style={{ color: INK }}>{copy.showcaseShield.order2}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'var(--color-dash-danger-soft)', color: 'var(--color-dash-danger)' }}>{copy.showcaseShield.statusCheck}</span>
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
            eyebrow={copy.showcaseCoupon.eyebrow} eyebrowIcon={IconCoupon}
            title={copy.showcaseCoupon.title}
            description={copy.showcaseCoupon.desc}
            bullets={[
              { icon: IconCoupon, label: copy.showcaseCoupon.bullets[0].label, desc: copy.showcaseCoupon.bullets[0].desc },
              { icon: IconAnalytics, label: copy.showcaseCoupon.bullets[1].label, desc: copy.showcaseCoupon.bullets[1].desc },
            ]}
            visual={
              <VisualCard>
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: SAGE_SOFT }}>
                    <IconCoupon size={16} style={{ color: SAGE_DK }} />
                  </div>
                  <p className="text-sm font-bold" style={{ color: INK }}>{copy.showcaseCoupon.newCode}</p>
                </div>
                <PriceDropDemo />
                <div className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between" style={{ background: SURF2, border: `1px dashed ${SAGE}` }}>
                  <span className="font-mono font-bold text-sm" dir="ltr" style={{ color: SAGE_DK }}>{copy.showcaseCoupon.code}</span>
                  <span className="text-xs font-black" dir="ltr" style={{ color: INK }}>-25%</span>
                </div>
                <div className="flex items-center justify-between text-xs py-1.5" style={{ color: INK_SOFT }}>
                  <span>{copy.showcaseCoupon.usesLabel}</span><span className="font-bold" dir="ltr" style={{ color: INK }}>142 / 500</span>
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
            eyebrow={copy.showcaseMobile.eyebrow} eyebrowIcon={IconMobile}
            title={copy.showcaseMobile.title}
            description={copy.showcaseMobile.desc}
            bullets={[
              { icon: IconMobile, label: copy.showcaseMobile.bullets[0].label, desc: copy.showcaseMobile.bullets[0].desc },
              { icon: IconBell, label: copy.showcaseMobile.bullets[1].label, desc: copy.showcaseMobile.bullets[1].desc },
            ]}
            visual={<PhoneScrollMockup copy={copy.showcaseMobile} />}
          />
        </div>
      </section>

      <SectionBridge from={SURF2} to={PAGE} />

      {/* ── Pricing ───────────────────────────────────────────────────── */}
      <section id="tarifs" className="py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: SAGE_DK }}>{copy.pricing.eyebrow}</p>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 'clamp(30px,4vw,48px)', color: INK, marginTop: 10, letterSpacing: '-0.01em' }}>
              {copy.pricing.title}
            </h2>
            <p className="mt-4 max-w-lg mx-auto" style={{ color: INK_SOFT }}>{copy.pricing.desc}</p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-5">
            {copy.pricing.plans.map((plan, i) => {
              const highlighted = i === 2
              return (
                <motion.div key={plan.name} custom={i} variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }}
                  className="relative rounded-[26px] p-7 flex flex-col"
                  style={{
                    background: highlighted ? INK : SURF,
                    border: `1px solid ${highlighted ? INK : BORDER}`,
                    boxShadow: highlighted ? '0 30px 70px rgba(30,40,55,0.25)' : 'none',
                  }}>
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-black px-3 py-1 rounded-full text-white whitespace-nowrap" style={{ background: GOLD }}>
                      {copy.pricing.recommended}
                    </span>
                  )}
                  <p className="text-sm font-bold" style={{ color: highlighted ? 'rgba(255,255,255,0.7)' : INK_SOFT }}>{plan.name}</p>
                  <div className="mt-2 flex items-baseline gap-1.5" dir="ltr">
                    <span className="text-3xl font-black" style={{ color: highlighted ? '#fff' : INK }}>{plan.price}</span>
                    <span className="text-xs" style={{ color: highlighted ? 'rgba(255,255,255,0.5)' : INK_FAINT }}>DZD</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: highlighted ? 'rgba(255,255,255,0.5)' : INK_FAINT }}>
                    {i === 0 ? copy.pricing.once : copy.pricing.perMonth}
                  </p>
                  <div className="mt-5 space-y-2.5 flex-1">
                    {plan.features.map(f => (
                      <div key={f} className="flex items-start gap-2">
                        <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: highlighted ? GOLD : SAGE_DK }} />
                        <span className="text-sm" style={{ color: highlighted ? 'rgba(255,255,255,0.85)' : INK_SOFT }}>{f}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/onboarding/step-1" className="mt-6 text-center py-3 rounded-xl font-bold text-sm transition-transform hover:scale-[1.02]"
                    style={{ background: highlighted ? GOLD : SAGE_SOFT, color: highlighted ? INK : SAGE_DK }}>
                    {plan.cta}
                  </Link>
                </motion.div>
              )
            })}
          </div>

          <div className="text-center mt-8">
            <Link href="/pricing" className="text-sm font-semibold hover:opacity-70 transition-opacity" style={{ color: SAGE_DK }}>
              {copy.pricing.seeAll} {L === 'ar' ? '←' : '→'}
            </Link>
          </div>
        </div>
      </section>

      <SectionBridge from={PAGE} to={SURF2} />

      <ContactSection copy={copy.contact} />

      <SectionBridge from={SURF2} to={PAGE} />

      <FaqSection copy={copy.faq} />

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
              {copy.finalCta.title}
            </h2>
            <p className="mt-3 max-w-md mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
              {copy.finalCta.desc}
            </p>
            <Link href="/onboarding/step-1"
              className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-full font-bold text-[15px] transition-transform hover:scale-[1.03]"
              style={{ background: SAGE, color: '#fff', boxShadow: `0 16px 40px ${SAGE}66` }}>
              {copy.finalCta.button} <ChevronRight size={17} className="rtl:rotate-180" />
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
          <p className="text-xs" style={{ color: INK_FAINT }}>{copy.footer.copyright.replace('{year}', String(new Date().getFullYear()))}</p>
          <div className="flex items-center gap-4 text-xs" style={{ color: INK_SOFT }}>
            <Link href="/terms" className="hover:opacity-70 transition-opacity">{copy.footer.terms}</Link>
            <Link href="/privacy" className="hover:opacity-70 transition-opacity">{copy.footer.privacy}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
