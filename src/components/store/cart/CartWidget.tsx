'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShoppingCart, X, Minus, Plus, Trash2 } from 'lucide-react'
import type { Store } from '@/types/database'
import { getStoreLocale } from '@/lib/i18n/store'
import { useCart } from './CartProvider'
import CartCheckoutForm from './CartCheckoutForm'

export default function CartWidget({ store }: { store: Store }) {
  const { items, totalItems, totalPrice, removeItem, updateQuantity } = useCart()
  const [open, setOpen] = useState(false)
  const [checkingOut, setCheckingOut] = useState(false)
  const router = useRouter()
  const isRTL = getStoreLocale(store) === 'ar'

  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const close = () => { setOpen(false); setCheckingOut(false) }

  // Nothing to show once the cart is empty.
  if (totalItems === 0) return null

  const handleOpen = () => {
    // A single distinct product/variant line reuses that product's own
    // existing order flow (OrderFormFields on that page) instead of a second
    // checkout UI for the simple case — see the pageUrl field on CartItem.
    // items.length counts distinct lines, not total quantity, so a lone item
    // with quantity 5 still redirects rather than opening the drawer.
    if (items.length === 1) {
      router.push(items[0].pageUrl)
      return
    }
    setOpen(true)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="fixed bottom-5 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg transition-all hover:opacity-90"
        style={{ [isRTL ? 'left' : 'right']: '20px', background: primary, color: cardBg } as React.CSSProperties}
      >
        <ShoppingCart size={22} />
        <span
          className="absolute -top-1 -right-1 flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold"
          style={{ background: cardBg, color: primary, border: `1.5px solid ${primary}` }}
        >
          {totalItems}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={close}
        >
          <div
            className="w-full sm:max-w-md sm:rounded-3xl rounded-t-3xl max-h-[85vh] overflow-y-auto"
            style={{ background: cardBg, border: `1px solid ${border}` }}
            onClick={e => e.stopPropagation()}
            dir={isRTL ? 'rtl' : 'ltr'}
          >
            <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: border }}>
              <h2 className="text-base font-bold" style={{ color: text }}>
                {checkingOut ? (isRTL ? 'إتمام الطلب' : 'Confirmer la commande') : (isRTL ? 'سلتي' : 'Mon panier')}
              </h2>
              <button onClick={close} style={{ color: textMuted }}>
                <X size={20} />
              </button>
            </div>

            {!checkingOut ? (
              <div className="p-5 space-y-4">
                {items.map(item => (
                  <div key={`${item.productId}-${item.color}-${item.size}`} className="flex gap-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      {item.image && <img src={item.image} alt={item.name} className="w-full h-full object-cover" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: text }}>{item.name}</p>
                      <p className="text-xs" style={{ color: textMuted }}>
                        {[item.color, item.size].filter(Boolean).join(' / ') || (isRTL ? 'قياس عادي' : 'Standard')}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <button
                          onClick={() => updateQuantity(item, item.quantity - 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg"
                          style={{ border: `1px solid ${border}`, color: text }}
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-xs font-semibold w-4 text-center" style={{ color: text }}>{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item, item.quantity + 1)}
                          className="w-6 h-6 flex items-center justify-center rounded-lg"
                          style={{ border: `1px solid ${border}`, color: text }}
                        >
                          <Plus size={12} />
                        </button>
                        <button onClick={() => removeItem(item)} className="ms-auto" style={{ color: textMuted }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="text-sm font-bold flex-shrink-0" style={{ color: primary }}>
                      {(item.unitPrice * item.quantity).toLocaleString('fr-DZ')} DA
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <CartCheckoutForm store={store} isRTL={isRTL} onSuccess={close} />
            )}

            {!checkingOut && (
              <div className="p-5 border-t space-y-3" style={{ borderColor: border }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: textMuted }}>{isRTL ? 'المجموع' : 'Sous-total'}</span>
                  <span className="font-bold" style={{ color: text }}>{totalPrice.toLocaleString('fr-DZ')} DA</span>
                </div>
                <button
                  onClick={() => setCheckingOut(true)}
                  className="w-full py-3.5 rounded-2xl font-black text-sm"
                  style={{ background: primary, color: cardBg }}
                >
                  {isRTL ? 'تأكيد الطلب' : 'Confirmer ma commande'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
