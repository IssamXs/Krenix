'use client'

import { motion } from 'framer-motion'

export type Period = 'today' | 'week' | 'month'

const OPTIONS: { key: Period; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week', label: '7 jours' },
  { key: 'month', label: '30 jours' },
]

// Sliding-pill segmented control (Today / 7d / 30d), the mockup's period
// switcher — but using Framer Motion's shared layoutId for the indicator
// instead of a manually-computed `left` offset, so it spring-glides between
// positions instead of just easing linearly.
export default function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="relative flex bg-dash-surface-2 rounded-[11px] p-[3px]">
      {OPTIONS.map(opt => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={`relative z-10 w-[98px] py-2 rounded-[8px] text-[12.5px] font-bold dash-font-sans transition-colors duration-200 ${
              active ? 'text-dash-ink' : 'text-dash-ink-soft hover:text-dash-ink'
            }`}
          >
            {active && (
              <motion.span
                layoutId="period-toggle-indicator"
                className="absolute inset-0 bg-dash-surface rounded-[8px] shadow-[0_1px_6px_oklch(0.18_0.01_255_/_0.18)]"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
