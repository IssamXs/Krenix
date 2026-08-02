'use client'

import { COLOR_PALETTE, SIZES, colorHex, isLightHex, sumStock, type VariantStock } from '@/lib/variants'
import { Check } from 'lucide-react'

// Shopify-style variant editor: pick colours (from a palette of circles) and
// sizes (XS–XXL chips), each selected variant gets its own stock count.
//
// Fully CONTROLLED — the parent product form owns the state and passes it as
// `value`; every interaction computes the next state and calls `onChange`. No
// internal state / effects (avoids setState-in-effect cascades).
//
// Independent pools (no matrix): colours and sizes are tracked separately, each
// summing to the product's general stock, which the parent derives from a pool.

export interface VariantState {
  colors: string[]
  sizes: string[]
  variantStock: VariantStock
}

interface Props {
  value: VariantState
  onChange: (state: VariantState) => void
}

export default function VariantStockEditor({ value, onChange }: Props) {
  const { colors, sizes } = value
  const colorStock = value.variantStock.colors ?? {}
  const sizeStock = value.variantStock.sizes ?? {}

  const emit = (colorsNext: string[], sizesNext: string[], cs: Record<string, number>, ss: Record<string, number>) =>
    onChange({ colors: colorsNext, sizes: sizesNext, variantStock: { colors: cs, sizes: ss } })

  const toggleColor = (name: string) => {
    if (colors.includes(name)) {
      const cs = { ...colorStock }; delete cs[name]
      emit(colors.filter(c => c !== name), sizes, cs, sizeStock)
    } else {
      emit([...colors, name], sizes, { ...colorStock, [name]: 0 }, sizeStock)
    }
  }
  const setColorQty = (name: string, n: number) => emit(colors, sizes, { ...colorStock, [name]: n }, sizeStock)

  const toggleSize = (size: string) => {
    if (sizes.includes(size)) {
      const ss = { ...sizeStock }; delete ss[size]
      emit(colors, sizes.filter(x => x !== size), colorStock, ss)
    } else {
      emit(colors, [...sizes, size], colorStock, { ...sizeStock, [size]: 0 })
    }
  }
  const setSizeQty = (size: string, n: number) => emit(colors, sizes, colorStock, { ...sizeStock, [size]: n })

  const colorTotal = sumStock(colorStock)
  const sizeTotal = sumStock(sizeStock)

  const numInput = (val: number, on: (n: number) => void) => (
    <input
      type="number" min="0" value={val === 0 ? '' : val}
      onChange={e => on(Math.max(0, Number(e.target.value) || 0))}
      placeholder="0"
      className="w-20 px-2 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-sm text-center outline-none focus:border-dash-accent/50 transition-all"
    />
  )

  return (
    <div className="space-y-5">
      {/* Colours */}
      <div>
        <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Couleurs</label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map(c => {
            const selected = colors.includes(c.name)
            return (
              <button
                key={c.name}
                type="button"
                onClick={() => toggleColor(c.name)}
                title={c.name}
                className={`relative w-8 h-8 rounded-full transition-transform hover:scale-110 ${selected ? 'ring-2 ring-dash-accent ring-offset-2 ring-offset-dash-surface' : ''}`}
                style={{ background: c.hex, border: isLightHex(c.hex) ? '1px solid rgba(0,0,0,0.15)' : 'none' }}
              >
                {selected && (
                  <Check size={14} className="absolute inset-0 m-auto" style={{ color: isLightHex(c.hex) ? '#111' : '#fff' }} />
                )}
              </button>
            )
          })}
        </div>

        {colors.length > 0 && (
          <div className="mt-3 space-y-2">
            {colors.map(name => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: colorHex(name), border: isLightHex(colorHex(name)) ? '1px solid rgba(0,0,0,0.15)' : 'none' }} />
                <span className="text-dash-ink text-sm flex-1">{name}</span>
                {numInput(colorStock[name] ?? 0, n => setColorQty(name, n))}
                <span className="text-dash-ink-faint text-xs w-14">en stock</span>
              </div>
            ))}
            <p className="text-dash-ink-soft text-xs pt-1">Total couleurs : <strong className="text-dash-ink">{colorTotal}</strong></p>
          </div>
        )}
      </div>

      {/* Sizes */}
      <div>
        <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Tailles</label>
        <div className="flex flex-wrap gap-2">
          {SIZES.map(size => {
            const selected = sizes.includes(size)
            return (
              <button
                key={size}
                type="button"
                onClick={() => toggleSize(size)}
                className={`min-w-[44px] px-3 py-2 rounded-xl border text-sm font-semibold transition-all ${
                  selected ? 'border-dash-accent bg-dash-accent-soft text-dash-accent' : 'border-dash-border text-dash-ink-soft hover:border-dash-ink-faint/40'
                }`}
              >
                {size}
              </button>
            )
          })}
        </div>

        {sizes.length > 0 && (
          <div className="mt-3 space-y-2">
            {sizes.map(size => (
              <div key={size} className="flex items-center gap-3">
                <span className="text-dash-ink text-sm font-semibold w-10">{size}</span>
                {numInput(sizeStock[size] ?? 0, n => setSizeQty(size, n))}
                <span className="text-dash-ink-faint text-xs w-14">en stock</span>
              </div>
            ))}
            <p className="text-dash-ink-soft text-xs pt-1">Total tailles : <strong className="text-dash-ink">{sizeTotal}</strong></p>
          </div>
        )}
      </div>

      {(colors.length > 0 || sizes.length > 0) && (
        <p className="text-dash-ink-faint text-xs leading-relaxed bg-dash-surface-2 rounded-xl px-3 py-2.5">
          Le stock est suivi par variante : une commande « {colors[0] ?? 'couleur'}{sizes[0] ? ` / ${sizes[0]}` : ''} » ne réduit que ce stock-là.
          Le stock général du produit est la somme des variantes.
        </p>
      )}
    </div>
  )
}
