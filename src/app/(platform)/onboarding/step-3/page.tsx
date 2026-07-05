'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveOnboardingStoreId, stepUrl, currentStoreParam } from '@/lib/onboarding'
import { ArrowRight, ArrowLeft, Loader2, Check, Lock } from 'lucide-react'
import type { Theme } from '@/types/database'

export default function OnboardingStep3() {
  const router = useRouter()
  const [themes, setThemes] = useState<Theme[]>([])
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('themes').select('*').eq('is_active', true).order('tier_required').then(({ data }) => {
      setThemes(data ?? [])
      setLoading(false)
    })
  }, [])

  const handleNext = async () => {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    const storeId = await resolveOnboardingStoreId(supabase, user.id)
    if (selectedThemeId && storeId) {
      await supabase.from('stores').update({ theme_id: selectedThemeId }).eq('id', storeId)
    }

    router.push(stepUrl('step-4', storeId))
  }

  const PREVIEW_COLORS: Record<string, { bg: string; accent: string; card: string }> = {
    classique: { bg: '#0A0A0F', accent: '#3B82F6', card: '#111118' },
    sombre:    { bg: '#000000', accent: '#FFFFFF', card: '#0D0D0D' },
    chaleureux:{ bg: '#1A1209', accent: '#2563EB', card: '#241A0E' },
    'flash-sale': { bg: '#0A0000', accent: '#EF4444', card: '#1A0000' },
    luxe:      { bg: '#0A0800', accent: '#D4AF37', card: '#141000' },
    moderne:   { bg: '#050510', accent: '#818CF8', card: '#0D0D1A' },
    'minimaliste-pro': { bg: '#FAFAFA', accent: '#111111', card: '#FFFFFF' },
    colore:    { bg: '#0A0015', accent: '#A855F7', card: '#130020' },
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-4 py-12">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-12">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step < 3
                ? 'bg-[#3B82F6]/20 border border-[#3B82F6]/40 text-[#3B82F6]'
                : step === 3
                ? 'bg-gradient-to-br from-[#3B82F6] to-[#2563EB] text-black'
                : 'bg-white/5 border border-white/10 text-gray-600'
            }`}>
              {step < 3 ? '✓' : step}
            </div>
            {step < 4 && <div className={`w-8 h-px ${step < 3 ? 'bg-[#3B82F6]/30' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Choisissez votre thème</h1>
          <p className="text-gray-500 text-sm">Les thèmes Pro/Ultimate sont disponibles après mise à niveau</p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={28} className="animate-spin text-gray-500" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {themes.map((theme) => {
              const preview = PREVIEW_COLORS[theme.slug] ?? { bg: '#111', accent: '#3B82F6', card: '#1a1a1a' }
              const isLocked = theme.tier_required !== 'basic'
              const isSelected = selectedThemeId === theme.id

              return (
                <div
                  key={theme.id}
                  onClick={() => !isLocked && setSelectedThemeId(theme.id)}
                  className={`relative rounded-2xl overflow-hidden border-2 transition-all cursor-pointer ${
                    isLocked
                      ? 'border-white/5 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'border-[#3B82F6] shadow-lg shadow-[#3B82F6]/20'
                      : 'border-white/10 hover:border-white/30'
                  }`}
                >
                  {/* Preview */}
                  <div className="h-28 p-3 relative" style={{ background: preview.bg }}>
                    {/* Fake nav */}
                    <div className="flex gap-1 mb-2">
                      <div className="h-1.5 w-8 rounded-full" style={{ background: preview.accent }} />
                      <div className="h-1.5 w-5 rounded-full bg-white/10" />
                      <div className="h-1.5 w-5 rounded-full bg-white/10" />
                    </div>
                    {/* Fake cards */}
                    <div className="grid grid-cols-2 gap-1.5">
                      {[1, 2].map((i) => (
                        <div key={i} className="rounded p-1.5" style={{ background: preview.card, border: `1px solid rgba(255,255,255,0.08)` }}>
                          <div className="h-5 rounded mb-1 bg-white/10" />
                          <div className="h-1.5 w-3/4 rounded" style={{ background: preview.accent, opacity: 0.6 }} />
                        </div>
                      ))}
                    </div>
                    {isLocked && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <Lock size={18} className="text-white/60" />
                      </div>
                    )}
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#3B82F6] flex items-center justify-center">
                        <Check size={12} className="text-black" />
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-white/5">
                    <div className="flex items-center justify-between">
                      <p className="text-white text-sm font-medium">{theme.name}</p>
                      {isLocked ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20">
                          {theme.tier_required}
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-gray-500">Gratuit</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => router.push(stepUrl('step-2', currentStoreParam()))}
            className="flex items-center gap-2 px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={handleNext}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black transition-all hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <>{selectedThemeId ? 'Continuer' : 'Passer cette étape'} <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
