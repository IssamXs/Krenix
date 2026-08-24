'use client'

import { useState, useEffect, useRef } from 'react'
import type { Store } from '@/types/database'
import { WILAYAS, DEFAULT_DELIVERY_RATES_STOPDESK, wilayaDisplayName } from '@/lib/wilayas'
import { getCommunesForWilaya } from '@/lib/communes'
import { getDeviceFingerprint, createBehaviorTracker, type BehaviorTracker } from '@/lib/fraud-shield/client-signals'
import { useTurnstile } from '@/lib/fraud-shield/use-turnstile'
import { useCart } from './CartProvider'
import { Loader2, CheckCircle } from 'lucide-react'

function validateAlgerianPhone(phone: string) {
  return /^(05|06|07)\d{8}$/.test(phone.replace(/\s/g, ''))
}

interface Props {
  store: Store
  isRTL: boolean
  onSuccess: () => void
}

// Mirrors OrderFormFields.tsx's customer-info collection, delivery-fee
// lookup, and fraud-shield signal collection — deliberately duplicated
// rather than extracted into a shared hook. OrderFormFields.tsx is the
// highest-traffic, revenue-critical conversion path in this codebase;
// refactoring it to share logic with this brand-new, lower-traffic cart
// form is not worth the regression risk for this change.
export default function CartCheckoutForm({ store, isRTL, onSuccess }: Props) {
  const { items, totalPrice, clear } = useCart()
  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const cardBg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const [form, setForm] = useState({ customer_name: '', customer_phone: '', wilaya: '', commune: '' })
  const [deliveryType, setDeliveryType] = useState<'home' | 'desk'>('home')
  const stopdeskEnabled = store.settings?.stopdeskEnabled !== false
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const fraudShieldEnabled = !!store.fraud_shield_enabled
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null)
  const behaviorTrackerRef = useRef<BehaviorTracker | null>(null)
  const { containerRef: turnstileRef, token: turnstileToken } = useTurnstile(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    fraudShieldEnabled,
  )
  useEffect(() => {
    if (!fraudShieldEnabled) return
    getDeviceFingerprint().then(setDeviceFingerprint)
    behaviorTrackerRef.current = createBehaviorTracker()
    return () => behaviorTrackerRef.current?.dispose()
  }, [fraudShieldEnabled])

  // Mirrors the delivery-fee lookup in OrderFormFields.tsx — see the
  // file-level comment above for why this is duplicated rather than shared.
  const mode = store.settings?.deliveryPricingMode ?? 'wilaya'
  const [fee, setFee] = useState<{ key: string; home: number | null; desk: number | null } | null>(null)
  const feeKey = !form.wilaya || mode === 'flat' ? '' : `${store.id}:${form.wilaya}`
  useEffect(() => {
    if (!feeKey) return
    let cancelled = false
    fetch(`/api/storefront/delivery-fees?storeId=${store.id}&toWilaya=${encodeURIComponent(form.wilaya)}`)
      .then(res => res.json())
      .then(data => { if (!cancelled) setFee({ key: feeKey, home: data.homeFee ?? null, desk: data.deskFee ?? null }) })
      .catch(() => { if (!cancelled) setFee({ key: feeKey, home: null, desk: null }) })
    return () => { cancelled = true }
  }, [feeKey, store.id, form.wilaya])

  const rates = store.settings?.deliveryRates
  const stopdeskRates = store.settings?.deliveryRatesStopdesk
  const defaultRate = rates?.default ?? Number(store.settings?.deliveryPrice ?? 600)
  const defaultStopdeskRate = stopdeskRates?.default ?? DEFAULT_DELIVERY_RATES_STOPDESK.default ?? defaultRate
  const wilayaRate = form.wilaya && rates && mode === 'wilaya' ? (rates[form.wilaya] ?? defaultRate) : defaultRate
  const wilayaStopdeskRate = form.wilaya && mode === 'wilaya'
    ? (stopdeskRates?.[form.wilaya] ?? DEFAULT_DELIVERY_RATES_STOPDESK[form.wilaya] ?? defaultStopdeskRate)
    : defaultStopdeskRate
  const staticRateForType = deliveryType === 'desk' ? wilayaStopdeskRate : wilayaRate
  const dynamicFeeForType = fee?.key === feeKey ? (deliveryType === 'desk' ? fee.desk : fee.home) : null
  const rawDeliveryPrice = form.wilaya ? (mode === 'wilaya' && dynamicFeeForType !== null ? dynamicFeeForType : staticRateForType) : 0
  // Mirrors OrderFormFields.tsx's free-delivery-threshold rule: once the
  // cart subtotal meets the merchant's configured threshold, delivery is
  // free. Dropping this (as an earlier version of this form did) silently
  // charges delivery on cart checkouts that the single-item flow correctly
  // waives for the same store/subtotal.
  const freeDeliveryThreshold = store.settings?.freeDeliveryThreshold ?? 0
  const isFreeDelivery = freeDeliveryThreshold > 0 && totalPrice >= freeDeliveryThreshold
  const deliveryPrice = isFreeDelivery ? 0 : rawDeliveryPrice
  const total = totalPrice + deliveryPrice

  const communes = form.wilaya ? getCommunesForWilaya(form.wilaya) : []

  const recordInput = () => behaviorTrackerRef.current?.recordInput()

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) { setError(isRTL ? 'الاسم مطلوب' : 'Le nom est requis.'); return }
    if (!validateAlgerianPhone(form.customer_phone)) { setError(isRTL ? 'رقم الهاتف غير صحيح' : 'Numéro invalide (05/06/07 + 8 chiffres).'); return }
    if (!form.wilaya || !form.commune.trim()) { setError(isRTL ? 'الولاية والبلدية مطلوبتان' : 'Wilaya et commune requises.'); return }

    setSubmitting(true)
    setError('')
    try {
      const signals = behaviorTrackerRef.current?.getSignals()
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: store.id,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          wilaya: form.wilaya,
          commune: form.commune,
          delivery_type: deliveryType,
          delivery_price: deliveryPrice,
          items: items.map(i => ({ product_id: i.productId, color: i.color, size: i.size, quantity: i.quantity })),
          source: 'form',
          turnstile_token: turnstileToken,
          device_fingerprint: deviceFingerprint,
          ...signals,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? (isRTL ? 'خطأ، حاول مجدداً' : 'Erreur, réessayez.')); return }
      // Clear the cart now (it was placed), but do NOT call onSuccess() here
      // — that closes the whole drawer immediately, so the customer would
      // never see this confirmation. Showing `success` below and letting
      // them dismiss it (via onSuccess, wired to the close button) is what
      // actually lets them see it, matching OrderFormFields' own
      // show-then-let-them-close pattern for the single-item flow.
      setSuccess(true)
      clear()
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="p-8 flex flex-col items-center text-center gap-3">
        <CheckCircle size={40} style={{ color: primary }} />
        <p className="font-bold" style={{ color: text }}>{isRTL ? 'تم استلام طلبك!' : 'Commande reçue !'}</p>
        <button
          onClick={onSuccess}
          className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: primary, color: cardBg }}
        >
          {isRTL ? 'إغلاق' : 'Fermer'}
        </button>
      </div>
    )
  }

  const inputStyle = {
    width: '100%', padding: '12px 16px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)', border: `1px solid ${border}`,
    color: text, outline: 'none', fontSize: '14px',
  } as const

  return (
    <div className="p-5 space-y-3">
      {fraudShieldEnabled && <div ref={turnstileRef} />}
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <input
        value={form.customer_name}
        onChange={e => { recordInput(); setForm(f => ({ ...f, customer_name: e.target.value })) }}
        placeholder={isRTL ? 'الاسم الكامل' : 'Nom complet'}
        style={inputStyle}
      />
      <input
        value={form.customer_phone}
        onChange={e => { recordInput(); setForm(f => ({ ...f, customer_phone: e.target.value })) }}
        placeholder="06 XX XX XX XX"
        type="tel"
        style={inputStyle}
      />
      <select
        value={form.wilaya}
        onChange={e => { recordInput(); setForm(f => ({ ...f, wilaya: e.target.value, commune: '' })) }}
        style={inputStyle}
      >
        <option value="">{isRTL ? 'اختر الولاية' : 'Choisir la wilaya'}</option>
        {WILAYAS.map(w => <option key={w} value={w}>{wilayaDisplayName(w, isRTL ? 'ar' : 'fr')}</option>)}
      </select>
      <select
        value={form.commune}
        onChange={e => { recordInput(); setForm(f => ({ ...f, commune: e.target.value })) }}
        disabled={!form.wilaya}
        style={inputStyle}
      >
        <option value="">{isRTL ? 'اختر البلدية' : 'Choisir la commune'}</option>
        {communes.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      {stopdeskEnabled && (
        <div className="grid grid-cols-2 gap-2">
          {(['home', 'desk'] as const).map(dtype => (
            <button
              key={dtype}
              type="button"
              onClick={() => setDeliveryType(dtype)}
              className="py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: deliveryType === dtype ? `${primary}1a` : 'rgba(255,255,255,0.03)',
                border: `1.5px solid ${deliveryType === dtype ? primary : border}`,
                color: deliveryType === dtype ? primary : text,
              }}
            >
              {dtype === 'home' ? (isRTL ? 'للمنزل' : 'À domicile') : (isRTL ? 'مكتب التوصيل' : 'Stop desk')}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-between text-sm pt-1">
        <span style={{ color: textMuted }}>{isRTL ? 'التوصيل' : 'Livraison'}</span>
        <span style={{ color: text }}>{deliveryPrice.toLocaleString('fr-DZ')} DA</span>
      </div>
      <div className="flex justify-between text-base font-bold pb-2">
        <span style={{ color: text }}>{isRTL ? 'المجموع' : 'Total'}</span>
        <span style={{ color: primary }}>{total.toLocaleString('fr-DZ')} DA</span>
      </div>
      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3.5 rounded-2xl font-black text-sm disabled:opacity-50"
        style={{ background: primary, color: cardBg }}
      >
        {submitting
          ? <Loader2 size={16} className="animate-spin mx-auto" />
          : (isRTL ? `اطلب الآن — ${total.toLocaleString('fr-DZ')} DA` : `Commander — ${total.toLocaleString('fr-DZ')} DA`)}
      </button>
    </div>
  )
}
