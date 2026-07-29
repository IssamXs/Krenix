'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Loader2, Plus, Trash2, AlertCircle } from 'lucide-react'
import PriceSuggestion from '@/components/dashboard/PriceSuggestion'
import VariantStockEditor, { type VariantState } from '@/components/dashboard/VariantStockEditor'
import { sumStock } from '@/lib/variants'

export default function EditProductPage() {
  const router = useRouter()
  const params = useParams()
  const productId = params.id as string

  const [form, setForm] = useState({
    name: '', description: '', price: '', compare_price: '', stock: '',
    meta_title: '', meta_description: '',
  })
  const [variants, setVariants] = useState<VariantState>({ colors: [], sizes: [], variantStock: { colors: {}, sizes: {} } })
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [storeId, setStoreId] = useState<string | null>(null)

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
      })
      const vs = data.variant_stock ?? { colors: {}, sizes: {} }
      setVariants({
        colors: data.colors ?? [],
        sizes: data.sizes ?? [],
        variantStock: { colors: vs.colors ?? {}, sizes: vs.sizes ?? {} },
      })
      setImages(data.images ?? [])
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

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le nom est requis.'); return }
    if (!form.price || isNaN(Number(form.price))) { setError('Le prix est invalide.'); return }

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
      price: Number(form.price),
      compare_price: form.compare_price ? Number(form.compare_price) : null,
      stock: generalStock,
      images,
      colors: variants.colors,
      sizes: variants.sizes,
      variant_stock: hasVariants ? variants.variantStock : null,
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
    }).eq('id', productId)
    if (storeId) query = query.eq('store_id', storeId)
    const { error: updateError } = await query

    if (updateError) {
      setError('Erreur lors de la mise à jour. Réessayez.')
      setSaving(false)
      return
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
            <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Modifier le produit</h1>
            <p className="text-dash-ink-soft text-sm">Mettez à jour les informations</p>
          </div>
        </div>
        <button
          onClick={() => setShowDeleteConfirm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dash-danger/20 text-dash-danger hover:bg-dash-danger-soft transition-all text-sm"
        >
          <Trash2 size={15} />
          Supprimer
        </button>
      </div>

      {/* Delete confirm */}
      {showDeleteConfirm && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 rounded-[20px] p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-dash-danger flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-dash-ink text-sm font-medium">Confirmer la suppression ?</p>
            <p className="text-dash-ink-soft text-xs mt-1">Le produit sera désactivé et masqué de votre boutique.</p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-dash-danger text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : 'Confirmer'}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-1.5 rounded-lg border border-dash-border text-dash-ink-soft text-xs hover:text-dash-ink transition-all"
              >
                Annuler
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
        <h3 className="text-dash-ink font-semibold text-sm">Photos du produit</h3>
        <div className="flex flex-wrap gap-3">
          {images.map((url, idx) => (
            <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden group">
              <img src={url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={16} className="text-white" />
              </button>
            </div>
          ))}
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-dash-border hover:border-dash-accent/40 flex flex-col items-center justify-center cursor-pointer transition-all group">
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-dash-ink-soft" />
            ) : (
              <>
                <Plus size={18} className="text-dash-ink-soft group-hover:text-dash-accent transition-colors" />
                <span className="text-[10px] text-dash-ink-faint mt-1">Ajouter</span>
              </>
            )}
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} disabled={uploading} />
          </label>
        </div>
      </div>

      {/* Infos */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">Informations générales</h3>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Nom du produit *</label>
          <input value={form.name} onChange={set('name')} placeholder="Ex: Cache Rideau Velours Bordeaux"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Description</label>
          <textarea value={form.description} onChange={set('description')} rows={4} placeholder="Décrivez votre produit en détail..."
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Prix (DZD) *</label>
            <input type="number" value={form.price} onChange={set('price')} placeholder="3500"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
          </div>
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Prix barré (DZD)</label>
            <input type="number" value={form.compare_price} onChange={set('compare_price')} placeholder="4500"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
          </div>
        </div>

        <PriceSuggestion onSelect={p => setForm(f => ({ ...f, price: String(p) }))} />

        {variants.colors.length === 0 && variants.sizes.length === 0 && (
          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Stock</label>
            <input type="number" value={form.stock} onChange={set('stock')} placeholder="20"
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
            <p className="text-dash-ink-faint text-xs mt-1.5">Ajoutez des couleurs / tailles ci-dessous pour suivre le stock par variante.</p>
          </div>
        )}
      </div>

      {/* Variants */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">Variantes &amp; stock</h3>
        <VariantStockEditor value={variants} onChange={setVariants} />
      </div>

      {/* SEO */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">SEO (optionnel)</h3>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Titre SEO</label>
          <input value={form.meta_title} onChange={set('meta_title')} placeholder="Titre pour les moteurs de recherche"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Description SEO</label>
          <textarea value={form.meta_description} onChange={set('meta_description')} rows={2} placeholder="Description pour les moteurs de recherche (max 160 caractères)"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all resize-none" />
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-dash-accent hover:bg-dash-accent-dark text-white transition-all disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : 'Enregistrer les modifications'}
      </button>
    </div>
  )
}
