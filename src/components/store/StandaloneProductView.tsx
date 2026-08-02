'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Product, Store } from '@/types/database'
import OrderFormFields from './OrderFormFields'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'

interface Props {
  product: Product
  store: Store
}

export default function StandaloneProductView({ product, store }: Props) {
  const pathname = usePathname()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''

  const theme = store.theme?.config
  const bg = theme?.colors.background ?? '#000000'
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'
  const primary = theme?.colors.primary ?? '#3B82F6'

  const images = product.images || []
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const activeImage = images[activeImageIndex] || null

  return (
    <div className="min-h-screen py-12 px-5 sm:px-6" style={{ background: bg, color: text }}>
      <div className="max-w-5xl mx-auto">
        <Link 
          href={storeBase || '/'} 
          className="inline-flex items-center gap-2 mb-8 text-sm font-semibold hover:opacity-70 transition-opacity"
          style={{ color: textMuted }}
        >
          <ChevronLeft size={16} /> Retour à la boutique
        </Link>
        
        <div className="grid md:grid-cols-2 gap-10 items-start">
          
          {/* Image Gallery */}
          <div className="space-y-4">
            <div 
              className="w-full aspect-square rounded-3xl overflow-hidden relative"
              style={{ background: `${primary}15`, border: `1px solid ${border}` }}
            >
              {activeImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img 
                  src={activeImage} 
                  alt={product.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: primary, opacity: 0.3 }}>
                  ✦
                </div>
              )}
              {product.compare_price && (
                <span className="absolute top-4 left-4 px-3 py-1 rounded-xl text-sm font-bold shadow-lg" style={{ background: primary, color: '#fff' }}>
                  PROMO
                </span>
              )}
            </div>
            
            {images.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveImageIndex(idx)}
                    className="relative w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden transition-all hover:scale-105"
                    style={{ 
                      border: activeImageIndex === idx ? `2px solid ${primary}` : `1px solid ${border}`,
                      opacity: activeImageIndex === idx ? 1 : 0.6
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Product Details & Checkout */}
          <div className="rounded-[32px] p-6 sm:p-8" style={{ background: cardBg, border: `1px solid ${border}` }}>
            <div className="mb-6">
              <h1 className="text-3xl font-bold mb-3" style={{ color: text }}>{product.name}</h1>
              <div className="flex items-center gap-3">
                <span className="text-2xl font-black" style={{ color: primary }}>
                  {Number(product.price).toLocaleString('fr-DZ')} DA
                </span>
                {product.compare_price && (
                  <span className="text-lg line-through" style={{ color: textMuted }}>
                    {Number(product.compare_price).toLocaleString('fr-DZ')} DA
                  </span>
                )}
              </div>
            </div>

            <OrderFormFields 
              product={product} 
              store={store} 
              onSuccess={() => {}} 
            />
          </div>

        </div>
      </div>
    </div>
  )
}
