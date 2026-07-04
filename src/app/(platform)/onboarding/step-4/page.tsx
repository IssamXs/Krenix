'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ArrowLeft, Loader2, Plus, X, Upload } from 'lucide-react'
import { WILAYAS } from '@/lib/wilayas'

export default function OnboardingStep4() {
  const router = useRouter()
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    colors: '',
    stock: '',
  })
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()
    const path = `products/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { data, error: upErr } = await supabase.storage.from('product-images').upload(path, file)
    if (!upErr && data) {
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(data.path)
      setImageUrl(urlData.publicUrl)
    }
    setUploading(false)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le nom du produit est requis.'); return }
    if (!form.price || isNaN(Number(form.price))) { setError('Le prix est invalide.'); return }

    setSaving(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const { data: store } = await supabase
      .from('stores')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!store) { setError('Boutique introuvable.'); setSaving(false); return }

    // Create product
    const colors = form.colors.split(',').map(c => c.trim()).filter(Boolean)
    await supabase.from('products').insert({
      store_id: store.id,
      name: form.name,
      description: form.description || null,
      price: Number(form.price),
      images: imageUrl ? [imageUrl] : [],
      colors,
      stock: Number(form.stock) || 0,
      is_active: true,
    })

    // Mark store as onboarded
    await supabase.from('stores').update({ is_onboarded: true }).eq('id', store.id)

    router.push('/onboarding/complete')
  }

  const handleSkip = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    await supabase.from('stores').update({ is_onboarded: true }).eq('owner_id', user.id)
    router.push('/onboarding/complete')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-4 py-12">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-12">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step < 4
                ? 'bg-[#3B82F6]/20 border border-[#3B82F6]/40 text-[#3B82F6]'
                : step === 4
                ? 'bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-black'
                : 'bg-white/5 border border-white/10 text-gray-600'
            }`}>
              {step < 4 ? '✓' : step}
            </div>
            {step < 4 && <div className={`w-8 h-px ${step < 4 ? 'bg-[#3B82F6]/30' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Votre premier produit</h1>
          <p className="text-gray-500 text-sm">Vous pourrez en ajouter d'autres depuis le tableau de bord</p>
        </div>

        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Image upload */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Photo du produit</label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/15 hover:border-[#3B82F6]/40 cursor-pointer transition-all">
              {imageUrl ? (
                <img src={imageUrl} alt="Produit" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  {uploading ? <Loader2 size={20} className="animate-spin text-gray-500" /> : <Upload size={20} className="text-gray-500" />}
                </div>
              )}
              <div>
                <p className="text-white text-sm">{imageUrl ? 'Changer la photo' : 'Ajouter une photo'}</p>
                <p className="text-gray-500 text-xs mt-0.5">PNG, JPG — max 5MB</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Nom du produit *</label>
            <input
              value={form.name} onChange={set('name')}
              placeholder="Ex: Cache Rideau Velours Bordeaux"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Prix (DZD) *</label>
              <input
                type="number" value={form.price} onChange={set('price')}
                placeholder="3500"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Stock</label>
              <input
                type="number" value={form.stock} onChange={set('stock')}
                placeholder="20"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Couleurs (séparées par virgule)</label>
            <input
              value={form.colors} onChange={set('colors')}
              placeholder="Bordeaux, Emeraude, Crème"
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">Description</label>
            <textarea
              value={form.description} onChange={set('description')}
              placeholder="Décrivez votre produit..."
              rows={3}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push('/onboarding/step-3')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black transition-all hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <>Créer et terminer <ArrowRight size={16} /></>}
            </button>
          </div>

          <button onClick={handleSkip} disabled={saving} className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors py-1">
            Passer cette étape
          </button>
        </div>
      </div>
    </div>
  )
}
