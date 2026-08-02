// ============================================================
// Product variants — per-color and per-size stock (independent pools).
//
// A product's stock can be broken down into two INDEPENDENT pools: one per
// colour and one per size (NOT a colour×size matrix — the owner rejected that).
// Example: colours {Bleu: 10, Rouge: 10}, sizes {S: 8, M: 12}. Each pool sums
// to the product's general `stock` (the owner divides the general quantity).
//
// On an order for "Bleu / S", BOTH the Bleu pool and the S pool are decremented
// (and the general stock). On cancel/return they're restored. Legacy products
// with no variant_stock fall back to the single general `stock` count.
// ============================================================

export interface VariantStock {
  colors?: Record<string, number>
  sizes?: Record<string, number>
}

// Predefined colour palette shown as clickable swatches in the product form and
// as Shopify-style circles on the storefront. Names are what get stored on the
// order (`order.color`), hex is only for rendering the circle.
export const COLOR_PALETTE: { name: string; hex: string }[] = [
  { name: 'Noir',        hex: '#111111' },
  { name: 'Blanc',       hex: '#FFFFFF' },
  { name: 'Gris',        hex: '#9CA3AF' },
  { name: 'Bleu',        hex: '#2563EB' },
  { name: 'Bleu marine', hex: '#1E3A5F' },
  { name: 'Turquoise',   hex: '#14B8A6' },
  { name: 'Vert',        hex: '#16A34A' },
  { name: 'Vert olive',  hex: '#6B7A3A' },
  { name: 'Rouge',       hex: '#DC2626' },
  { name: 'Bordeaux',    hex: '#7A1F2B' },
  { name: 'Rose',        hex: '#EC4899' },
  { name: 'Orange',      hex: '#EA580C' },
  { name: 'Jaune',       hex: '#EAB308' },
  { name: 'Violet',      hex: '#7C3AED' },
  { name: 'Marron',      hex: '#78350F' },
  { name: 'Beige',       hex: '#D6C7A1' },
  { name: 'Crème',       hex: '#F5EDD8' },
  { name: 'Or',          hex: '#D4AF37' },
  { name: 'Argent',      hex: '#C0C0C0' },
]

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

const HEX_BY_NAME: Record<string, string> = Object.fromEntries(
  COLOR_PALETTE.map(c => [c.name.toLowerCase(), c.hex]),
)

/** Hex for a stored colour name; falls back to a neutral swatch for custom names. */
export function colorHex(name: string): string {
  return HEX_BY_NAME[name.trim().toLowerCase()] ?? '#B8B8B8'
}

/** A very light colour needs a visible border so the circle doesn't vanish on white. */
export function isLightHex(hex: string): boolean {
  const h = hex.replace('#', '')
  if (h.length !== 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 210
}

export function sumStock(pool: Record<string, number> | undefined): number {
  if (!pool) return 0
  return Object.values(pool).reduce((a, b) => a + (Number(b) || 0), 0)
}

/** True when a product tracks per-variant stock (has at least one pool). */
export function hasVariantStock(vs: VariantStock | null | undefined): boolean {
  return !!vs && (Object.keys(vs.colors ?? {}).length > 0 || Object.keys(vs.sizes ?? {}).length > 0)
}

/** Remaining stock for a chosen colour (undefined pool → not tracked → null). */
export function colorRemaining(vs: VariantStock | null | undefined, color: string | null): number | null {
  if (!vs?.colors || !color) return null
  return vs.colors[color] ?? null
}

export function sizeRemaining(vs: VariantStock | null | undefined, size: string | null): number | null {
  if (!vs?.sizes || !size) return null
  return vs.sizes[size] ?? null
}

// Apply a signed delta to the chosen colour+size pools, clamped at 0. Returns a
// NEW object (never mutates). delta is negative to deduct, positive to restore.
// A pool key that isn't present is left untouched (order predates the variant).
export function applyVariantDelta(
  vs: VariantStock | null | undefined,
  color: string | null,
  size: string | null,
  delta: number,
): VariantStock | null {
  if (!vs) return vs ?? null
  const next: VariantStock = {
    colors: { ...(vs.colors ?? {}) },
    sizes: { ...(vs.sizes ?? {}) },
  }
  if (color && next.colors && color in next.colors) {
    next.colors[color] = Math.max(0, (next.colors[color] ?? 0) + delta)
  }
  if (size && next.sizes && size in next.sizes) {
    next.sizes[size] = Math.max(0, (next.sizes[size] ?? 0) + delta)
  }
  return next
}
