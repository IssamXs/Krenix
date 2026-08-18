'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import type { Product, Plan } from '@/types/database'
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
import OfferBadge from './OfferBadge'

interface Props {
  product: Product
  storePlan: Plan
  showBadgeEmojis?: boolean
  className?: string
  aspect?: string
  bg?: string
  placeholder?: string
  sizes?: string
}

// Storefront product-card photo: `object-contain` so the full photo is always
// visible regardless of its shape (never cropped) — a photo whose aspect
// ratio doesn't match the card just letterboxes on two sides instead of
// losing part of the image. Fades to the next photo on hover when the
// product has several, and animates in on scroll. The wrapping card must
// carry the Tailwind `group` class for the hover swap.
export default function ProductCardImage({
  product,
  storePlan,
  showBadgeEmojis,
  className = '',
  aspect = 'aspect-[4/5]',
  bg,
  placeholder = '❦',
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw',
}: Props) {
  const images = (product.images ?? []).filter(Boolean)
  const first = images[0]
  const second = images[1]
  const hasMore = images.length > 1

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className={`relative ${aspect} overflow-hidden ${className}`}
      style={bg ? { background: bg } : undefined}
    >
      {first ? (
        <>
          <Image
            src={first}
            alt={product.name}
            fill
            sizes={sizes}
            loading="lazy"
            className={`object-contain transition-all duration-500 ease-out ${hasMore ? 'group-hover:scale-[1.08] group-hover:opacity-0' : 'group-hover:scale-[1.08]'}`}
          />
          {hasMore && (
            <Image
              src={second}
              alt={product.name}
              fill
              sizes={sizes}
              loading="lazy"
              className="object-contain opacity-0 scale-[1.08] transition-all duration-500 ease-out group-hover:opacity-100 group-hover:scale-100"
            />
          )}
        </>
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl" style={{ color: 'currentColor', opacity: 0.35 }}>
          {placeholder}
        </div>
      )}

      {/* Photo-count dots — tells shoppers the product has more photos */}
      {hasMore && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full shadow" style={{ background: '#ffffff' }} />
          <span className="w-1.5 h-1.5 rounded-full shadow" style={{ background: 'rgba(255,255,255,0.45)' }} />
        </div>
      )}

      <ProductBadgeStack
        badges={canUseBadges(storePlan) ? product.badges : []}
        showEmojis={!!showBadgeEmojis}
        max={2}
      />
      <OfferBadge product={product} className="absolute top-2 right-2 z-[1]" />
    </motion.div>
  )
}
