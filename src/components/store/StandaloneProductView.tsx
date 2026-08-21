'use client'

import { useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import type { Product, Store } from '@/types/database'
import OrderFormFields from './OrderFormFields'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
import GoogleFontLoader from './GoogleFontLoader'
import { firstAvailableColor } from '@/lib/variants'
import { useProductPhotoColorSync } from '@/lib/use-product-photo-color-sync'

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
  const gallery = useProductPhotoColorSync(images, product.image_colors ?? {}, firstAvailableColor(product.colors, product.variant_stock))
  const activeImage = images[gallery.activeIndex] || null

  const [lang, setLang] = useState<'fr' | 'ar'>('fr')
  const isRTL = lang === 'ar'

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen py-12 px-5 sm:px-6" style={{ background: bg, color: text, fontFamily: isRTL ? "'Cairo', sans-serif" : undefined }}>
      <GoogleFontLoader href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href={storeBase || '/'}
            className="inline-flex items-center gap-2 text-sm font-semibold hover:opacity-70 transition-opacity"
            style={{ color: textMuted }}
          >
            <ChevronLeft size={16} style={{ transform: isRTL ? 'scaleX(-1)' : undefined }} />
            {isRTL ? 'العودة إلى المتجر' : 'Retour à la boutique'}
          </Link>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: border }}>
            <button
              onClick={() => setLang('fr')}
              className="px-2.5 py-1 text-xs font-semibold transition-all"
              style={{ background: lang === 'fr' ? primary : 'transparent', color: lang === 'fr' ? bg : textMuted }}>
              FR
            </button>
            <button
              onClick={() => setLang('ar')}
              className="px-2.5 py-1 text-xs font-semibold transition-all"
              style={{ background: lang === 'ar' ? primary : 'transparent', color: lang === 'ar' ? bg : textMuted }}>
              عربي
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          
          {/* Image Gallery */}
          <div className="space-y-4">
            <div 
              className="w-full aspect-square rounded-3xl overflow-hidden relative"
              style={{ background: `${primary}15`, border: `1px solid ${border}` }}
            >
              {activeImage ? (
                <Image
                  src={activeImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-5xl" style={{ color: primary, opacity: 0.3 }}>
                  ✦
                </div>
              )}
              <ProductBadgeStack
                badges={canUseBadges(store.plan) ? product.badges : []}
                showEmojis={!!store.settings?.showBadgeEmojis}
                size="md"
              />
            </div>
            
            {images.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-2">
                {images.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => gallery.setActiveIndex(idx)}
                    className="relative w-20 h-20 flex-shrink-0 rounded-2xl overflow-hidden transition-all hover:scale-105"
                    style={{
                      border: gallery.activeIndex === idx ? `2px solid ${primary}` : `1px solid ${border}`,
                      opacity: gallery.activeIndex === idx ? 1 : 0.6
                    }}
                  >
                    <Image src={img} alt="" fill sizes="80px" className="object-cover" />
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
              isRTL={isRTL}
              onSuccess={() => {}}
              color={gallery.selectedColor}
              onColorChange={gallery.selectColor}
            />
          </div>

        </div>

        {/* Product description — rendered only when the merchant turned it on */}
        {product.show_description !== false && product.description && (
          <div
            className="mt-10 rounded-[32px] p-6 sm:p-8"
            style={{ background: cardBg, border: `1px solid ${border}` }}
          >
            <h2 className="text-lg font-bold mb-4" style={{ color: text }}>{isRTL ? 'الوصف' : 'Description'}</h2>
            <div className="text-[15px] font-medium leading-[1.85] whitespace-pre-wrap" style={{ color: textMuted }}>
              {product.description}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
