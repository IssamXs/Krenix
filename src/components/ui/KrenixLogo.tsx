import { useId } from 'react'

interface KrenixLogoProps {
  height?: number
  /** Wordmark colour (and, in `mono`, the whole logo). Default white. */
  color?: string
  className?: string
  /** Mark only, no wordmark. */
  compact?: boolean
  /** Render entirely in `color` — no gradient, no spark. For white-label. */
  mono?: boolean
}

// Krenix identity — geometric "K" monogram (azure→violet) with the signature
// amber "spark", paired with the KRENIX wordmark in Syne (the app's display face).
export default function KrenixLogo({
  height = 24, color = '#fff', className = '', compact = false, mono = false,
}: KrenixLogoProps) {
  const gid = `kg-${useId().replace(/:/g, '')}`
  const markW = Math.round((height * 132 / 128) * 100) / 100
  const showSpark = !mono && height >= 18
  const markFill = mono ? color : `url(#${gid})`

  const mark = (
    <svg width={markW} height={height} viewBox="0 0 132 128" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: 'block' }}>
      {!mono && (
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5CC6FF" />
            <stop offset="0.5" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
      )}
      <g fill={markFill}>
        {/* spine */}
        <polygon points="22,20 44,20 44,108 22,108" />
        {/* upper arm */}
        <polygon points="38.4,54.5 106.4,14.5 117.6,33.5 49.6,73.5" />
        {/* lower arm */}
        <polygon points="38.4,73.5 106.4,113.5 117.6,94.5 49.6,54.5" />
      </g>
      {showSpark && <polygon points="112,6 126,1 130.5,13 116.5,18" fill="#F59E0B" />}
    </svg>
  )

  if (compact) return <span className={className} style={{ display: 'inline-flex' }}>{mark}</span>

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.3) }}>
      {mark}
      <span style={{
        fontFamily: 'var(--font-heading), sans-serif',
        fontWeight: 800,
        letterSpacing: '0.12em',
        fontSize: Math.round(height * 0.82),
        lineHeight: 1,
        color,
        whiteSpace: 'nowrap',
      }}>KRENIX</span>
    </span>
  )
}
