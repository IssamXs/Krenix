'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowRight, ArrowLeft, Upload, Loader2, Image as ImageIcon } from 'lucide-react'

export default function OnboardingStep2() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 2 * 1024 * 1024) {
      setError('Image trop lourde (max 2MB)')
      return
    }

    setUploading(true)
    setError('')

    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `logos/${Date.now()}.${ext}`

    const { data, error: uploadError } = await supabase.storage
      .from('store-logos')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setError('Erreur lors de l\'envoi. Vérifiez les permissions du bucket Supabase.')
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('store-logos').getPublicUrl(data.path)
    setLogoUrl(urlData.publicUrl)
    setUploading(false)
  }

  const handleNext = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    if (logoUrl) {
      await supabase.from('stores').update({ logo_url: logoUrl }).eq('owner_id', user.id)
    }

    router.push('/onboarding/step-3')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-4 py-12">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-12">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step < 2
                ? 'bg-[#3B82F6]/20 border border-[#3B82F6]/40 text-[#3B82F6]'
                : step === 2
                ? 'bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-black'
                : 'bg-white/5 border border-white/10 text-gray-600'
            }`}>
              {step < 2 ? '✓' : step}
            </div>
            {step < 4 && <div className={`w-8 h-px ${step < 2 ? 'bg-[#3B82F6]/30' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Logo de votre boutique</h1>
          <p className="text-gray-500 text-sm">Optionnel — vous pouvez l'ajouter plus tard</p>
        </div>

        <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Upload zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative border-2 border-dashed border-white/15 hover:border-[#3B82F6]/40 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all group"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-24 h-24 object-contain rounded-xl" />
            ) : (
              <>
                <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-[#3B82F6]/30 group-hover:bg-[#3B82F6]/5 transition-all">
                  {uploading ? (
                    <Loader2 size={22} className="text-[#3B82F6] animate-spin" />
                  ) : (
                    <ImageIcon size={22} className="text-gray-500 group-hover:text-[#3B82F6] transition-colors" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-white text-sm font-medium">
                    {uploading ? 'Envoi en cours…' : 'Cliquez pour ajouter votre logo'}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">PNG, JPG, SVG — max 2MB</p>
                </div>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
          </div>

          {logoUrl && (
            <button
              onClick={() => setLogoUrl(null)}
              className="w-full text-xs text-gray-500 hover:text-red-400 transition-colors py-2"
            >
              Supprimer le logo
            </button>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push('/onboarding/step-1')}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleNext}
              disabled={saving || uploading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black transition-all hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <>{logoUrl ? 'Continuer' : 'Passer cette étape'} <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
