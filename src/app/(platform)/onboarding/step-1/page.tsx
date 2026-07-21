'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { currentStoreParam, isNewStoreIntent, stepUrl } from '@/lib/onboarding'
import { ArrowRight, Loader2, Check, X } from 'lucide-react'

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30)
}

export default function OnboardingStep1() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugEdited, setSlugEdited] = useState(false)
  const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Auto-generate slug from name
  useEffect(() => {
    if (!slugEdited && name) {
      setSlug(slugify(name))
    }
  }, [name, slugEdited])

  // Check slug availability
  useEffect(() => {
    if (!slug) { setSlugStatus('idle'); return }
    setSlugStatus('checking')
    const timer = setTimeout(async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('stores')
        .select('id')
        .eq('slug', slug)
        .single()
      setSlugStatus(data ? 'taken' : 'available')
    }, 500)
    return () => clearTimeout(timer)
  }, [slug])

  const handleNext = async () => {
    if (!name.trim()) { setError('Le nom de la boutique est requis.'); return }
    if (!slug.trim()) { setError('Le slug est requis.'); return }
    if (slugStatus === 'taken') { setError('Ce slug est déjà utilisé.'); return }

    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }

    // Which store are we editing? An explicit ?store= param (resumed/edited store),
    // otherwise the owner's in-progress store — UNLESS ?new=1 (agency adding a store),
    // in which case we always create a fresh one instead of touching an existing store.
    let storeId = currentStoreParam()
    if (!storeId && !isNewStoreIntent()) {
      const { data: inProgress } = await supabase
        .from('stores')
        .select('id')
        .eq('owner_id', user.id)
        .eq('is_onboarded', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      storeId = (inProgress?.id as string | undefined) ?? null
    }

    if (storeId) {
      // Update the store we're onboarding
      await supabase.from('stores').update({ name, slug }).eq('id', storeId)
    } else {
      // Additional boutique? Request the owner's plan so it isn't stuck on Basic.
      // A DB trigger (026_activation_gate.sql) has the final say: it only keeps the
      // requested plan if the owner already has an ACTIVE paid store on it (Agency
      // trust inheritance) — otherwise the store is created as Basic + 'inactive'
      // subscription_status, locked out of the dashboard until the activation
      // payment is confirmed. plan/credits/status passed here are just a request.
      const { data: primary } = await supabase
        .from('stores')
        .select('plan')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      const isAdditional = !!primary
      const { data: created, error: insertError } = await supabase.from('stores').insert({
        owner_id: user.id,
        name,
        slug,
        plan: isAdditional ? (primary!.plan as string) : 'basic',
        chatbot_daily_limit: 0,
        is_onboarded: false,
      }).select('id').single()
      if (insertError || !created) {
        setError('Erreur lors de la création. Réessayez.')
        setLoading(false)
        return
      }
      storeId = created.id as string
      fetch('/api/notify/admin-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new_store', id: storeId }),
      }).catch(() => {})
    }

    router.push(stepUrl('step-2', storeId))
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-73px)] px-4 py-12">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-12">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === 1
                ? 'bg-dash-accent text-white'
                : 'bg-dash-surface-2 border border-dash-border text-dash-ink-faint'
            }`}>
              {step}
            </div>
            {step < 4 && <div className="w-8 h-px bg-dash-border" />}
          </div>
        ))}
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="dash-font-heading text-2xl font-medium text-dash-ink mb-2">Nommez votre boutique</h1>
          <p className="text-dash-ink-soft text-sm">Ce nom apparaîtra sur votre boutique en ligne</p>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-6 space-y-5 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
          {error && (
            <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
              Nom de la boutique
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Moda Alger, Tissus Royaux..."
              maxLength={60}
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
              Adresse de votre boutique
            </label>
            <div className="flex rounded-xl overflow-hidden border border-dash-border focus-within:border-dash-accent/50 transition-all">
              <div className="px-3 py-3 bg-dash-surface-2 text-dash-ink-faint text-sm border-r border-dash-border whitespace-nowrap flex items-center">
                krenix.store/
              </div>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlugEdited(true)
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 30))
                }}
                placeholder="mon-store"
                className="flex-1 px-3 py-3 bg-transparent text-dash-ink placeholder-dash-ink-faint outline-none text-sm"
              />
              <div className="px-3 flex items-center">
                {slugStatus === 'checking' && <Loader2 size={14} className="text-dash-ink-faint animate-spin" />}
                {slugStatus === 'available' && <Check size={14} className="text-dash-success" />}
                {slugStatus === 'taken' && <X size={14} className="text-dash-danger" />}
              </div>
            </div>
            {slugStatus === 'taken' && (
              <p className="text-xs text-dash-danger mt-1.5">Ce slug est déjà pris. Essayez un autre.</p>
            )}
            {slugStatus === 'available' && (
              <p className="text-xs text-dash-success mt-1.5">Disponible ✓</p>
            )}
          </div>

          <button
            onClick={handleNext}
            disabled={loading || slugStatus === 'taken' || slugStatus === 'checking'}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <>Continuer <ArrowRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  )
}
