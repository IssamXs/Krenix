'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product, Store } from '@/types/database'
import { WILAYAS, DEFAULT_DELIVERY_RATES_STOPDESK } from '@/lib/wilayas'
import { getCommunesForWilaya } from '@/lib/communes'
import { buildWaLink, customerConfirmMessage, orderMessageVars } from '@/lib/whatsapp'
import { trackInitiateCheckout, trackPurchase, trackLead, identifyForPixels } from '@/lib/pixel-events'
import { getDeviceFingerprint, createBehaviorTracker, type BehaviorTracker } from '@/lib/fraud-shield/client-signals'
import { useTurnstile } from '@/lib/fraud-shield/use-turnstile'
import { colorHex, isLightHex, colorRemaining, sizeRemaining } from '@/lib/variants'
import { Loader2, CheckCircle, ShoppingBag, Truck, Check, CreditCard, Banknote } from 'lucide-react'

type CreatedOrder = {
  id: string
  order_number: string
  total_price: number
  wilaya: string
  commune: string
  color: string | null
  quantity: number
  customer_name: string
}

function validateAlgerianPhone(phone: string) {
  const digits = phone.replace(/\s/g, '')
  return /^(05|06|07)\d{8}$/.test(digits)
}

interface Props {
  product: Product | null
  store: Store
  landingPageId?: string
  overridePrice?: number
  isRTL?: boolean
  onSuccess?: () => void
  upsell?: { enabled: boolean; text: string | null; product_name: string | null; price: number | null }
}

