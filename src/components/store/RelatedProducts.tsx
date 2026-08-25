'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Product, Store } from '@/types/database'

interface Props {
  products: (Product & { landing_page_slug: string })[]
  store: Store
  // French vs Darja/Arabic heading, matching the isRTL convention used
  // throughout the store components (see getStoreLocale in lib/i18n/store).
  isRTL?: boolean
}

export default function RelatedProducts({ products, store, isRTL = false }: Props) {
  // Same storeBase/queryString convention as StoreHomepage.tsx and
  // StandaloneProductView.tsx: production's middleware rewrite to /store/*
  // is invisible to the browser (pathname stays "/p/..."), but local dev
  // navigates real "/store/p/..." URLs directly — so the prefix must be
  // computed at render time, not hardcoded.
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : ''

  if (products.length === 0) return null

  const theme = store.theme?.config
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'
  const primary = theme?.colors.primary ?? '#3B82F6'

  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-6 py-12" dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 className="text-lg font-bold mb-5" style={{ color: text }}>
        {isRTL ? 'قد يعجبك أيضاً' : 'Vous aimerez aussi'}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {products.map(product => (
          <Link
            key={product.id}
            href={`${storeBase}/p/${product.landing_page_slug}${queryString}`}
            className="rounded-2xl overflow-hidden transition-all hover:opacity-80"
            style={{ background: cardBg, border: `1px solid ${border}` }}
          >
            <div className="relative aspect-square">
              {product.images[0] && (
                <Image src={product.images[0]} alt={product.name} fill className="object-cover" sizes="200px" />
              )}
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-semibold truncate" style={{ color: text }}>{product.name}</p>
              <p className="text-sm font-bold" style={{ color: primary }}>{product.price} DA</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
