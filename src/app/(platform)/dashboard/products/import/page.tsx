'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { PLAN_PRODUCT_LIMITS, type Plan } from '@/types/database'
import Link from 'next/link'
import {
  ArrowLeft, Download, Package, DollarSign, Image as ImageIcon,
  Check, AlertCircle, Loader2, ExternalLink
} from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface ImportedProduct {
  name: string
  description: string | null
  price: number
  images: string[]
  colors: string[]
  sizes: string[]
  slug: string
}

export default function ImportYouCanPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [product, setProduct] = useState<ImportedProduct | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleFetch = async () => {
    if (!url.trim()) { setError(t('productImport.errorEnterUrl')); return }
    setLoading(true)
    setError('')
    setProduct(null)

    const res = await fetch('/api/products/import-youcan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error ?? t('productImport.errorImportFailed')); return }
    setProduct(data)
  }

  const handleSave = async () => {
    if (!product) return
    setSaving(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const store = await resolveActiveStore(supabase, user.id, 'id, plan') as { id: string, plan: Plan } | null
    if (!store) { setSaving(false); setError(t('productImport.errorStoreNotFound')); return }

    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', store.id)
    const limit = PLAN_PRODUCT_LIMITS[store.plan] ?? Infinity
    if (count !== null && count >= limit) {
      setError(t('productImport.errorLimitReached', { limit }))
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('products').insert({
      store_id: store.id,
      name: product.name,
      description: product.description,
      price: product.price,
      images: product.images,
      colors: product.colors.length > 0 ? product.colors : null,
      sizes: product.sizes.length > 0 ? product.sizes : null,
      slug: product.slug,
      stock: 100,
      is_active: true,
    })

    setSaving(false)
    if (insertError) { setError(t('productImport.errorSaveFailed')); return }
    setSaved(true)
    setTimeout(() => router.push('/dashboard/products'), 1500)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/products" className="p-2 rounded-xl bg-dash-surface-2 hover:bg-dash-border text-dash-ink-soft hover:text-dash-ink transition-all">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('productImport.title')}</h1>
          <p className="text-dash-ink-soft text-sm mt-0.5">{t('productImport.subtitle')}</p>
        </div>
      </div>

      {/* URL input */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 space-y-4">
        <label className="block text-xs text-dash-ink-soft uppercase tracking-wider">{t('productImport.urlLabel')}</label>
        <div className="flex gap-3">
          <input
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleFetch()}
            placeholder={t('productImport.urlPlaceholder')}
            className="flex-1 px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm"
          />
          <button
            onClick={handleFetch}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm transition-all disabled:opacity-50 flex-shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {loading ? t('productImport.importing') : t('productImport.import')}
          </button>
        </div>
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm">
            <AlertCircle size={14} />
            {error}
          </div>
        )}
        <div className="flex items-start gap-2 text-xs text-dash-ink-faint">
          <ExternalLink size={11} className="mt-0.5 flex-shrink-0" />
          <span>{t('productImport.exampleLabel')} <code className="text-dash-ink-soft">https://example.youcan.shop/products/produit-nom</code></span>
        </div>
      </div>

      {/* Preview */}
      {product && (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
          <div className="px-6 py-4 border-b border-dash-border flex items-center justify-between">
            <h3 className="text-dash-ink font-semibold">{t('productImport.previewTitle')}</h3>
            <span className="text-xs text-dash-success bg-dash-success-soft px-2 py-1 rounded-lg font-semibold">{t('productImport.readyToImport')}</span>
          </div>

          {/* Images */}
          {product.images.length > 0 && (
            <div className="px-6 pt-5">
              <p className="text-xs text-dash-ink-soft uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <ImageIcon size={11} /> {t('productImport.imagesCount', { count: product.images.length, plural: product.images.length > 1 ? 's' : '' })}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Product ${i + 1}`}
                    className="w-20 h-20 object-cover rounded-xl flex-shrink-0 bg-dash-surface-2"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="p-6 space-y-4">
            {/* Name */}
            <div>
              <label className="block text-xs text-dash-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Package size={11} /> {t('productImport.nameLabel')}
              </label>
              <input
                value={product.name}
                onChange={e => setProduct(p => p ? { ...p, name: e.target.value } : p)}
                className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
            </div>

            {/* Price */}
            <div>
              <label className="block text-xs text-dash-ink-soft uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <DollarSign size={11} /> {t('productImport.priceLabel')}
              </label>
              <input
                type="number"
                value={product.price}
                onChange={e => setProduct(p => p ? { ...p, price: Number(e.target.value) } : p)}
                className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm"
              />
            </div>

            {/* Description */}
            {product.description && (
              <div>
                <label className="block text-xs text-dash-ink-soft uppercase tracking-wider mb-1.5">{t('productImport.descriptionLabel')}</label>
                <textarea
                  value={product.description}
                  onChange={e => setProduct(p => p ? { ...p, description: e.target.value } : p)}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-all text-sm resize-none"
                />
              </div>
            )}

            {/* Colors & sizes */}
            {(product.colors.length > 0 || product.sizes.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {product.colors.length > 0 && (
                  <div>
                    <label className="block text-xs text-dash-ink-soft uppercase tracking-wider mb-1.5">{t('productImport.colorsDetected')}</label>
                    <p className="text-sm text-dash-ink">{product.colors.join(', ')}</p>
                  </div>
                )}
                {product.sizes.length > 0 && (
                  <div>
                    <label className="block text-xs text-dash-ink-soft uppercase tracking-wider mb-1.5">{t('productImport.sizesDetected')}</label>
                    <p className="text-sm text-dash-ink">{product.sizes.join(', ')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-60 ${saved ? 'bg-dash-success' : 'bg-dash-accent hover:bg-dash-accent-dark'}`}
            >
              {saving ? (
                <><Loader2 size={16} className="animate-spin" /> {t('productImport.saving')}</>
              ) : saved ? (
                <><Check size={16} /> {t('productImport.imported')}</>
              ) : (
                <><Check size={16} /> {t('productImport.addToStore')}</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
