import Image from 'next/image'

interface KrenixLogoProps {
  height?: number
  /** Accepted for API compatibility (white-label); brand art is fixed. */
  color?: string
  className?: string
  /** Mark only, no wordmark. */
  compact?: boolean
  /** Accepted for API compatibility (white-label); brand art is fixed. */
  mono?: boolean
}

// Krenix identity — the rising blue phoenix (Krenix → phoeNIX) + the KRENIX
// wordmark rendered as bold text (matches the homepage nav exactly).
export default function KrenixLogo({ height = 24, className = '', compact = false }: KrenixLogoProps) {
  const markSize = Math.round(height * 2.2)
  const mark = (
    <Image src="/brand/krenix-phoenix.png" alt="Krenix" width={markSize} height={markSize} unoptimized
      style={{ objectFit: 'contain', flexShrink: 0, height: markSize, width: 'auto' }} />
  )

  if (compact) return <span className={className} style={{ display: 'inline-flex' }}>{mark}</span>

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.14) }}>
      {mark}
      <span
        className="font-heading font-extrabold"
        style={{ fontSize: Math.round(height * 0.62), color: '#15171C', letterSpacing: '0.01em' }}
      >
        KRENIX
      </span>
    </span>
  )
}
