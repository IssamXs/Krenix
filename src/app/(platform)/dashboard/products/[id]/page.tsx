'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Plus, Star, Trash2, AlertCircle, ToggleLeft, ToggleRight } from 'lucide-react'
import PriceSuggestion from '@/components/dashboard/PriceSuggestion'
import VariantStockEditor, { type VariantState } from '@/components/dashboard/VariantStockEditor'
import { sumStock } from '@/lib/variants'
import type { DeliveryProvider, Plan, StoreSettings } from '@/types/database'
import { COURIERS } from '@/lib/couriers'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { BADGE_CATALOG, canUseBadges, formatBadgeLabel } from '@/lib/product-badges'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

export default function EditProductPage() {
  const { t } = useI18n()
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string

  const [form, setForm] = useState({
    name: '', description: '', price: '', compare_price: '', stock: '',
    meta_title: '', meta_description: '', custom_note_label: '', custom_note_placeholder: '',
  })
  const [customNoteRequired, setCustomNoteRequired] = useState(false)
  const [showDescription, setShowDescription] = useState(true)
  const [variants, setVariants] = useState<VariantState>({ colors: [], sizes: [], variantStock: { colors: {}, sizes: {} } })
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [storeId, setStoreId] = useState<string | null>(null)
  const [connectedProviders, setConnectedProviders] = useState<DeliveryProvider[]>([])
  const [preferredProvider, setPreferredProvider] = useState<DeliveryProvider | ''>('')
  const [storePlan, setStorePlan] = useState<Plan | null>(null)
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [badges, setBadges] = useState<string[]>([])
  const [showBadgeEmojis, setShowBadgeEmojis] = useState(false)

  useEffect(() => {
    fetch('/api/integrations/delivery')
      .then(r => (r.ok ? r.json() : null))
      .then(d => setConnectedProviders((d?.connections ?? []).map((c: { provider: DeliveryProvider }) => c.provider)))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!storeId) return
    const supabase = createClient()
    supabase.from('stores').select('plan, settings').eq('id', storeId).single().then(({ data }) => {
      if (!data) return
      setStorePlan(data.plan)
      setStoreSettings(data.settings)
      setShowBadgeEmojis(!!data.settings?.showBadgeEmojis)
    })
  }, [storeId])

  useEffect(() => {
    const supabase = createClient()
    supabase.from('products').select('*').eq('id', productId).single().then(({ data, error: err }) => {
      if (err || !data) { router.push('/dashboard/products'); return }
      setStoreId(data.store_id)
      setForm({
        name: data.name,
        description: data.description ?? '',
        price: String(data.price),
        compare_price: data.compare_price ? String(data.compare_price) : '',
        stock: String(data.stock),
        meta_title: data.meta_title ?? '',
        meta_description: data.meta_description ?? '',
        custom_note_label: data.custom_note_label ?? '',
        custom_note_placeholder: data.custom_note_placeholder ?? '',
      })
      setCustomNoteRequired(!!data.custom_note_required)
      setShowDescription(data.show_description !== false)
      setBadges(data.badges ?? [])
      const vs = data.variant_stock ?? { colors: {}, sizes: {} }
      setVariants({
        colors: data.colors ?? [],
        sizes: data.sizes ?? [],
        variantStock: { colors: vs.colors ?? {}, sizes: vs.sizes ?? {} },
      })
      setImages(data.images ?? [])
      setPreferredProvider((data.preferred_delivery_provider as DeliveryProvider | null) ?? '')
      setLoading(false)
    })
  }, [productId, router])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length) return
    setUploading(true)
    const supabase = createClient()
    const newUrls: string[] = []
    for (const file of files) {
      const path = `products/${Date.now()}-${Math.random().toString(36).slice(2)}.${file.name.split('.').pop()}`
      const { data, error: upErr } = await supabase.storage.from('product-images').upload(path, file)
      if (!upErr && data) {
        const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(data.path)
        newUrls.push(urlData.publicUrl)
      }
    }
    setImages(prev => [...prev, ...newUrls])
    setUploading(false)
  }

  const moveImage = (from: number, to: number) => {
    setImages(prev => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('productNew.errorNameRequired')); return }
    if (!form.price || isNaN(Number(form.price))) { setError(t('productNew.errorInvalidPrice')); return }

    setSaving(true)
    setError('')

    const supabase = createClient()
    // store_id filter is defense-in-depth on top of RLS (already scoped to
    // the caller's own store) — belt-and-suspenders against a future RLS
    // regression.
    const hasVariants = variants.colors.length > 0 || variants.sizes.length > 0
    const generalStock = hasVariants
      ? (variants.sizes.length > 0 ? sumStock(variants.variantStock.sizes) : sumStock(variants.variantStock.colors))
      : (Number(form.stock) || 0)

    let query = supabase.from('products').update({
      name: form.name,
      description: form.description || null,
      show_description: showDescription,
      price: Number(form.price),
      compare_price: form.compare_price ? Number(form.compare_price) : null,
      stock: generalStock,
      images,
      colors: variants.colors,
      sizes: variants.sizes,
      variant_stock: hasVariants ? variants.variantStock : null,
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
      custom_note_label: form.custom_note_label || null,
      custom_note_required: customNoteRequired,
      custom_note_placeholder: form.custom_note_placeholder || null,
      preferred_delivery_provider: preferredProvider || null,
      badges,
    }).eq('id', productId)
    if (storeId) query = query.eq('store_id', storeId)
    const { error: updateError } = await query

    if (updateError) {
      setError(t('productEdit.errorUpdateFailed'))
      setSaving(false)
      return
    }

    if (storeId && storeSettings && storePlan && canUseBadges(storePlan) && showBadgeEmojis !== !!storeSettings.showBadgeEmojis) {
      const { error: settingsError } = await supabase.from('stores')
        .update({ settings: { ...storeSettings, showBadgeEmojis } })
        .eq('id', storeId)
      if (settingsError) {
        setError(t('productEdit.errorBadgeEmojiSaveFailed'))
        setSaving(false)
        return
      }
    }

    router.push('/dashboard/products')
  }

  const handleDelete = async () => {
    setDeleting(true)
    const supabase = createClient()
    let query = supabase.from('products').update({ is_active: false, stock: 0 }).eq('id', productId)
    if (storeId) query = query.eq('store_id', storeId)
    await query
    router.push('/dashboard/products')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={28} className="animate-spin text-dash-accent" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/products')}
            className="p-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('productEdit.title')}</h1>
            <p className="text-dash-ink-soft text-sm">{t('productEdit.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dash-danger/20 text-dash-danger hover:bg-dash-danger-soft transition-all text-sm"
        >
          <Trash2 size={15} />
          {t('productEdit.delete')}
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 rounded-[20px] p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-dash-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-dash-ink text-sm font-medium">{t('productEdit.confirmDeleteTitle')}</p>
            <p className="text-dash-ink-soft text-xs mt-1">{t('productEdit.confirmDeleteHint')}</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-dash-danger text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : t('productEdit.confirm')}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-1.5 rounded-lg border border-dash-border text-dash-ink-soft text-xs hover:text-dash-ink transition-all"
              >
                {t('productEdit.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {/* Images */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.photos')}</h3>
        <div className="flex flex-wrap gap-3">
          {images.map((url, idx) => (
            <div key={idx} className={`relative w-20 h-20 rounded-xl overflow-hidden group ${idx === 0 ? 'ring-2 ring-dash-accent' : ''}`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
              {idx === 0 && (
                <div className="absolute top-0 inset-x-0 bg-dash-accent text-dash-surface text-[9px] font-bold uppercase tracking-wide text-center py-0.5 flex items-center justify-center gap-1">
                  <Star size={9} fill="currentColor" /> {t('productNew.firstPhoto')}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx - 1)}
                  disabled={idx === 0}
                  aria-label={t('productNew.moveLeft')}
                  className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronLeft size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => moveImage(idx, idx + 1)}
                  disabled={idx === images.length - 1}
                  aria-label={t('productNew.moveRight')}
                  className="p-1 rounded text-white hover:bg-white/20 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                >
                  <ChevronRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                  aria-label={t('productNew.removePhoto')}
                  className="p-1 rounded text-white hover:bg-red-500/80 transition-colors"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-dash-border hover:border-dash-accent/40 flex flex-col items-center justify-center cursor-pointer transition-all group">
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-dash-ink-soft" />
            ) : (
              <>
                <Plus size={18} className="text-dash-ink-soft group-hover:text-dash-accent transition-colors" />
                <span className="text-[10px] text-dash-ink-faint mt-1">{t('productNew.add')}</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Infos */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.generalInfo')}</h3>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.nameLabel')}</label>
          <input value={form.name} onChange={set('name')} placeholder={t('productNew.namePlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-dash-ink-soft uppercase tracking-wider">{t('productNew.descriptionLabel')}</label>
            <button
              type="button"
              onClick={() => setShowDescription(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                showDescription
                  ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-faint'
              }`}
            >
              {showDescription ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {showDescription ? t('productNew.showDescriptionOn') : t('productNew.showDescriptionOff')}
            </button>
          </div>
          <textarea value={form.description} onChange={set('description')} rows={4} placeholder={t('productNew.descriptionPlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none" />
          <p className="mt-1.5 text-xs text-dash-ink-soft">{t('productNew.showDescriptionHint')}</p>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs text-dash-ink-soft uppercase tracking-wider">
              {t('productNew.customNoteLabel')} <span className="lowercase font-normal text-dash-ink-faint">({t('productNew.optional')})</span>
            </label>
            <button
              type="button"
              onClick={() => setCustomNoteRequired(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                customNoteRequired
                  ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-faint'
              }`}
            >
              {customNoteRequired ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {customNoteRequired ? t('productNew.customNoteRequiredOn') : t('productNew.customNoteRequiredOff')}
            </button>
          </div>
          <input
            type="text"
            value={form.custom_note_label}
            onChange={set('custom_note_label')}
            placeholder={t('productNew.customNotePlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
          />
          <p className="mt-1.5 text-xs text-dash-ink-soft">{t('productNew.customNoteHint')}</p>

          <label className="block text-xs text-dash-ink-soft mb-2 mt-3 uppercase tracking-wider">
            {t('productNew.customNoteExampleLabel')} <span className="lowercase font-normal text-dash-ink-faint">({t('productNew.optional')})</span>
          </label>
          <input
            type="text"
            value={form.custom_note_placeholder}
            onChange={set('custom_note_placeholder')}
            placeholder={t('productNew.customNoteExamplePlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
          />
          <p className="mt-1.5 text-xs text-dash-ink-soft">{t('productNew.customNoteExampleHint')}</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.priceLabel')}</label>
            <input type="number" value={form.price} onChange={set('price')} placeholder="3500"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.comparePriceLabel')}</label>
            <input type="number" value={form.compare_price} onChange={set('compare_price')} placeholder="4500"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
          </div>
        </div>

        <PriceSuggestion onSelect={p => setForm(f => ({ ...f, price: String(p) }))} />

        {variants.colors.length === 0 && variants.sizes.length === 0 && (
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.stockLabel')}</label>
            <input type="number" value={form.stock} onChange={set('stock')} placeholder="20"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
            <p className="text-dash-ink-faint text-xs mt-1.5">{t('productNew.stockHint')}</p>
          </div>
        )}
      </div>

      {/* Variants */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.variantsTitle')}</h3>
        <VariantStockEditor value={variants} onChange={setVariants} />
      </div>

      {/* Badges */}
      {storePlan && canUseBadges(storePlan) ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-dash-ink font-semibold text-sm">{t('productEdit.badgesTitle')}</h3>
            <button
              type="button"
              onClick={() => setShowBadgeEmojis(v => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all ${
                showBadgeEmojis
                  ? 'border-dash-accent/40 bg-dash-accent-soft text-dash-accent'
                  : 'border-dash-border text-dash-ink-faint'
              }`}
            >
              {showBadgeEmojis ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
              {t('productEdit.badgesShowEmojis')}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {BADGE_CATALOG.map(b => {
              const active = badges.includes(b.id)
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setBadges(prev => active ? prev.filter(x => x !== b.id) : [...prev, b.id])}
                  className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                    active ? 'text-white border-transparent' : 'border-dash-border text-dash-ink-soft hover:border-dash-ink-faint/40'
                  }`}
                  style={active ? { background: b.color } : {}}
                >
                  {formatBadgeLabel(b, showBadgeEmojis)}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-dash-ink-faint">
            {t('productEdit.badgesHint')}
          </p>
        </div>
      ) : storePlan ? (
        <LockedFeatureCard title={t('productEdit.badgesTitle')} requiredPlan="Ultimate" />
      ) : null}

      {connectedProviders.length > 0 && (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
          <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.deliveryTitle')}</h3>
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.preferredCourierLabel')}</label>
            <select value={preferredProvider} onChange={e => setPreferredProvider(e.target.value as DeliveryProvider | '')}
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all">
              <option value="">{t('productNew.noPreference')}</option>
              {connectedProviders.map(p => (
                <option key={p} value={p}>{COURIERS[p]?.label ?? p}</option>
              ))}
            </select>
            <p className="text-xs text-dash-ink-faint mt-1.5">{t('productNew.preferredCourierHint')}</p>
          </div>
        </div>
      )}

      {/* SEO */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">{t('productNew.seoTitle')}</h3>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.seoTitleLabel')}</label>
          <input value={form.meta_title} onChange={set('meta_title')} placeholder={t('productNew.seoTitlePlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('productNew.seoDescriptionLabel')}</label>
          <textarea value={form.meta_description} onChange={set('meta_description')} rows={2} placeholder={t('productNew.seoDescriptionPlaceholder')}
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none" />
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-dash-accent hover:bg-dash-accent-dark text-white transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : t('productEdit.saveChanges')}
      </button>
    </div>
  )
}
