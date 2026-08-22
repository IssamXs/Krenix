'use client'

import { useMemo } from 'react'
import type { Product, Plan } from '@/types/database'
import ProductCardImage from './ProductCardImage'

interface Props {
  products: Product[]
  storePlan: Plan
  showBadgeEmojis?: boolean
  onOpen: (p: Product) => void
  priceTag: (n: number) => string
  primary: string
  text: string
  muted: string
  border: string
  cardBg: string
  headingStyle?: React.CSSProperties
}

// Pro-édition "catalogue automatique": products sharing a colour are grouped
// into auto-generated collection rows (no manual setup). Only groups with 2+
// products are shown; everything else still lives in the main grid below.
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i

export default function AutoCatalog({
  products,
  storePlan,
  showBadgeEmojis,
  onOpen,
  priceTag,
  primary,
  text,
  muted,
  border,
  cardBg,
  headingStyle,
}: Props) {
  const groups = useMemo(() => {
    const byColor = new Map<string, Product[]>()
    for (const p of products) {
      for (const color of (p.colors ?? []).filter(Boolean)) {
        const arr = byColor.get(color) ?? []
        if (!arr.includes(p)) arr.push(p)
        byColor.set(color, arr)
      }
    }
    return [...byColor.entries()].filter(([, arr]) => arr.length >= 2).slice(0, 3)
  }, [products])

  if (groups.length === 0) return null

  return (
    <div className="space-y-9 mb-12">
      {groups.map(([color, items]) => (
        <div key={color}>
          <div className="flex items-center gap-2.5 mb-4">
            <h3 className="text-lg font-bold" style={headingStyle ?? { color: text }}>
              Collection {color}
            </h3>
            {HEX.test(color) && (
              <span className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10" style={{ background: color }} />
            )}
            <span className="text-xs" style={{ color: muted }}>{items.length} article{items.length > 1 ? 's' : ''}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {items.map(p => (
              <div
                key={p.id}
                onClick={() => onOpen(p)}
                className="cursor-pointer group overflow-hidden transition-all hover:-translate-y-1"
                style={{ background: cardBg, border: `1px solid ${border}`, borderRadius: 16 }}
              >
                <ProductCardImage
                  product={p}
                  storePlan={storePlan}
                  showBadgeEmojis={showBadgeEmojis}
                  aspect="aspect-square"
                  bg={cardBg}
                />
                <div className="p-3">
                  <p className="text-sm font-semibold truncate" style={{ color: text }}>{p.name}</p>
                  <p className="text-sm font-bold mt-1" style={{ color: primary }}>{priceTag(p.price)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
