// src/components/store/OfferBadge.tsx
import type { Product } from '@/types/database'

interface Props {
  product: Pick<Product, 'offer_active' | 'offer_label'>
  className?: string
}

// Small ribbon-style badge for an active product offer. Renders nothing when
// no offer is active — callers don't need to guard.
export default function OfferBadge({ product, className = '' }: Props) {
  if (!product.offer_active || !product.offer_label) return null
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold text-white whitespace-nowrap ${className}`}
      style={{ background: '#DC2626' }}
    >
      {product.offer_label}
    </span>
  )
}
