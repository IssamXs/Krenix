'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { PAYMENT_METHODS } from '@/lib/payment'
import { PLAN_LABELS, PLAN_AMOUNTS_DZD, type Plan } from '@/types/database'
import { Zap, Upload, Loader2, Check, AlertCircle, RefreshCw, CreditCard } from 'lucide-react'

interface MinimalStore { id: string; slug: string; plan: Plan; subscription_status: string }

export default function ActivatePage() {
  const router = useRouter()
  const [store, setStore] = useState<MinimalStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasPending, setHasPending] = useState(false)
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [checking, setChecking] = useState(false)
  const [payingOnline, setPayingOnline] = useState(false)
  const [onlineError, setOnlineError] = useState('')

  const payOnline = async () => {
    if (!store) return
    setPayingOnline(true); setOnlineError('')
    try {
      const res = await fetch('/api/payments/slickpay/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'plan', plan: store.plan }),
      })
      const d = await res.json()
      if (!res.ok || !d.checkoutUrl) {
        setOnlineError(d.code === 'NOT_CONFIGURED' ? 'Le paiement en ligne n’est pas encore activé.' : (d.error ?? 'Erreur de paiement'))
        setPayingOnline(false)
        return
      }
      window.location.href = d.checkoutUrl
    } catch {
      setOnlineError('Erreur réseau'); setPayingOnline(false)
    }
  }

  // `load` is reused by the "Vérifier mon statut" button; the initial mount call
  // is inlined below as a raw promise chain so setState happens inside the .then()
  // callback rather than synchronously in the effect body (react-hooks/set-state-in-effect).
  const load = async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/auth/login'); return }
    const active = await resolveActiveStore(supabase, user.id, 'id, slug, plan, subscription_status') as MinimalStore | null
    if (!active) { router.push('/onboarding/step-1'); return }
    if (active.subscription_status === 'active') { router.push('/dashboard'); return }
    setStore(active)

    const { data: pending } = await supabase
      .from('subscriptions')
      .select('id')
      .eq('store_id', active.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setHasPending(!!pending)
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const active = await resolveActiveStore(supabase, user.id, 'id, slug, plan, subscription_status') as MinimalStore | null
      if (!active) { router.push('/onboarding/step-1'); return }
      if (active.subscription_status === 'active') { router.push('/dashboard'); return }
      setStore(active)

      const { data: pending } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('store_id', active.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setHasPending(!!pending)
      setLoading(false)
    })
  }, [router])

  const handleProofUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const supabase = createClient()
    const path = `payment-proofs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
    const { data, error } = await supabase.storage.from('payment-proofs').upload(path, file)
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('payment-proofs').getPublicUrl(data.path)
      setProofUrl(urlData.publicUrl)
    }
    setUploading(false)
  }

  const submit = async () => {
    if (!store) return
    setSubmitting(true)
    const supabase = createClient()
    const { data: created } = await supabase.from('subscriptions').insert({
      store_id: store.id,
      plan: store.plan,
      amount_dzd: PLAN_AMOUNTS_DZD[store.plan] ?? 0,
      status: 'pending',
      payment_proof_url: proofUrl || null,
    }).select('id').single()
    if (created?.id) {
      fetch('/api/notify/admin-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'new_payment', id: created.id }),
      }).catch(() => {})
    }
    setSubmitted(true)
    setHasPending(true)
    setSubmitting(false)
  }

  const recheck = async () => {
    setChecking(true)
    await load()
    setChecking(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-dash-page">
      <Loader2 size={28} className="animate-spin text-dash-accent" />
    </div>
  )

  if (!store) return null

  const amount = PLAN_AMOUNTS_DZD[store.plan] ?? 0
  const showForm = !hasPending && !submitted

  return (
    <div className="min-h-screen bg-dash-page flex items-center justify-center px-4 py-12 dash-font-sans relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
      </div>
      <div className="w-full max-w-md space-y-6 relative z-10">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-dash-accent-soft">
            <Zap size={26} className="text-dash-accent" />
          </div>
          <h1 className="dash-font-heading text-2xl font-medium text-dash-ink">Activez votre boutique</h1>
          <p className="text-dash-ink-soft text-sm mt-2">
            Votre boutique <span className="text-dash-ink font-semibold">{store.slug}</span> est prête.
            Activez le plan <span className="text-dash-ink font-semibold">{PLAN_LABELS[store.plan]}</span> pour accéder à votre tableau de bord.
          </p>
        </div>

        {(hasPending || submitted) && (
          <div className="bg-dash-warning-soft border border-dash-warning/20 rounded-2xl p-6 text-center space-y-3">
            <p className="text-dash-warning-dark font-semibold">En attente de confirmation</p>
            <p className="text-dash-ink-soft text-sm">
              Votre paiement a été soumis. Votre boutique s&apos;active automatiquement dès sa vérification.
            </p>
            <button onClick={recheck} disabled={checking}
              className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-dash-surface-2 text-dash-ink-soft hover:bg-dash-border transition-all disabled:opacity-50">
              {checking ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Vérifier mon statut
            </button>
          </div>
        )}

        {showForm && (
          <div className="bg-dash-surface border border-dash-border rounded-[24px] p-6 space-y-5 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
            <div className="flex items-center justify-between">
              <p className="text-dash-ink font-semibold text-sm">Montant à payer</p>
              <p className="text-dash-accent font-black text-xl">{amount.toLocaleString('fr-DZ')} DZD</p>
            </div>

            {/* Online payment (instant) — SlickPay CIB / Edahabia */}
            {onlineError && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{onlineError}</div>}
            <button onClick={payOnline} disabled={payingOnline}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-all disabled:opacity-50">
              {payingOnline ? <Loader2 size={16} className="animate-spin" /> : <><CreditCard size={16} /> Payer en ligne (CIB / Edahabia)</>}
            </button>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-dash-border" />
              <span className="text-dash-ink-faint text-xs">ou payer manuellement</span>
              <div className="flex-1 h-px bg-dash-border" />
            </div>

            <div className="flex items-center justify-between">
              <p className="text-dash-ink font-semibold text-sm">Virement manuel</p>
            </div>
            <div className="bg-dash-surface-2 rounded-xl p-4 space-y-2 text-sm">
              <p className="text-dash-ink-soft font-medium">Effectuez le paiement vers :</p>
              <div className="space-y-2 text-dash-ink-soft">
                {PAYMENT_METHODS.map(m => (
                  <div key={m.value} className="flex items-center gap-2">
                    <span>{m.icon}</span>
                    <span className="text-dash-ink">{m.label}</span>
                    <span className="text-dash-ink-faint">— {m.note} :</span>
                    <span className="text-dash-ink font-mono font-semibold select-all">{m.value}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-dash-border pt-2 mt-2">
                <p className="text-dash-ink-faint text-xs flex items-center gap-1">
                  <AlertCircle size={11} className="flex-shrink-0" />
                  Incluez votre slug <span className="text-dash-ink font-mono">{store.slug}</span> comme référence
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">
                Capture d&apos;écran du paiement (recommandé)
              </label>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-dash-border hover:border-dash-accent/40 cursor-pointer transition-all">
                {proofUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proofUrl} alt="Preuve" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-dash-surface-2 flex items-center justify-center flex-shrink-0">
                    {uploading ? <Loader2 size={18} className="animate-spin text-dash-ink-faint" /> : <Upload size={18} className="text-dash-ink-faint" />}
                  </div>
                )}
                <div>
                  <p className="text-dash-ink text-sm">{proofUrl ? 'Changer la capture' : "Ajouter une capture d'écran"}</p>
                  <p className="text-dash-ink-faint text-xs">PNG, JPG</p>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} />
              </label>
            </div>
            <button onClick={submit} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-all disabled:opacity-50">
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={16} /> J&apos;ai effectué le paiement</>}
            </button>
          </div>
        )}

        <p className="text-center text-dash-ink-faint text-xs">
          Besoin d&apos;aide ? Contactez-nous sur WhatsApp pour une activation immédiate.
        </p>
      </div>
    </div>
  )
}
