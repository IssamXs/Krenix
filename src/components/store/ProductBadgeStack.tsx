'use client'

import { getDisplayBadges, formatBadgeLabel } from '@/lib/product-badges'

interface Props {
  badges: string[] | null | undefined
  showEmojis: boolean
  max?: number
  size?: 'sm' | 'md'
}

// Small stacked-pill cluster, meant to sit `absolute top-2 left-2` (or `top-4
// left-4` on larger detail views) over a product image. Renders nothing when
// there are no badges to show — callers don't need to guard.
export default function ProductBadgeStack({ badges, showEmojis, max, size = 'sm' }: Props) {
  const list = getDisplayBadges(badges, max)
  if (list.length === 0) return null

  const padding = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-3 py-1 text-xs'

  return (
    <div className="absolute top-2 left-2 flex flex-col gap-1 items-start z-[1] pointer-events-none">
      {list.map(b => (
        <span
          key={b.id}
          className={`${padding} rounded-lg font-bold shadow-sm whitespace-nowrap`}
          style={{ background: b.color, color: '#fff' }}
        >
          {formatBadgeLabel(b, showEmojis)}
        </span>
      ))}
    </div>
  )
}
