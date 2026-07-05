'use client'

import { useState, useEffect, useRef } from 'react'
import type { Product, Store } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { WILAYAS } from '@/lib/wilayas'
import { buildWaLink, customerConfirmMessage, orderMessageVars } from '@/lib/whatsapp'
import { Loader2, CheckCircle, ShoppingBag, Truck } from 'lucide-react'

type CreatedOrder = {
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

  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    wilaya: '',
    commune: '',
    color: product?.colors?.[0] ?? '',
    size: product?.sizes?.[0] ?? '',
    quantity: 1,
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)

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
    }, 8000)
    return () => clearTimeout(t)
  }, [form.customer_name, form.customer_phone, form.wilaya, success, store.id, landingPageId])

  const rates = store.settings?.deliveryRates
  const wilayaRate = form.wilaya && rates
    ? (rates[form.wilaya] ?? rates.default ?? Number(store.settings?.deliveryPrice ?? 600))
    : (rates?.default ?? Number(store.settings?.deliveryPrice ?? 600))
  const subtotal = unitPrice * form.quantity
  const finalDelivery = form.wilaya ? wilayaRate : 0
  const upsellTotal = upsellChecked ? upsellPrice : 0
  const total = subtotal + finalDelivery + upsellTotal

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

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

    setSubmitting(true)
    setError('')
    const supabase = createClient()
    const { data: created, error: insertError } = await supabase.from('orders').insert({
      store_id: store.id,
      product_id: product?.id ?? null,
      landing_page_id: landingPageId ?? null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone,
      wilaya: form.wilaya,
      commune: form.commune,
      color: form.color || null,
      size: form.size || null,
      quantity: form.quantity,
      unit_price: unitPrice,
      delivery_price: finalDelivery,
      total_price: total,
      status: 'pending',
      source: landingPageId ? 'landing_page' : 'form',
      notes: form.notes || null,
    }).select('id, order_number, total_price, wilaya, commune, color, quantity, customer_name').single()

    if (insertError) {
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
          </label>
          <select value={form.color} onChange={set('color')} style={inputStyle}>
            {product.colors.map(c => (
              <option key={c} value={c} style={{ background: bg }}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {product?.sizes && product.sizes.length > 0 && (
        <div>
          <label className="block text-xs mb-2 uppercase tracking-wider" style={{ color: textMuted }}>
            {isRTL ? 'المقاس' : 'Taille'}
          </label>
          <select value={form.size} onChange={set('size')} style={inputStyle}>
            {product.sizes.map(s => (
              <option key={s} value={s} style={{ background: bg }}>{s}</option>
            ))}
          </select>
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
            onClick={() => setForm(f => ({ ...f, quantity: Math.min(product?.stock ?? 999, f.quantity + 1) }))}
            className="w-10 h-10 rounded-xl border flex items-center justify-center text-lg font-bold hover:opacity-70 transition-opacity"
            style={{ borderColor: border, color: text }}>
            +
          </button>
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
        <select value={form.wilaya} onChange={set('wilaya')} style={inputStyle}>
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
        <input
          value={form.commune}
          onChange={set('commune')}
          placeholder={isRTL ? 'بلديتك' : 'Votre commune'}
          style={inputStyle}
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
          <span style={{ color: text }}>
            {form.wilaya ? `${finalDelivery.toLocaleString('fr-DZ')} DA` : '—'}
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

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-base transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
        style={{
          background: `linear-gradient(135deg, ${primary}, ${primary}cc)`,
          color: bg,
          boxShadow: `0 8px 24px ${primary}40`,
        }}>
        {submitting
          ? <Loader2 size={18} className="animate-spin" />
          : (
            <>
              <ShoppingBag size={18} />
              {isRTL
                ? `اطلب الآن — ${total.toLocaleString('fr-DZ')} دج`
                : `Commander — ${total.toLocaleString('fr-DZ')} DA`}
            </>
          )}
      </button>
    </div>
  )
}
