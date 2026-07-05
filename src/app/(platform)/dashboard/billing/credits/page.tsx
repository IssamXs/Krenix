'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { CREDIT_PACKS, MESSAGE_PACKS, ULTIMATE_PLANS, type Plan, type TopupPack, type CreditPurchaseKind } from '@/types/database'
import { PAYMENT_METHODS } from '@/lib/payment'
import { Sparkles, MessageCircle, ArrowLeft, Upload, Loader2, AlertCircle, Lock, Check, CreditCard } from 'lucide-react'

interface AccountStore { id: string; slug: string; plan: Plan; ai_credits: number; purchased_credits: number; purchased_chatbot: number }

export default function BuyCreditsPage() {
  const router = useRouter()
  const [account, setAccount] = useState<AccountStore | null>(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<{ kind: CreditPurchaseKind; pack: TopupPack } | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [payingOnline, setPayingOnline] = useState(false)
  const [onlineError, setOnlineError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      // Top-ups attach to the account pool = owner's earliest store.
      const { data } = await supabase
        .from('stores')
        .select('id, slug, plan, ai_credits, purchased_credits, purchased_chatbot')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      setAccount((data as AccountStore | null) ?? null)
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
    if (!selected || !account) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('credit_purchases').insert({
      store_id: account.id,
      kind: selected.kind,
      quantity: selected.pack.quantity,
      amount_dzd: selected.pack.amountDzd,
      payment_proof_url: proofUrl || null,
      status: 'pending',
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  const payOnline = async () => {
    if (!selected) return
    setPayingOnline(true); setOnlineError('')
    try {
      const res = await fetch('/api/payments/chargily/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: selected.kind, quantity: selected.pack.quantity }),
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

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-[#3B82F6]" />
    </div>
  )

  const locked = !account || !ULTIMATE_PLANS.includes(account.plan)

  if (locked) {
    return (
      <div className="max-w-2xl space-y-6">
        <Link href="/dashboard/billing" className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm transition-colors">
          <ArrowLeft size={14} /> Retour à l&apos;abonnement
        </Link>
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-6 flex items-center gap-4">
          <Lock size={22} className="text-gray-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-white font-semibold">Recharges réservées aux plans Ultimate et plus</p>
            <p className="text-gray-500 text-sm mt-0.5">Passez à Ultimate pour acheter des crédits IA et des messages chatbot supplémentaires.</p>
          </div>
          <Link href="/dashboard/billing/upgrade" className="text-xs font-bold px-4 py-2 rounded-xl flex-shrink-0" style={{ background: '#F59E0B', color: '#000' }}>
            Passer à Ultimate
          </Link>
        </div>
      </div>
    )
  }

  // Plain render helper (not a component) to keep pack state/selection in this scope.
  const renderPacks = (kind: CreditPurchaseKind, packs: TopupPack[], accent: string, unit: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {packs.map(pack => {
        const isSel = selected?.kind === kind && selected.pack.quantity === pack.quantity
        return (
          <button
            key={pack.quantity}
            onClick={() => { setSelected({ kind, pack }); setProofUrl(''); setSubmitted(false) }}
            className="text-left rounded-2xl border p-5 transition-all hover:opacity-95"
            style={{ borderColor: isSel ? accent : 'rgba(255,255,255,0.08)', background: isSel ? `${accent}10` : '#111118' }}
          >
            <p className="text-white font-black text-2xl">{pack.quantity.toLocaleString('fr-DZ')}</p>
            <p className="text-gray-500 text-xs">{unit} · {pack.hint}</p>
            <p className="font-bold text-lg mt-3" style={{ color: accent }}>{pack.amountDzd.toLocaleString('fr-DZ')} DZD</p>
            {isSel && <span className="inline-flex items-center gap-1 text-[11px] font-bold mt-2" style={{ color: accent }}><Check size={12} /> Sélectionné</span>}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="max-w-4xl space-y-10 pb-16">
      <div>
        <Link href="/dashboard/billing" className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm transition-colors">
          <ArrowLeft size={14} /> Retour à l&apos;abonnement
        </Link>
        <h1 className="text-3xl font-black text-white mt-4">Recharger crédits & messages</h1>
        <p className="text-gray-400 text-sm mt-1">
          Solde partagé : <span className="text-[#3B82F6] font-semibold">{account!.ai_credits + account!.purchased_credits} crédits IA</span>
          {account!.purchased_chatbot > 0 && <> · <span className="text-emerald-400 font-semibold">{account!.purchased_chatbot} messages en réserve</span></>}
        </p>
      </div>

      {/* AI credit packs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-[#3B82F6]" />
          <h2 className="text-white font-bold">Crédits IA</h2>
          <span className="text-gray-500 text-xs">1 landing page = 5 crédits · 1 visuel pub = 1 crédit</span>
        </div>
        {renderPacks('ai_credits', CREDIT_PACKS, '#3B82F6', 'crédits')}
      </div>

      {/* Chatbot message packs */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-emerald-400" />
          <h2 className="text-white font-bold">Messages chatbot</h2>
          <span className="text-gray-500 text-xs">consommés une fois la limite quotidienne atteinte</span>
        </div>
        {renderPacks('chatbot_messages', MESSAGE_PACKS, '#10B981', 'messages')}
      </div>

      {/* Payment */}
      {selected && !submitted && (
        <div className="bg-[#111118] border border-[#3B82F6]/30 rounded-2xl p-6 space-y-5">
          <h3 className="text-white font-semibold flex items-center gap-2">
            <CreditCard size={18} className="text-[#3B82F6]" />
            Paiement — {selected.pack.label}
            <span className="ml-auto text-sm text-[#3B82F6] font-bold">{selected.pack.amountDzd.toLocaleString('fr-DZ')} DZD</span>
          </h3>

          {/* Online payment (instant) — Chargily CIB / Edahabia */}
          {onlineError && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{onlineError}</div>}
          <button onClick={payOnline} disabled={payingOnline}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}>
            {payingOnline ? <Loader2 size={16} className="animate-spin" /> : <><CreditCard size={16} /> Payer en ligne (CIB / Edahabia)</>}
          </button>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-gray-600 text-xs">ou payer manuellement</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm">
            <p className="text-gray-300 font-medium">Effectuez le paiement vers :</p>
            <div className="space-y-2 text-gray-400">
              {PAYMENT_METHODS.map(m => (
                <div key={m.value} className="flex items-center gap-2">
                  <span>{m.icon}</span>
                  <span className="text-white">{m.label}</span>
                  <span className="text-gray-500">— {m.note} :</span>
                  <span className="text-white font-mono font-semibold select-all">{m.value}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-white/10 pt-2 mt-2">
              <p className="text-gray-500 text-xs flex items-center gap-1">
                <AlertCircle size={11} /> Incluez votre slug <span className="text-white font-mono">{account!.slug}</span> comme référence
              </p>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Capture d&apos;écran du paiement (recommandé)</label>
            <label className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-white/15 hover:border-[#3B82F6]/40 cursor-pointer transition-all">
              {proofUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={proofUrl} alt="Preuve" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                  {uploading ? <Loader2 size={18} className="animate-spin text-gray-500" /> : <Upload size={18} className="text-gray-500" />}
                </div>
              )}
              <div>
                <p className="text-white text-sm">{proofUrl ? 'Changer la capture' : "Ajouter une capture d'écran"}</p>
                <p className="text-gray-500 text-xs">PNG, JPG</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} />
            </label>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setSelected(null)} className="px-4 py-3 rounded-xl text-sm font-semibold bg-white/5 text-gray-400 hover:bg-white/10 transition-all">
              Annuler
            </button>
            <button onClick={submit} disabled={submitting}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90 disabled:opacity-50" style={{ background: '#3B82F6', color: '#fff' }}>
              {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={16} /> J&apos;ai effectué le paiement</>}
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-6 text-center space-y-2">
          <p className="text-green-400 font-semibold text-lg">Demande envoyée !</p>
          <p className="text-gray-400 text-sm">Vos crédits seront ajoutés dès la vérification du paiement.</p>
          <p className="text-gray-500 text-xs">Contactez-nous sur WhatsApp pour une activation immédiate.</p>
        </div>
      )}
    </div>
  )
}
