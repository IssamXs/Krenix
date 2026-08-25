'use client'

import { useState } from 'react'
import Image from 'next/image'
import { usePathname, useSearchParams } from 'next/navigation'
import type { Product, Store } from '@/types/database'
import OrderFormFields from './OrderFormFields'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { canUseBadges } from '@/lib/product-badges'
import ProductBadgeStack from './ProductBadgeStack'
import GoogleFontLoader from './GoogleFontLoader'
import { getStoreLocale } from '@/lib/i18n/store'
import { firstAvailableColor } from '@/lib/variants'
import { useProductPhotoColorSync } from '@/lib/use-product-photo-color-sync'
import ViewContentTracker from './ViewContentTracker'

interface Props {
  product: Product
  store: Store
  relatedProducts: Product[]
}

export default function StandaloneProductView({ product, store, relatedProducts }: Props) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const storeBase = pathname.startsWith('/store') ? '/store' : ''
  const queryString = searchParams.toString() ? `?${searchParams.toString()}` : ''
  // Return the shopper to the product they came from rather than the top of the
  // shop. The anchor matches the grid card's id (see the *StoreHome themes and
  // StoreHomepage), and works on a cold load too — an ad click straight to this
  // page still lands correctly in the grid, which a history back() would not.
  const backHref = `${storeBase || '/'}#product-${product.id}`

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

  const locale = getStoreLocale(store)
  const isRTL = locale === 'ar'

  // The frame follows each photo's real shape instead of forcing every photo
  // into a square, which used to crop ~25% off the sides of a 4:3 product shot.
  // Measured from the loaded image, then clamped so an extreme panorama or a
  // very tall photo can't blow out the page. Starts square to reserve space.
  const [aspect, setAspect] = useState(1)
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    if (!naturalWidth || !naturalHeight) return
    setAspect(Math.min(1.9, Math.max(0.62, naturalWidth / naturalHeight)))
  }

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'} className="min-h-screen py-12 px-5 sm:px-6" style={{ background: bg, color: text, fontFamily: isRTL ? "'Tajawal', 'Cairo', system-ui, sans-serif" : undefined }}>
      <ViewContentTracker productId={product.id} productName={product.name} price={Number(product.price)} />
      <GoogleFontLoader href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;900&display=swap" arabic={locale === 'ar'} />
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-full transition-all hover:opacity-70"
            style={{ color: textMuted, border: '1px solid #F59E0B', background: cardBg }}
          >
            <ChevronLeft size={16} style={{ transform: isRTL ? 'scaleX(-1)' : undefined }} />
            {isRTL ? 'العودة إلى المتجر' : 'Retour à la boutique'}
          </Link>
        </div>

        <div className="grid md:grid-cols-2 gap-10 items-start">
          
          {/* Image Gallery.
              min-w-0 is load-bearing: grid items default to min-width:auto, so
              this column would otherwise refuse to shrink below the thumbnail
              strip's full width (8 photos = 724px) and drag the whole page
              sideways on mobile. With it, the strip's overflow-x scrolls. */}
          <div className="space-y-4 min-w-0">
            <div
              className="w-full rounded-3xl overflow-hidden relative"
              style={{ aspectRatio: aspect, background: `${primary}15`, border: `1px solid ${border}` }}
            >
              {activeImage ? (
                <Image
                  src={activeImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                  priority
                  onLoad={handleImageLoad}
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
                locale={locale}
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
          <div className="rounded-[32px] p-6 sm:p-8 min-w-0" style={{ background: cardBg, border: `1px solid ${border}` }}>
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

        {relatedProducts.length > 0 && (
          <section className="mt-14">
            <h2 className="text-lg font-bold mb-5" style={{ color: text }}>
              {isRTL ? 'قد يعجبك أيضاً' : 'Vous aimerez aussi'}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {relatedProducts.map(rp => (
                <Link
                  key={rp.id}
                  href={`${storeBase}/product/${rp.id}${queryString}`}
                  className="rounded-2xl overflow-hidden transition-all hover:opacity-80"
                  style={{ background: cardBg, border: `1px solid ${border}` }}
                >
                  <div className="relative aspect-square">
                    {rp.images[0] && (
                      <Image src={rp.images[0]} alt={rp.name} fill className="object-cover" sizes="200px" />
                    )}
                  </div>
                  <div className="p-3 space-y-1">
                    <p className="text-sm font-semibold truncate" style={{ color: text }}>{rp.name}</p>
                    <p className="text-sm font-bold" style={{ color: primary }}>{rp.price} DA</p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
