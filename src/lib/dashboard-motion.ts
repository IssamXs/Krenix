// ============================================================
// Shared Framer Motion primitives for the Éclat-redesigned dashboard.
// The dashboard had zero motion conventions before this (confirmed: no
// framer-motion usage anywhere under src/app/(platform)/dashboard), so
// everything here is a fresh vocabulary — used consistently across every
// rebuilt page rather than each page inventing its own timing/easing.
// ============================================================
import { useEffect, useRef, useState } from 'react'
import type { Variants } from 'framer-motion'

// The mockup's own easing curve (cubic-bezier(.16,1,.3,1)) — a fast-out,
// gentle-settle curve that reads as "premium" rather than mechanical.
export const EASE_PREMIUM = [0.16, 1, 0.3, 1] as const

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE_PREMIUM } },
}

// Props (spread onto a motion element) that reveal a section as it scrolls into
// view — for section-heavy pages (chatbot settings, finance) that want each
// block to animate in on appear rather than all at once on mount.
export const inViewReveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.15 },
  transition: { duration: 0.5, ease: EASE_PREMIUM },
} as const

export const pageIn: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_PREMIUM } },
}

// Wrap a list of children in this to stagger their `fadeUp` reveal —
// mirrors the mockup's per-card `animation-delay` but computed automatically
// instead of hand-tuned per element.
export const staggerContainer = (staggerMs = 60, startDelayMs = 0): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: staggerMs / 1000, delayChildren: startDelayMs / 1000 },
  },
})

// Card hover: lift + shadow, matching the mockup's style-hover cards.
// The transition lives INSIDE whileHover's target object (not as a sibling
// top-level `transition` prop) — Framer Motion only keeps one top-level
// `transition`, so a sibling prop here would silently override each card's
// mount stagger-delay transition the moment this is spread alongside it.
export const cardHover = {
  whileHover: { y: -3, boxShadow: '0 16px 32px -16px oklch(0.18 0.01 255 / 0.25)', transition: { duration: 0.2 } },
}

// Table/list row hover: slide + tint, matching the mockup's row style-hover.
export const rowHover = {
  whileHover: { x: 3, backgroundColor: 'oklch(0.965 0.008 255)', transition: { duration: 0.15 } },
}

// ── Count-up number, spring-driven (smoother than the mockup's manual RAF
// easing loop). Pass the target value; re-triggers whenever it changes so
// switching the Overview period toggle re-animates the KPIs.
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0)
  const startRef = useRef<number | null>(null)
  const fromRef = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    fromRef.current = value
    startRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)

    const step = (t: number) => {
      if (startRef.current === null) startRef.current = t
      const elapsed = t - startRef.current
      const p = Math.min(1, elapsed / durationMs)
      const eased = 1 - Math.pow(1 - p, 3) // easeOutCubic
      setValue(fromRef.current + (target - fromRef.current) * eased)
      if (p < 1) rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs])

  return value
}

// ── Reveal-once-in-view: for long pages (Products, Orders, Settings), so
// rows/cards animate in as the user scrolls rather than all firing at once
// on mount — the "more motion" ask, applied where it earns its keep instead
// of just repeating the same mount animation everywhere.
export function useInViewOnce<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect() }
    }, { threshold })
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])

  return { ref, inView }
}
