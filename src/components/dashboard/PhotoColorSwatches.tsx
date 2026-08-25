'use client'

import { colorHex, isLightHex } from '@/lib/variants'
import { Check } from 'lucide-react'

interface Props {
  colors: string[]
  activeColor: string | undefined
  onSelect: (color: string) => void
}

// Small swatch row under a product photo thumbnail so the merchant can tag
// which color that photo depicts. Mirrors VariantStockEditor's swatch
// styling. Renders nothing until the product has colors to tag with.
export default function PhotoColorSwatches({ colors, activeColor, onSelect }: Props) {
  if (colors.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1 px-0.5 pt-1">
      {colors.map(name => {
        const selected = activeColor === name
        const hex = colorHex(name)
        return (
          <button
            key={name}
            type="button"
            onClick={() => onSelect(name)}
            title={name}
            className={`relative w-4 h-4 rounded-full transition-transform hover:scale-110 ${selected ? 'ring-2 ring-dash-accent ring-offset-1 ring-offset-dash-surface' : ''}`}
            style={{ background: hex, border: isLightHex(hex) ? '1px solid rgba(0,0,0,0.15)' : 'none' }}
          >
            {selected && <Check size={9} className="absolute inset-0 m-auto" style={{ color: isLightHex(hex) ? '#111' : '#fff' }} />}
          </button>
        )
      })}
    </div>
  )
}
