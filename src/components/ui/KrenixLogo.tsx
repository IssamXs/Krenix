import { useId } from 'react'

interface KrenixLogoProps {
  height?: number
  color?: string
  className?: string
  compact?: boolean
}

export default function KrenixLogo({ height = 24, color = 'currentColor', className = '', compact = false }: KrenixLogoProps) {
  const uid = useId().replace(/:/g, '')
  const filterId = `nv-${uid}`

  const bendFilter = (
    <defs>
      {/* Erode then dilate at same radius → rounds convex corners, giving slight "bendy" organic quality */}
      <filter id={filterId} x="-4%" y="-8%" width="108%" height="116%" colorInterpolationFilters="sRGB">
        <feMorphology operator="erode" radius="0.8" result="e" />
        <feMorphology in="e" operator="dilate" radius="0.8" />
      </filter>
    </defs>
  )

  if (compact) {
    const w = Math.round(height * 20 / 24)
    return (
      <svg width={w} height={height} viewBox="0 0 20 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className}>
        {bendFilter}
        <g filter={`url(#${filterId})`}>
          {/* Left bar */}
          <polygon points="0,0 6,0 6,24 0,24" />
          {/* Diagonal — solid, no inner cut */}
          <polygon points="6,0 12,0 14,24 8,24" />
          {/* Right bar */}
          <polygon points="14,0 20,0 20,24 14,24" />
        </g>
      </svg>
    )
  }

  const w = Math.round(height * 137 / 24)
  return (
    <svg width={w} height={height} viewBox="0 0 137 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className}>
      {bendFilter}
      <g filter={`url(#${filterId})`}>
        {/* ── N ── clean solid diagonal, no inner cut */}
        <polygon points="0,0 6,0 6,24 0,24" />
        <polygon points="6,0 12,0 14,24 8,24" />
        <polygon points="14,0 20,0 20,24 14,24" />

        {/* ── O ── angular octagon with inner hole */}
        <path
          d="M24,0 H38 L40,5 V19 L38,24 H24 L22,19 V5 Z M27,5 H35 L37,9 V15 L35,19 H27 L25,15 V9 Z"
          fillRule="evenodd"
        />

        {/* ── V ── */}
        <path d="M44,0 H50 L53,20 L56,0 H62 L55,24 H51 Z" />

        {/* ── A ── two arms + crossbar */}
        <polygon points="64,24 69,24 73,0 68,0" />
        <polygon points="73,0 78,0 83,24 78,24" />
        <rect x="65" y="13" width="15" height="4" />

        {/* ── L ── */}
        <path d="M85,0 H90 V19 H97 V24 H85 Z" />

        {/* ── U ── */}
        <path d="M99,0 H104 V19 H112 V0 H117 V24 H99 Z" />

        {/* ── X ── */}
        <polygon points="119,0 125,0 137,24 131,24" />
        <polygon points="131,0 137,0 125,24 119,24" />
      </g>
    </svg>
  )
}
