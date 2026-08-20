'use client'

import Image from 'next/image'
import type { Product, Store } from '@/types/database'
import { X } from 'lucide-react'
import OrderFormFields from './OrderFormFields'
import { getStoreLocale } from '@/lib/i18n/store'

interface Props {
  product: Product
  store: Store
  onClose: () => void
}

export default function StoreOrderModal({ product, store, onClose }: Props) {
  const locale = getStoreLocale(store)
  const isRTL = locale === 'ar'
  const theme = store.theme?.config
  const bg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'
  const primary = theme?.colors.primary ?? '#3B82F6'

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: bg, border: `1px solid ${border}` }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: `1px solid ${border}` }}>
          <div className="flex items-center gap-3">
            {product.images?.[0] && (
              <Image
                src={product.images[0]}
                alt={product.name}
                width={40}
                height={40}
                className="rounded-xl object-cover"
              />
            )}
            <div>
              <p className="font-semibold text-sm" style={{ color: text }}>{product.name}</p>
              <p className="text-xs font-bold" style={{ color: primary }}>
                {Number(product.price).toLocaleString('fr-DZ')} DA
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label={isRTL ? 'إغلاق' : 'Fermer'}
            style={{ color: textMuted }}
            className="hover:opacity-70 transition-opacity">
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <OrderFormFields product={product} store={store} onSuccess={onClose} isRTL={isRTL} />
        </div>
      </div>
    </div>
  )
}
