'use client'

import { motion } from 'framer-motion'

// ─── Custom monoline icon set for the /v2 homepage ─────────────────────────
// Deliberately NOT lucide-in-a-pastel-circle (the pattern every AI-generated
// SaaS landing page reaches for). Each glyph is hand-drawn for what it
// represents in Krenix specifically — a coin stack for 0% commission, a
// palette fan for variant stock, a route+pin for delivery — at a consistent
// 1.6 stroke weight so the set reads as one designed family, not a grab-bag.
// All accept size/className/style so callers can theme via currentColor.

type IconProps = { size?: number; className?: string; style?: React.CSSProperties }

const EASE_CHECK = [0.16, 1, 0.3, 1] as const

export function IconCommission({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <ellipse cx="12" cy="17.5" rx="7.5" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 17.5V13c0-1.66 3.36-3 7.5-3s7.5 1.34 7.5 3v4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="12" cy="13" rx="7.5" ry="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4.5 13V8.5c0-1.66 3.36-3 7.5-3s7.5 1.34 7.5 3V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <motion.g
        animate={{ y: [0, -1.4, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ellipse cx="12" cy="8.5" rx="7.5" ry="3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M9.6 8.5c0-.9 1.07-1.5 2.4-1.5s2.4.6 2.4 1.5-1.07 1.5-2.4 1.5-2.4-.6-2.4-1.5Z" stroke="currentColor" strokeWidth="1.4" />
      </motion.g>
    </svg>
  )
}

export function IconSpark({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <motion.path
        d="M12 3.5c.4 3.2 1.1 5.3 2.2 6.4 1.1 1.1 3.2 1.8 6.3 2.1-3.1.4-5.2 1.1-6.3 2.2-1.1 1.1-1.8 3.2-2.2 6.3-.4-3.1-1.1-5.2-2.2-6.3-1.1-1.1-3.2-1.8-6.3-2.2 3.1-.3 5.2-1 6.3-2.1 1.1-1.1 1.8-3.2 2.2-6.4Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"
        style={{ transformOrigin: '12px 12px' }}
        animate={{ scale: [1, 1.14, 1], rotate: [0, 8, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.path d="M19 3.5v3M17.5 5h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
        animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} />
    </svg>
  )
}

export function IconChat({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 12c0-4.14 3.58-7.5 8-7.5s8 3.36 8 7.5-3.58 7.5-8 7.5c-1.02 0-1.99-.18-2.88-.5L5 20.5l1.2-3.6C4.8 15.7 4 13.94 4 12Z"
        stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      {[8.7, 12, 15.3].map((cx, i) => (
        <motion.circle key={cx} cx={cx} cy="12" r="1" fill="currentColor"
          animate={{ y: [0, -2, 0] }}
          transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }} />
      ))}
    </svg>
  )
}

export function IconVariants({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <motion.rect x="3.5" y="8.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"
        style={{ transformOrigin: '7px 12px' }}
        animate={{ rotate: [-12, -20, -12] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.rect x="8.5" y="6.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6"
        style={{ transformOrigin: '12px 10px' }}
        animate={{ rotate: [4, 12, 4] }} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }} />
      <rect x="13.5" y="9.5" width="7" height="7" rx="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function IconDelivery({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <motion.path d="M4 18c3-1.2 4.5-3.4 5.5-6C10.6 8.9 12.4 5.5 17 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="0.5 3.4"
        animate={{ strokeDashoffset: [0, -7.8] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }} />
      <motion.circle cx="4" cy="19" r="2" stroke="currentColor" strokeWidth="1.6"
        animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: '4px 19px' }} />
      <path d="M17 4c1.8 0 3 1.4 3 3.2 0 2.4-3 5.8-3 5.8s-3-3.4-3-5.8C14 5.4 15.2 4 17 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="17" cy="7.2" r="1.1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

export function IconAnalytics({ size = 20, className, style }: IconProps) {
  const bars: [number, number, number][] = [[4, 19, 9], [9.5, 19, 5], [15, 19, -7], [20, 19, -11]]
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      {bars.map(([x, y1, y2], i) => (
        <motion.path key={x} d={`M${x} ${y1}V${y2}`} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          style={{ transformOrigin: `${x}px ${y1}px` }}
          animate={{ scaleY: [0.7, 1, 0.7] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }} />
      ))}
      <path d="M4 11.5 9 7l4.5 3.5L20 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      <motion.circle cx="20" cy="5" r="1.4" fill="currentColor"
        animate={{ scale: [1, 1.3, 1] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }} style={{ transformOrigin: '20px 5px' }} />
    </svg>
  )
}

export function IconShield({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M12 3.5 5 6v5.4C5 16 8 19.4 12 20.5c4-1.1 7-4.5 7-9.1V6L12 3.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 11.6l2 2 4-4.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function IconCoupon({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M3.5 9.5c1 0 1.8-.8 1.8-1.8S4.5 6 3.5 6V5a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v1c-1 0-1.8.8-1.8 1.8S18.5 9.5 19.5 9.5v5c-1 0-1.8.8-1.8 1.8s.8 1.8 1.8 1.8v1a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-1c1 0 1.8-.8 1.8-1.8s-.8-1.8-1.8-1.8v-5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 8.5l6 7M9.3 9h.01M14.7 15h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconMobile({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.3 5.2h3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="18.3" r="1" fill="currentColor" />
    </svg>
  )
}

export function IconScan({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="8" y="8.5" width="8" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.4" strokeDasharray="0.5 2.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconFilter({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M4 5h16l-6 7.2V19l-4 1.5v-8.3L4 5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function IconPublish({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M12 15V4M8.5 7.5 12 4l3.5 3.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 14v3.6A2.4 2.4 0 0 0 6.9 20h10.2a2.4 2.4 0 0 0 2.4-2.4V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function IconBell({ size = 20, className, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} style={style}>
      <path d="M6 10.5c0-3.3 2.5-6 6-6s6 2.7 6 6c0 3.6.9 5.2 1.8 6.2H4.2c.9-1 1.8-2.6 1.8-6.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9.5 19a2.6 2.6 0 0 0 5 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

// ─── "Menace" icons — the fraud signals Krenix Shield screens out: a bot
// script, a spoofed identity, a fraud flag. Used only as projectiles in
// ShieldDefenseScene (deliberately not part of the main icon family). ─────
function IconThreatBot({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <rect x="5" y="9" width="14" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 9V5.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.4" fill="currentColor" />
      <circle cx="9" cy="14" r="1.3" fill="currentColor" />
      <circle cx="15" cy="14" r="1.3" fill="currentColor" />
      <path d="M2.5 12.5h2.5M19 12.5h2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

function IconThreatMask({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M2.5 8.5c2 -1.5 5-1.5 6 0 1-1.5 5.5-1.5 6.5 0 1-1.5 4.5-1.5 6.5 0-.5 5-3 8.5-6.5 8.5-2 0-3-1-3.5-2-.5 1-1.5 2-3.5 2-3.5 0-6-3.5-6.5-8.5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="7.3" cy="10.5" r="1.3" fill="currentColor" />
      <circle cx="16.7" cy="10.5" r="1.3" fill="currentColor" />
    </svg>
  )
}

function IconThreatFlag({ size = 20, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 2 2 7.5 12 13l10-5.5L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 16.5 12 22l10-5.5M2 12l10 5.5 10-5.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7" />
    </svg>
  )
}

// ─── Krenix Shield "defense scene" — the big animated hero visual for the
// fake-order-filtering showcase. Three menace glyphs (bot / spoofed identity
// / fraud flag) launch toward the shield on a loop and get visibly deflected
// at its edge — a much bigger, more dramatic read than a static badge. ────
const THREATS: { Icon: React.ElementType; from: { x: number; y: number }; delay: number; color: string }[] = [
  { Icon: IconThreatBot, from: { x: -120, y: -70 }, delay: 0, color: 'var(--color-dash-danger)' },
  { Icon: IconThreatMask, from: { x: 130, y: -50 }, delay: 1.1, color: 'var(--color-dash-danger)' },
  { Icon: IconThreatFlag, from: { x: 0, y: 110 }, delay: 2.2, color: 'var(--color-dash-danger)' },
]

export function ShieldDefenseScene({ size = 220 }: { size?: number }) {
  const shieldSize = size * 0.62
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <ShieldScanIcon size={shieldSize} />
      {THREATS.map(({ Icon, from, delay, color }, i) => (
        <motion.div
          key={i}
          className="absolute rounded-xl flex items-center justify-center"
          style={{
            width: size * 0.16, height: size * 0.16, background: 'var(--color-dash-danger-soft)',
            color, left: '50%', top: '50%', marginLeft: -size * 0.08, marginTop: -size * 0.08,
          }}
          animate={{
            x: [from.x, from.x, from.x * 0.35, from.x * 0.55],
            y: [from.y, from.y, from.y * 0.35, from.y * 0.55],
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1, 1, 0.75],
          }}
          transition={{ duration: 3.3, repeat: Infinity, ease: EASE_CHECK, delay, times: [0, 0.12, 0.55, 1] }}
        >
          <Icon size={size * 0.09} />
        </motion.div>
      ))}
    </div>
  )
}

// ─── Animated shield — the "Krenix Shield" flagship glyph. A slow radar
// sweep behind the shield plus soft pulsing rings, so it actually reads as
// "scanning" rather than a static badge. Respects prefers-reduced-motion via
// the caller wrapping it (see ShieldScanIcon usage in page.tsx). ───────────
export function ShieldScanIcon({ size = 96 }: { size?: number }) {
  const gold = 'var(--color-dash-gold-dark)'
  const soft = 'var(--color-dash-gold)'
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {[0, 1].map(i => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ inset: 0, border: `1px solid ${soft}` }}
          initial={{ opacity: 0.5, scale: 0.55 }}
          animate={{ opacity: [0.5, 0], scale: [0.55, 1.35] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeOut', delay: i * 1.3 }}
        />
      ))}
      <div className="absolute rounded-full overflow-hidden" style={{ inset: '20%' }}>
        <motion.div
          className="absolute inset-0"
          style={{ background: `conic-gradient(from 0deg, transparent 0deg, ${gold}55 40deg, transparent 90deg)` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'linear' }}
        />
      </div>
      <svg width={size * 0.42} height={size * 0.42} viewBox="0 0 24 24" fill="none" className="relative">
        <path d="M12 3.5 5 6v5.4C5 16 8 19.4 12 20.5c4-1.1 7-4.5 7-9.1V6L12 3.5Z" fill="var(--color-dash-page)" stroke={gold} strokeWidth="1.7" strokeLinejoin="round" />
        <motion.path
          d="M9 11.6l2 2 4-4.2" stroke={gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 0.4, repeat: Infinity, repeatDelay: 2.2, ease: EASE_CHECK }}
        />
      </svg>
    </div>
  )
}
