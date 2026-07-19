'use client'

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import Card from './Card'

export interface PlanCardData {
  id: string
  name: string
  price: string
  period: string
  tagline?: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  features: string[]
  missing?: string[]
}

// Shared plan-tier card — billing/page.tsx and billing/upgrade/page.tsx used
// to each hand-roll ~90% identical markup for this (copy-pasted MAIN_PLANS/
// SUR_MESURE_PLANS rendering). One component now, fed by each page's own
// plan array + current/recommended flags.
export default function PlanCard({
  plan, isCurrent, isRecommended, delayMs = 0, onSelect, ctaLabel,
}: {
  plan: PlanCardData
  isCurrent: boolean
  isRecommended?: boolean
  delayMs?: number
  onSelect?: () => void
  ctaLabel?: string
}) {
  const Icon = plan.icon
  return (
    <Card delayMs={delayMs} hover className="relative flex flex-col gap-4">
      {isCurrent && (
        <span className="absolute -top-[11px] left-6 px-3 py-[3px] rounded-full bg-dash-gold text-dash-ink text-[10.5px] font-extrabold tracking-wide uppercase">
          Forfait actuel
        </span>
      )}
      {!isCurrent && isRecommended && (
        <span className="absolute -top-[11px] left-6 px-3 py-[3px] rounded-full bg-dash-accent text-dash-surface text-[10.5px] font-extrabold tracking-wide uppercase">
          Recommandé
        </span>
      )}
      <div className="flex items-center gap-2.5">
        <Icon size={18} className="text-dash-accent" />
        <div>
          <div className="text-[15.5px] font-bold text-dash-ink">{plan.name}</div>
          {plan.tagline && <div className="text-xs text-dash-ink-soft mt-0.5">{plan.tagline}</div>}
        </div>
      </div>
      <div>
        <div className="dash-font-heading text-[26px] text-dash-ink whitespace-nowrap">{plan.price} DA</div>
        <div className="dash-font-sans text-xs font-semibold text-dash-ink-soft mt-0.5">{plan.period}</div>
      </div>
      <div className="flex flex-col gap-2 flex-1">
        {plan.features.map(f => (
          <div key={f} className="flex items-center gap-2">
            <Check size={14} strokeWidth={2.6} className="text-dash-success flex-shrink-0" />
            <span className="text-[12.5px] text-dash-ink">{f}</span>
          </div>
        ))}
        {plan.missing?.map(f => (
          <div key={f} className="flex items-center gap-2 opacity-40">
            <span className="w-3.5 h-[1.5px] bg-dash-ink-faint flex-shrink-0" />
            <span className="text-[12.5px] text-dash-ink-soft line-through">{f}</span>
          </div>
        ))}
      </div>
      <motion.button
        onClick={isCurrent ? undefined : onSelect}
        whileTap={isCurrent ? undefined : { scale: 0.97 }}
        disabled={isCurrent}
        className={`py-2.5 rounded-[11px] text-[13px] font-bold w-full transition-colors ${
          isCurrent
            ? 'bg-dash-surface border border-dash-border text-dash-ink-soft cursor-default'
            : 'bg-dash-accent text-dash-surface hover:bg-dash-accent-dark cursor-pointer'
        }`}
      >
        {isCurrent ? 'Plan actuel' : (ctaLabel ?? 'Choisir ce forfait')}
      </motion.button>
    </Card>
  )
}

export function PlanGrid({ children, columns = 3 }: { children: React.ReactNode; columns?: 2 | 3 | 4 }) {
  const cols = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' }[columns]
  return <div className={`grid grid-cols-1 ${cols} gap-[18px]`}>{children}</div>
}