export default function OrderFormFields({
  product, store, landingPageId, overridePrice, isRTL = false, onSuccess, upsell,
}: Props) {
  const theme = store.theme?.config
  const primary = theme?.colors.primary ?? '#3B82F6'
  const bg = theme?.colors.card ?? '#111118'
  const text = theme?.colors.text ?? '#FFFFFF'
  const textMuted = theme?.colors.textMuted ?? '#9CA3AF'
  const border = theme?.colors.border ?? 'rgba(255,255,255,0.1)'

  const unitPrice = overridePrice ?? product?.price ?? 0
  const upsellActive = upsell?.enabled && upsell.price && upsell.price > 0
  const [upsellChecked, setUpsellChecked] = useState(false)
  const upsellPrice = upsellActive ? (upsell!.price ?? 0) : 0

  const variantStock = product?.variant_stock ?? null
  // Default to the first IN-STOCK variant (an untracked pool → treat every
  // option as available). Falls back to the first option if all are sold out.
  const firstAvailable = (names: string[] | undefined, kind: 'colors' | 'sizes'): string => {
    if (!names || names.length === 0) return ''
    const inStock = names.find(n => {
      const rem = kind === 'colors' ? colorRemaining(variantStock, n) : sizeRemaining(variantStock, n)
      return rem === null || rem > 0
    })
    return inStock ?? names[0]
  }

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    wilaya: '',
    commune: '',
    color: firstAvailable(product?.colors, 'colors'),
    size: firstAvailable(product?.sizes, 'sizes'),
    quantity: 1,
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
  const onlinePaymentAvailable = !!store.online_payment_enabled
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'online'>('cod')
  const [deliveryType, setDeliveryType] = useState<'home' | 'desk'>('home')
  // Merchant-level kill switch (dashboard → settings). Absent = enabled.
  const stopdeskEnabled = store.settings?.stopdeskEnabled !== false
  const [fee, setFee] = useState<{ key: string; home: number | null; desk: number | null } | null>(null)

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

  const mode = store.settings?.deliveryPricingMode ?? 'wilaya'
  const freeDeliveryThreshold = store.settings?.freeDeliveryThreshold ?? 0

  // Live delivery fees are external data fetched from /api/storefront/delivery-fees.
  // The fee is keyed by destination (feeKey): the displayed fee and the loading
  // flag are DERIVED at render from whether the latest fetch matches the current
  // key, so the effect never has to synchronously reset state — it only writes
  // state from async callbacks (which is what the set-state-in-effect rule allows).
  const feeKey = !form.wilaya || !store.id || mode === 'flat' ? '' : `${store.id}:${form.wilaya}`
  const fetchingFee = feeKey !== '' && fee?.key !== feeKey
  const dynamicDeliveryFee = feeKey === '' || fee?.key !== feeKey
    ? null
    : { home: fee.home, desk: fee.desk }

  useEffect(() => {
    if (!feeKey) return
    let cancelled = false
    fetch(`/api/storefront/delivery-fees?storeId=${store.id}&toWilaya=${encodeURIComponent(form.wilaya)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return
        if (data && (typeof data.homeFee === 'number' || typeof data.deskFee === 'number')) {
          setFee({ key: feeKey, home: data.homeFee ?? null, desk: data.deskFee ?? null })
        } else {
          setFee({ key: feeKey, home: null, desk: null })
        }
      })
      .catch(() => { if (!cancelled) setFee({ key: feeKey, home: null, desk: null }) })
    return () => { cancelled = true }
  }, [feeKey, store.id, form.wilaya])

  // Fire InitiateCheckout once when this order component becomes visible with
  // a real product. Meta and TikTok both auto-dedupe within the same session,
  // but keep an explicit guard so a re-render doesn't spam duplicates.
  const initiateCheckoutFired = useRef(false)
  useEffect(() => {
    if (initiateCheckoutFired.current) return
    if (!product?.id) return
    initiateCheckoutFired.current = true
    trackInitiateCheckout(
      { id: product.id, name: product.name, price: unitPrice },
      form.quantity,
    )
    // Intentionally NOT re-firing on quantity/product changes — one event per
    // customer session on this form is the right cadence for ad optimization.
  }, [product?.id])

  // Abandoned-cart capture: once a visitor has entered a valid name + phone but
  // hasn't submitted after a short delay, record an 'abandoned' lead (deduped
  // server-side). If they later order, reconciliation counts it as recovered.
  const abandonedFired = useRef(false)
  useEffect(() => {
    if (abandonedFired.current || success) return
    const name = form.customer_name.trim()
    const phone = form.customer_phone.trim()
    if (name.length < 2 || !validateAlgerianPhone(phone)) return
    const t = setTimeout(() => {
      if (abandonedFired.current || success) return
      abandonedFired.current = true
      fetch('/api/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: store.id,
          landing_page_id: landingPageId ?? null,
          name, phone,
          wilaya: form.wilaya || null,
          abandoned: true,
        }),
      }).catch(() => {})
      // Mid-funnel lead signal for Meta/TikTok — useful for Custom Audiences.
      if (product) {
        trackLead({ id: product.id, name: product.name, price: unitPrice })
      } else {
        trackLead()
      }
    }, 8000)
    return () => clearTimeout(t)
  }, [form.customer_name, form.customer_phone, form.wilaya, success, store.id, landingPageId])

  // Fallback precedence for static (non-live) delivery pricing, both types:
  // 1. merchant-custom rate for this wilaya (store.settings.deliveryRates /
  //    deliveryRatesStopdesk, set via the dashboard settings editor)
  // 2. merchant-custom store-wide default (`.default` on the same object)
  // 3. built-in per-wilaya default (DEFAULT_DELIVERY_RATES / _STOPDESK in
  //    lib/wilayas.ts) — covers stores that haven't configured rates yet
  // 4. built-in generic default (DEFAULT_DELIVERY_RATES_STOPDESK.default,
  //    or the legacy store.settings.deliveryPrice for home)
  // Stop-desk deliberately never falls all the way through to the HOME
  // default — a store with no stop-desk config at all still gets a real
  // stop-desk price, not the (usually higher) home-delivery price.
  const rates = store.settings?.deliveryRates
  const stopdeskRates = store.settings?.deliveryRatesStopdesk
  const defaultRate = rates?.default ?? Number(store.settings?.deliveryPrice ?? 600)
  const defaultStopdeskRate = stopdeskRates?.default ?? DEFAULT_DELIVERY_RATES_STOPDESK.default ?? defaultRate
  const wilayaRate = form.wilaya && rates && mode === 'wilaya'
    ? (rates[form.wilaya] ?? defaultRate)
    : defaultRate
  const wilayaStopdeskRate = form.wilaya && mode === 'wilaya'
    ? (stopdeskRates?.[form.wilaya] ?? DEFAULT_DELIVERY_RATES_STOPDESK[form.wilaya] ?? defaultStopdeskRate)
    : defaultStopdeskRate
  const staticRateForType = deliveryType === 'desk' ? wilayaStopdeskRate : wilayaRate
  const dynamicFeeForType = deliveryType === 'desk' ? (dynamicDeliveryFee?.desk ?? null) : (dynamicDeliveryFee?.home ?? null)

  // Quantity is capped by the tightest applicable stock: the chosen colour's
  // pool, the chosen size's pool, then the product's general stock. Untracked
  // pools contribute no cap (Infinity).
  const colorMax = colorRemaining(variantStock, form.color)
  const sizeMax = sizeRemaining(variantStock, form.size)
  const variantMax = Math.min(colorMax ?? Infinity, sizeMax ?? Infinity)
  const maxQty = Number.isFinite(variantMax) ? variantMax : (product?.stock ?? 999)
  const outOfStock = maxQty <= 0

  const subtotal = unitPrice * form.quantity
  const rawDelivery = form.wilaya
    ? (mode === 'wilaya' && dynamicFeeForType !== null ? dynamicFeeForType : staticRateForType)
    : 0
  // Apply free delivery threshold: if the subtotal meets or exceeds the
  // merchant's configured threshold, delivery is free.
  const isFreeDelivery = freeDeliveryThreshold > 0 && subtotal >= freeDeliveryThreshold
  const finalDelivery = isFreeDelivery ? 0 : rawDelivery
  const upsellTotal = upsellChecked ? upsellPrice : 0
  const total = subtotal + finalDelivery + upsellTotal

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      behaviorTrackerRef.current?.recordInput()
      setForm(f => ({ ...f, [k]: e.target.value }))
    }

  // A commune from the previous wilaya is very likely invalid for the new one
  // (different dataset, or none at all), so clear it on every wilaya change.
  const handleWilayaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    behaviorTrackerRef.current?.recordInput()
    const wilaya = e.target.value
    setForm(f => ({ ...f, wilaya, commune: '' }))
  }

  const inputStyle = {
    width: '100%',
    padding: '12px 16px',
    borderRadius: '12px',
    background: 'rgba(255,255,255,0.05)',
    border: `1px solid ${border}`,
    color: text,
    outline: 'none',
    fontSize: '14px',
  } as const

  const handleSubmit = async () => {
    if (!form.customer_name.trim()) {
      setError(isRTL ? 'الاسم مطلوب' : 'Le nom est requis.')
      return
    }
    if (!validateAlgerianPhone(form.customer_phone)) {
      setError(isRTL ? 'رقم الهاتف غير صحيح (05/06/07 + 8 أرقام)' : 'Numéro invalide (05/06/07 + 8 chiffres).')
      return
    }
    if (!form.wilaya) {
      setError(isRTL ? 'الولاية مطلوبة' : 'La wilaya est requise.')
      return
    }
    if (!form.commune.trim()) {
      setError(isRTL ? 'البلدية مطلوبة' : 'La commune est requise.')
      return
    }
    if (product?.custom_note_required && !form.notes.trim()) {
      const noteLabel = product.custom_note_label || (isRTL ? 'الملاحظة' : 'La note')
      setError(isRTL ? `${noteLabel} مطلوبة` : `${noteLabel} est requise.`)
      return
    }

    setSubmitting(true)
    setError('')
    // A/B variant this visitor was served (set by the landing page), if any.
    const variant = landingPageId
      ? (document.cookie.match(new RegExp(`lpv_${landingPageId}=([AB])`))?.[1] ?? null)
      : null

    // Goes through /api/orders (server-side, admin client) rather than
    // inserting straight from the browser: reading the new row back requires a
    // SELECT policy, and `orders` intentionally has none for anonymous
    // visitors, so a direct client insert+select always failed RLS.
    let created: CreatedOrder | null = null
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: store.id,
          product_id: product?.id ?? null,
          landing_page_id: landingPageId ?? null,
          variant,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          wilaya: form.wilaya,
          commune: form.commune,
          color: form.color || null,
          size: form.size || null,
          quantity: form.quantity,
          unit_price: unitPrice,
          delivery_price: finalDelivery,
          delivery_type: deliveryType,
          total_price: total,
          source: landingPageId ? 'landing_page' : 'form',
          notes: form.notes || null,
          ...(fraudShieldEnabled ? {
            turnstile_token: turnstileToken,
            device_fingerprint: deviceFingerprint,
            ...behaviorTrackerRef.current?.getSignals(),
          } : {}),
        }),
      })
      const payload = await res.json().catch(() => null)
      if (!res.ok) {
        setError(payload?.error || (isRTL ? 'حدث خطأ. حاول مرة أخرى.' : 'Erreur lors de la commande. Réessayez.'))
        setSubmitting(false)
        return
      }
      created = payload.order as CreatedOrder
    } catch (err) {
      console.error('[OrderFormFields] order request failed:', err)
      setError(isRTL ? 'حدث خطأ. حاول مرة أخرى.' : 'Erreur lors de la commande. Réessayez.')
      setSubmitting(false)
      return
    }
    // Fire-and-forget: sync the new order to the store's Google Sheet (if configured).
    if (created?.id) {
      fetch('/api/integrations/sheets/notify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: created.id }),
      }).catch(() => {})

      // THE conversion event. Meta/TikTok campaigns optimize on this — without
      // it, ads can only optimize for traffic, not actual purchases.
      // Identify BEFORE the Purchase event so hashed phone is attached to it
      // (Advanced Matching) — critical for iOS/ITP visitors whose pixel cookie
      // gets dropped, which otherwise silently rots attribution.
      identifyForPixels({ phone: form.customer_phone })
      trackPurchase({
        id: created.id,
        totalPrice: created.total_price,
        productId: product?.id ?? null,
        productName: product?.name ?? null,
        quantity: form.quantity,
      })
    }

    // Online payment: hand off to the store's own SlickPay checkout instead of
    // showing the COD confirmation screen. The order already exists (unpaid);
    // the webhook/return route flips it to paid once SlickPay confirms.
    if (paymentMethod === 'online' && created?.id) {
      try {
        const payRes = await fetch('/api/orders/pay', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: created.id }),
        })
        const payPayload = await payRes.json().catch(() => null)
        if (payRes.ok && payPayload?.checkoutUrl) {
          window.location.href = payPayload.checkoutUrl
          return
        }
        setError(isRTL ? 'تعذر تفعيل الدفع عبر الإنترنت. تم تسجيل طلبك، سنتواصل معك.' : "Impossible d'initier le paiement en ligne. Votre commande est enregistrée, nous vous contacterons.")
      } catch {
        setError(isRTL ? 'تعذر تفعيل الدفع عبر الإنترنت. تم تسجيل طلبك، سنتواصل معك.' : "Impossible d'initier le paiement en ligne. Votre commande est enregistrée, nous vous contacterons.")
      }
      setSubmitting(false)
      return
    }

    setCreatedOrder(created as CreatedOrder | null)
    setSuccess(true)
    setSubmitting(false)
    onSuccess?.()
  }

  if (success) {
    const waLink =
      createdOrder && store.settings?.whatsapp
        ? buildWaLink(
            store.settings.whatsapp,
            customerConfirmMessage(
              orderMessageVars(createdOrder, {
                storeName: store.name,
                productName: product?.name ?? null,
              })
            )
          )
        : null

    return (
      <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
        <div className="w-16 h-16 rounded-full flex items-center justify-center"
          style={{ background: `${primary}20` }}>
          <CheckCircle size={32} style={{ color: primary }} />
        </div>
        <div>
          <p className="font-bold text-lg" style={{ color: text }}>
            {isRTL ? 'تم تأكيد طلبك!' : 'Commande confirmée !'}
          </p>
          <p className="text-sm mt-1" style={{ color: textMuted }}>
            {isRTL
              ? `شكراً ${form.customer_name.split(' ')[0]}! سنتصل بك على ${form.customer_phone}`
              : `Merci ${form.customer_name.split(' ')[0]} ! Nous vous contacterons au ${form.customer_phone}.`}
          </p>
        </div>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-transform hover:scale-[1.02]"
            style={{ background: '#25D366' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
            {isRTL ? 'أكّد طلبك على واتساب' : 'Confirmer sur WhatsApp'}
          </a>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {product?.colors && product.colors.length > 0 && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'اللون' : 'Couleur'}
            {form.color && <span style={{ color: text }} className="normal-case tracking-normal font-semibold"> · {form.color}</span>}
          </label>
          <div className="flex flex-wrap gap-2.5">
            {product.colors.map(c => {
              const rem = colorRemaining(variantStock, c)
              const soldOut = rem !== null && rem <= 0
              const selected = form.color === c
              const hex = colorHex(c)
              return (
                <button
                  key={c}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setForm(f => ({ ...f, color: c, quantity: 1 }))}
                  title={soldOut ? `${c} — ${isRTL ? 'نفد المخزون' : 'épuisé'}` : c + (rem !== null ? ` — ${rem}` : '')}
                  className="relative rounded-full transition-transform hover:scale-110 disabled:cursor-not-allowed"
                  style={{
                    width: 34, height: 34, background: hex,
                    border: isLightHex(hex) ? '1px solid rgba(0,0,0,0.18)' : `1px solid ${border}`,
                    boxShadow: selected ? `0 0 0 2px ${bg}, 0 0 0 4px ${primary}` : 'none',
                    opacity: soldOut ? 0.35 : 1,
                  }}
                >
                  {selected && <Check size={15} style={{ color: isLightHex(hex) ? '#111' : '#fff', position: 'absolute', inset: 0, margin: 'auto' }} />}
                  {soldOut && <span style={{ position: 'absolute', inset: 0, margin: 'auto', width: '140%', height: 1, background: textMuted, transform: 'rotate(-45deg)', top: '50%' }} />}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {product?.sizes && product.sizes.length > 0 && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'المقاس' : 'Taille'}
          </label>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map(s => {
              const rem = sizeRemaining(variantStock, s)
              const soldOut = rem !== null && rem <= 0
              const selected = form.size === s
              return (
                <button
                  key={s}
                  type="button"
                  disabled={soldOut}
                  onClick={() => setForm(f => ({ ...f, size: s, quantity: 1 }))}
                  className="min-w-[46px] px-3 py-2 rounded-xl text-sm font-bold transition-all disabled:cursor-not-allowed"
                  style={{
                    background: selected ? primary : 'rgba(255,255,255,0.05)',
                    color: selected ? bg : text,
                    border: `1px solid ${selected ? primary : border}`,
                    opacity: soldOut ? 0.35 : 1,
                    textDecoration: soldOut ? 'line-through' : 'none',
                  }}
                >
                  {s}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'الكمية' : 'Quantité'}
        </label>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setForm(f => ({ ...f, quantity: Math.max(1, f.quantity - 1) }))}
            className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold hover:opacity-70 transition-opacity"
            style={{ borderColor: border, color: text }}>
            −
          </button>
          <span className="text-lg font-bold w-8 text-center" style={{ color: text }}>
            {form.quantity}
          </span>
          <button
            onClick={() => setForm(f => ({ ...f, quantity: Math.min(maxQty || 999, f.quantity + 1) }))}
            className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold hover:opacity-70 transition-opacity"
            style={{ borderColor: border, color: text }}>
            +
          </button>
          {Number.isFinite(variantMax) && !outOfStock && (
            <span className="text-xs" style={{ color: textMuted }}>
              {maxQty} {isRTL ? 'متوفر' : 'disponible' + (maxQty > 1 ? 's' : '')}
            </span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'الاسم الكامل *' : 'Nom complet *'}
        </label>
        <input
          value={form.customer_name}
          onChange={set('customer_name')}
          placeholder={isRTL ? 'أميرة بن علي' : 'Amira Benali'}
          style={inputStyle}
        />
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'رقم الهاتف *' : 'Téléphone *'}
        </label>
        <input
          type="tel"
          value={form.customer_phone}
          onChange={set('customer_phone')}
          placeholder="0555 XX XX XX"
          style={inputStyle}
        />
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'الولاية *' : 'Wilaya *'}
        </label>
        <select value={form.wilaya} onChange={handleWilayaChange} style={inputStyle}>
          <option value="" style={{ background: bg }}>
            {isRTL ? 'اختر ولايتك' : 'Sélectionner votre wilaya'}
          </option>
          {WILAYAS.map(w => (
            <option key={w} value={w} style={{ background: bg }}>{w}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {isRTL ? 'البلدية *' : 'Commune *'}
        </label>
        {(() => {
          const communes = getCommunesForWilaya(form.wilaya)
          return communes.length > 0 ? (
            <select value={form.commune} onChange={set('commune')} style={inputStyle}>
              <option value="" style={{ background: bg }}>
                {isRTL ? 'اختر بلديتك' : 'Sélectionner votre commune'}
              </option>
              {communes.map(c => (
                <option key={c} value={c} style={{ background: bg }}>{c}</option>
              ))}
            </select>
          ) : (
            <input
              value={form.commune}
              onChange={set('commune')}
              placeholder={isRTL ? 'بلديتك' : 'Votre commune'}
              style={inputStyle}
            />
          )
        })()}
      </div>

      {/* Delivery type — merchant can disable stop-desk entirely (settings) */}
      {stopdeskEnabled && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'طريقة التوصيل' : 'Mode de livraison'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'home' as const, label: isRTL ? 'إلى المنزل' : 'Domicile' },
              { key: 'desk' as const, label: isRTL ? 'نقطة استلام (Stop-desk)' : 'Stop-desk' },
            ]).map(opt => {
              const selected = deliveryType === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setDeliveryType(opt.key)}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: selected ? `${primary}1a` : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${selected ? primary : border}`,
                    color: selected ? primary : text,
                  }}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Customer note */}
      <div>
        <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
          {product?.custom_note_label
            ? `${product.custom_note_label}${product.custom_note_required ? ' *' : ''}`
            : (product?.custom_note_required
              ? (isRTL ? 'ملاحظة *' : 'Note *')
              : (isRTL ? 'ملاحظة (اختياري)' : 'Note (optionnel)'))}
        </label>
        <textarea
          value={form.notes}
          onChange={set('notes')}
          maxLength={120}
          rows={2}
          placeholder={product?.custom_note_placeholder || (isRTL ? 'أضف ملاحظة أو تفاصيل إضافية…' : 'Ajoutez une note ou des détails supplémentaires…')}
          style={{
            ...inputStyle,
            resize: 'none' as const,
          }}
        />
      </div>

      {/* Upsell */}
      {upsellActive && (
        <div
          className="rounded-xl p-4 flex items-center gap-3 cursor-pointer select-none"
          style={{ background: `${primary}08`, border: `2px solid ${upsellChecked ? primary : border}`, transition: 'border-color 0.2s' }}
          onClick={() => setUpsellChecked(c => !c)}
        >
          <div
            className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 transition-all"
            style={{ background: upsellChecked ? primary : 'rgba(255,255,255,0.08)', border: `1.5px solid ${upsellChecked ? primary : border}` }}
          >
            {upsellChecked && <span style={{ color: bg, fontSize: 11, fontWeight: 900 }}>✓</span>}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: text }}>
              {upsell!.text ?? (isRTL ? `أضف ${upsell!.product_name} بـ` : `Ajouter ${upsell!.product_name} pour`)}
            </p>
            <p className="text-xs font-black mt-0.5" style={{ color: primary }}>
              +{Number(upsellPrice).toLocaleString('fr-DZ')} DA
            </p>
          </div>
        </div>
      )}

      {/* Price summary */}
      <div className="rounded-xl p-4 space-y-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${border}` }}>
        <div className="flex justify-between text-sm" style={{ color: textMuted }}>
          <span>
            {isRTL
              ? `المجموع الجزئي (${form.quantity} × ${Number(unitPrice).toLocaleString('fr-DZ')} دج)`
              : `Sous-total (${form.quantity} × ${Number(unitPrice).toLocaleString('fr-DZ')} DA)`}
          </span>
          <span style={{ color: text }}>{subtotal.toLocaleString('fr-DZ')} DA</span>
        </div>
        <div className="flex justify-between text-sm" style={{ color: textMuted }}>
          <span className="flex items-center gap-1.5">
            <Truck size={13} /> {isRTL ? 'التوصيل' : 'Livraison'}
          </span>
          <span style={{ color: isFreeDelivery ? '#22c55e' : text }} className="flex items-center gap-2">
            {fetchingFee && <Loader2 size={12} className="animate-spin" />}
            {!fetchingFee && form.wilaya
              ? (isFreeDelivery
                ? (isRTL ? 'مجاني' : 'Gratuit')
                : `${finalDelivery.toLocaleString('fr-DZ')} DA`)
              : (!fetchingFee ? '—' : '')}
          </span>
        </div>
        {upsellChecked && upsellActive && (
          <div className="flex justify-between text-sm" style={{ color: textMuted }}>
            <span>+ {upsell!.product_name ?? 'Upsell'}</span>
            <span style={{ color: primary }}>+{upsellPrice.toLocaleString('fr-DZ')} DA</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-lg pt-1"
          style={{ borderTop: `1px solid ${border}`, color: text }}>
          <span>{isRTL ? 'المجموع' : 'Total'}</span>
          <span style={{ color: primary }}>{total.toLocaleString('fr-DZ')} DA</span>
        </div>
      </div>

      {fraudShieldEnabled && <div ref={turnstileRef} />}

      {onlinePaymentAvailable && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'طريقة الدفع' : 'Paiement'}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'cod' as const, icon: Banknote, label: isRTL ? 'عند الاستلام' : 'À la livraison' },
              { key: 'online' as const, icon: CreditCard, label: isRTL ? 'بطاقة (CIB/Edahabia)' : 'Carte (CIB/Edahabia)' },
            ]).map(opt => {
              const selected = paymentMethod === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPaymentMethod(opt.key)}
                  className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{
                    background: selected ? `${primary}1a` : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${selected ? primary : border}`,
                    color: selected ? primary : text,
                  }}
                >
                  <opt.icon size={15} />
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || outOfStock}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
          color: bg,
          boxShadow: `0 8px 24px ${primary}40`,
        }}>
        {submitting
          ? <Loader2 size={18} className="animate-spin" />
          : outOfStock
          ? (isRTL ? 'نفد المخزون' : 'Rupture de stock')
          : (
            <>
              {paymentMethod === 'online' ? <CreditCard size={18} /> : <ShoppingBag size={18} />}
              {paymentMethod === 'online'
                ? (isRTL ? `الدفع الآن — ${total.toLocaleString('fr-DZ')} دج` : `Payer maintenant — ${total.toLocaleString('fr-DZ')} DA`)
                : (isRTL ? `اطلب الآن — ${total.toLocaleString('fr-DZ')} دج` : `Commander — ${total.toLocaleString('fr-DZ')} DA`)}
            </>
          )}
      </button>
    </div>
  )
}
