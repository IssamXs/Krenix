'use client'

import { useId, useMemo } from 'react'
import { motion } from 'framer-motion'

interface Point { x: number; y: number }

// Catmull-Rom → cubic-bezier smoothing, straight from the mockup's own
// smoothPath() — it's a genuinely good small algorithm for turning a sparse
// data series into a smooth (not sharply-angled) SVG path.
function smoothPath(pts: Point[]): string {
  if (pts.length < 2) return ''
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
  }
  return d
}

export interface AreaLineChartProps {
  series: number[]
  labels: string[]
  height?: number
  color?: string
}

// Animated area+line chart with a pulsing dot on the latest point — the
// mockup's revenue chart, generalized for any series. Draws itself in via
// stroke-dashoffset on mount/series-change (keyed by the data so switching
// the period toggle re-triggers the draw-in rather than just snapping).
export default function AreaLineChart({ series, labels, height = 200, color = 'var(--color-dash-accent)' }: AreaLineChartProps) {
  const gradId = useId()
  const W = 600, H = height, padX = 6, padY = 18

  const { linePath, areaPath, length, lastPt } = useMemo(() => {
    const max = Math.max(...series, 1) * 1.18
    const stepX = series.length > 1 ? (W - padX * 2) / (series.length - 1) : 0
    const pts = series.map((v, i) => ({ x: padX + i * stepX, y: H - padY - (v / max) * (H - padY * 2) }))
    const line = smoothPath(pts)
    const last = pts[pts.length - 1] ?? { x: padX, y: H - padY }
    const area = pts.length ? `${line} L${last.x.toFixed(1)},${H - padY} L${pts[0].x.toFixed(1)},${H - padY} Z` : ''
    let len = 0
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
    return { linePath: line, areaPath: area, length: Math.ceil(len * 1.05) || 1, lastPt: last }
  }, [series, H])

  const seriesKey = series.join(',')

  return (
    <div className="relative w-full" style={{ height }}>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.path
          key={`area-${seriesKey}`}
          d={areaPath}
          fill={`url(#${gradId})`}
          stroke="none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.3 }}
        />
        <motion.path
          key={`line-${seriesKey}`}
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ strokeDasharray: length, strokeDashoffset: length }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <motion.div
        key={`dot-${seriesKey}`}
        className="absolute rounded-full"
        style={{
          left: `${(lastPt.x / W) * 100}%`, top: `${(lastPt.y / H) * 100}%`,
          width: 9, height: 9, background: color, transform: 'translate(-50%,-50%)',
          boxShadow: '0 0 0 3px var(--color-dash-surface)',
        }}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.4, delay: 1.1, ease: 'backOut' }}
      >
        <span className="absolute -inset-1 rounded-full border-2 dash-pulse-ring" style={{ borderColor: color, animation: 'dashPulseRing 2s ease-out infinite' }} />
      </motion.div>
      <div className="flex justify-between mt-2.5 px-0.5">
        {labels.map((lbl, i) => (
          <span key={i} className="text-[11px] text-dash-ink-faint">{lbl}</span>
        ))}
      </div>
    </div>
  )
}
