'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { PLAN_PRODUCT_LIMITS, type Plan } from '@/types/database'
import { ArrowLeft, Loader2, Plus, Trash2 } from 'lucide-react'
import PriceSuggestion from '@/components/dashboard/PriceSuggestion'

export default function NewProductPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '', description: '', price: '', compare_price: '', stock: '',
    colors: '', sizes: '', meta_title: '', meta_description: '',
  })
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const store = await resolveActiveStore(supabase, user.id, 'id, plan') as { id: string, plan: Plan } | null
    if (!store) { setError('Boutique introuvable.'); setSaving(false); return }

    const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('store_id', store.id)
    const limit = PLAN_PRODUCT_LIMITS[store.plan] ?? Infinity
    if (count !== null && count >= limit) {
      setError(`Limite atteinte. Votre plan permet un maximum de ${limit} produits. Veuillez passer à un abonnement supérieur pour ajouter plus de produits.`)
      setSaving(false)
      return
    }

    const { error: insertError } = await supabase.from('products').insert({
      store_id: store.id,
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      compare_price: form.compare_price ? Number(form.compare_price) : null,
      stock: Number(form.stock) || 0,
      images,
      colors: form.colors.split(',').map(c => c.trim()).filter(Boolean),
      sizes: form.sizes.split(',').map(s => s.trim()).filter(Boolean),
      is_active: true,
      meta_title: form.meta_title || null,
      meta_description: form.meta_description || null,
    })

    if (insertError) {
      setError('Erreur lors de la création. Réessayez.')
      setSaving(false)
      return
    }

    router.push('/dashboard/products')
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/products')}
          className="p-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Nouveau produit</h1>
          <p className="text-dash-ink-soft text-sm">Ajoutez les informations de votre produit</p>
        </div>
      </div>

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

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Stock</label>
          <input type="number" value={form.stock} onChange={set('stock')} placeholder="20"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>
      </div>

      {/* Variants */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
        <h3 className="text-dash-ink font-semibold text-sm">Variantes</h3>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Couleurs (séparées par virgule)</label>
          <input value={form.colors} onChange={set('colors')} placeholder="Bordeaux, Emeraude, Crème, Gris Perle"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>

        <div>
          <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">Tailles (séparées par virgule)</label>
          <input value={form.sizes} onChange={set('sizes')} placeholder="S, M, L, XL ou 140x240, 160x260"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all" />
        </div>
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
        {saving ? <Loader2 size={18} className="animate-spin" /> : 'Créer le produit'}
      </button>
    </div>
  )
}
