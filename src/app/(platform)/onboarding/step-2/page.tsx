'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveOnboardingStoreId, stepUrl, currentStoreParam } from '@/lib/onboarding'
import { ArrowRight, ArrowLeft, Loader2, Image as ImageIcon } from 'lucide-react'

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

    const storeId = await resolveOnboardingStoreId(supabase, user.id)
    if (logoUrl && storeId) {
      await supabase.from('stores').update({ logo_url: logoUrl }).eq('id', storeId)
    }

    router.push(stepUrl('step-3', storeId))
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-4 py-12">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-12">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step < 2
                ? 'bg-dash-accent-soft border border-dash-accent/40 text-dash-accent'
                : step === 2
                ? 'bg-dash-accent text-white'
                : 'bg-dash-surface-2 border border-dash-border text-dash-ink-faint'
            }`}>
              {step < 2 ? '✓' : step}
            </div>
            {step < 4 && <div className={`w-8 h-px ${step < 2 ? 'bg-dash-accent/30' : 'bg-dash-border'}`} />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="dash-font-heading text-2xl font-medium text-dash-ink mb-2">Logo de votre boutique</h1>
          <p className="text-dash-ink-soft text-sm">Optionnel — vous pouvez l'ajouter plus tard</p>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-6 space-y-5 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
          {error && (
            <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {/* Upload zone */}
          <div
            onClick={() => fileRef.current?.click()}
            className="relative border-2 border-dashed border-dash-border hover:border-dash-accent/40 rounded-2xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all group"
          >
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="w-24 h-24 object-contain rounded-xl" />
            ) : (
              <>
                <div className="w-14 h-14 rounded-xl bg-dash-surface-2 border border-dash-border flex items-center justify-center group-hover:border-dash-accent/30 group-hover:bg-dash-accent-soft transition-all">
                  {uploading ? (
                    <Loader2 size={22} className="text-dash-accent animate-spin" />
                  ) : (
                    <ImageIcon size={22} className="text-dash-ink-faint group-hover:text-dash-accent transition-colors" />
                  )}
                </div>
                <div className="text-center">
                  <p className="text-dash-ink text-sm font-medium">
                    {uploading ? 'Envoi en cours…' : 'Cliquez pour ajouter votre logo'}
                  </p>
                  <p className="text-dash-ink-faint text-xs mt-1">PNG, JPG, SVG — max 2MB</p>
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
              className="w-full text-xs text-dash-ink-faint hover:text-dash-danger transition-colors py-2"
            >
              Supprimer le logo
            </button>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push(stepUrl('step-1', currentStoreParam()))}
              className="flex items-center gap-2 px-4 py-3 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint transition-all text-sm"
            >
              <ArrowLeft size={16} />
            </button>
            <button
              onClick={handleNext}
              disabled={saving || uploading}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={18} className="animate-spin" /> : <>{logoUrl ? 'Continuer' : 'Passer cette étape'} <ArrowRight size={16} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
