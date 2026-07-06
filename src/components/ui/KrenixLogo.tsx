import Image from 'next/image'

interface KrenixLogoProps {
  height?: number
  /** Wordmark colour. Default white. */
  color?: string
  className?: string
  /** Mark only, no wordmark. */
  compact?: boolean
  /** Accepted for API compatibility (white-label); the phoenix mark is fixed brand art. */
  mono?: boolean
}

// Krenix identity — the rising blue phoenix (Krenix → phoeNIX: a merchant rising
// from nothing into a thriving store) paired with the KRENIX wordmark in Archivo
// Black — a heavy, high-impact geometric face (distinct from the app's Syne).
export default function KrenixLogo({
  height = 24, color = '#fff', className = '', compact = false,
}: KrenixLogoProps) {
  const mark = (
    <Image
      src="/brand/krenix-mark.png"
      alt="Krenix"
      width={height}
      height={height}
      style={{ objectFit: 'contain', flexShrink: 0, height, width: 'auto' }}
    />
  )

  if (compact) return <span className={className} style={{ display: 'inline-flex' }}>{mark}</span>

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.12) }}>
      {mark}
      <span style={{
        fontFamily: 'var(--font-logo), sans-serif',
        letterSpacing: '0.06em',
        fontSize: Math.round(height * 0.66),
        lineHeight: 1,
        color,
        whiteSpace: 'nowrap',
      }}>KRENIX</span>
    </span>
  )
}
