'use client'

import { motion } from 'framer-motion'

export interface DonutSegment { label: string; pct: number; color: string }

// Animated stroke-based donut (traffic-source breakdown in the mockup),
// generalized. Segments animate their arc length in on mount.
export default function DonutChart({ segments, centerLabel, centerSub }: {
  segments: DonutSegment[]
  centerLabel: string
  centerSub: string
}) {
  const R = 70, CIRC = 2 * Math.PI * R

  // Cumulative arc offsets via a pure reduce (no mutated variable during
  // render, at all) — react-hooks/immutability flags reassignment even
  // inside an IIFE closure, so this avoids it entirely rather than hiding it.
  // `cum` on each entry is the positive running total BEFORE that segment;
  // strokeDashoffset wants it negated.
  const arcs = segments.reduce<{ label: string; pct: number; color: string; len: number; cum: number }[]>(
    (acc, seg) => {
      const cumBefore = acc.length ? acc[acc.length - 1].cum + acc[acc.length - 1].len : 0
      const len = (seg.pct / 100) * CIRC
      return [...acc, { ...seg, len, cum: cumBefore }]
    },
    [],
  )

  return (
    <div>
      <div className="relative mx-auto mb-5" style={{ width: 150, height: 150 }}>
        <svg width={150} height={150} viewBox="0 0 180 180">
          <circle cx={90} cy={90} r={R} fill="none" stroke="var(--color-dash-surface-2)" strokeWidth={22} />
          <g transform="rotate(-90 90 90)">
            {arcs.map((seg, i) => (
              <motion.circle
                key={seg.label}
                cx={90} cy={90} r={R} fill="none" stroke={seg.color} strokeWidth={22} strokeLinecap="butt"
                strokeDashoffset={-seg.cum}
                initial={{ strokeDasharray: `0 ${CIRC.toFixed(1)}` }}
                animate={{ strokeDasharray: `${seg.len.toFixed(1)} ${(CIRC - seg.len).toFixed(1)}` }}
                transition={{ duration: 1.1, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </g>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-[19px] font-extrabold text-dash-ink">{centerLabel}</div>
          <div className="text-[10.5px] text-dash-ink-soft">{centerSub}</div>
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-[12.5px] flex-1 text-dash-ink">{seg.label}</span>
            <span className="text-[12.5px] font-bold text-dash-ink">{seg.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
