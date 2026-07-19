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
// wordmark rendered as folded-ribbon artwork (Netflix-style crease treatment).
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
      <Image src="/brand/krenix-wordmark.png" alt="Krenix" width={1537} height={450} unoptimized
        style={{ height: Math.round(height * 2.0), width: 'auto', objectFit: 'contain' }} />
    </span>
  )
}
