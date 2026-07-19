'use client'

import { motion } from 'framer-motion'
import { ArrowUpRight } from 'lucide-react'
import { useCountUp } from '@/lib/dashboard-motion'
import Card from './Card'

export interface StatTileProps {
  icon: React.ReactNode
  iconBg: string
  label: string
  value: number
  format?: (n: number) => string
  delta?: number
  deltaUnit?: string
  delayMs?: number
}

// KPI card: icon badge, count-up serif number, optional up/down delta pill.
// Used on Overview + Landing-page stats + anywhere else showing a headline
// metric — the mockup's 4-stat-card row pattern, generalized.
export default function StatTile({ icon, iconBg, label, value, format, delta, deltaUnit = '%', delayMs = 0 }: StatTileProps) {
  const animated = useCountUp(value)
  const display = format ? format(animated) : Math.round(animated).toLocaleString('fr-FR')

  const positive = (delta ?? 0) >= 0

  return (
    <Card delayMs={delayMs} hover className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="w-[34px] h-[34px] rounded-[10px] flex items-center justify-center" style={{ background: iconBg }}>
          {icon}
        </div>
        {delta !== undefined && (
          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full flex-shrink-0 whitespace-nowrap ${positive ? 'bg-dash-success-soft' : 'bg-dash-danger-soft'}`}>
            <motion.span
              animate={{ rotate: positive ? 0 : 90 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="inline-flex"
            >
              <ArrowUpRight size={10} strokeWidth={2.6} className={positive ? 'text-dash-success' : 'text-dash-danger'} />
            </motion.span>
            <span className={`text-[11px] font-bold whitespace-nowrap ${positive ? 'text-dash-success' : 'text-dash-danger'}`}>
              {positive ? '+' : ''}{delta.toFixed(1).replace('.', ',')}{deltaUnit}
            </span>
          </div>
        )}
      </div>
      <div>
        <div className="text-xs text-dash-ink-soft font-semibold">{label}</div>
        <div className="dash-font-heading mt-1 tabular-nums whitespace-nowrap" style={{ fontSize: 'clamp(16px,2.1vw,30px)' }}>
          {display}
        </div>
      </div>
    </Card>
  )
}
