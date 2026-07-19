'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { CREDIT_PACKS, MESSAGE_PACKS, ULTIMATE_PLANS, type Plan, type TopupPack, type CreditPurchaseKind } from '@/types/database'
import { PAYMENT_METHODS } from '@/lib/payment'
import { Sparkles, MessageCircle, ArrowLeft, Upload, Loader2, AlertCircle, Lock, Check, CreditCard } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'

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
      const { data } = await supabase
        .from('stores')
        .select('id, slug, plan, ai_credits, purchased_credits, purchased_chatbot')
        .eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
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
    const { data: created } = await supabase.from('credit_purchases').insert({
      store_id: account.id, kind: selected.kind, quantity: selected.pack.quantity,
      amount_dzd: selected.pack.amountDzd, payment_proof_url: proofUrl || null, status: 'pending',
    }).select('id').single()
    if (created?.id) {
      fetch('/api/notify/admin-event', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'new_topup', id: created.id }),
      }).catch(() => {})
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  const payOnline = async () => {
    if (!selected) return
    setPayingOnline(true); setOnlineError('')
    try {
      const res = await fetch('/api/payments/slickpay/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: selected.kind, quantity: selected.pack.quantity }),
      })
      const d = await res.json()
      if (!res.ok || !d.checkoutUrl) {
        setOnlineError(d.code === 'NOT_CONFIGURED' ? "Le paiement en ligne n'est pas encore activé." : (d.error ?? 'Erreur de paiement'))
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
      <Loader2 size={28} className="animate-spin text-dash-accent" />
    </div>
  )

  const locked = !account || !ULTIMATE_PLANS.includes(account.plan)

  if (locked) {
    return (
      <div className="max-w-2xl space-y-6">
        <Link href="/dashboard/billing" className="inline-flex items-center gap-2 text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">
          <ArrowLeft size={14} /> Retour à l&apos;abonnement
        </Link>
        <Card className="flex items-center gap-4">
          <Lock size={22} className="text-dash-ink-faint flex-shrink-0" />
          <div className="flex-1">
            <p className="text-dash-ink font-semibold">Recharges réservées aux plans Ultimate et plus</p>
            <p className="text-dash-ink-soft text-sm mt-0.5">Passez à Ultimate pour acheter des crédits IA et des messages chatbot supplémentaires.</p>
          </div>
          <Link href="/dashboard/billing/upgrade" className="text-xs font-bold px-4 py-2 rounded-xl flex-shrink-0 bg-dash-gold text-dash-ink hover:opacity-90 transition-opacity">
            Passer à Ultimate
          </Link>
        </Card>
      </div>
    )
  }

  const renderPacks = (kind: CreditPurchaseKind, packs: TopupPack[], accentClass: string, unit: string) => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {packs.map((pack, i) => {
        const isSel = selected?.kind === kind && selected.pack.quantity === pack.quantity
        return (
          <motion.button
            key={pack.quantity}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => { setSelected({ kind, pack }); setProofUrl(''); setSubmitted(false) }}
            className={`text-left rounded-2xl border p-5 transition-all ${
              isSel ? `border-transparent ${accentClass === 'accent' ? 'bg-dash-accent-soft ring-1 ring-dash-accent' : 'bg-dash-success-soft ring-1 ring-dash-success'}` : 'border-dash-border bg-dash-surface hover:border-dash-ink-faint'
            }`}
          >
            <p className="dash-font-heading text-2xl text-dash-ink">{pack.quantity.toLocaleString('fr-DZ')}</p>
            <p className="text-dash-ink-soft text-xs">{unit} · {pack.hint}</p>
            <p className={`font-bold text-lg mt-3 ${accentClass === 'accent' ? 'text-dash-accent' : 'text-dash-success'}`}>{pack.amountDzd.toLocaleString('fr-DZ')} DZD</p>
            {isSel && <span className={`inline-flex items-center gap-1 text-[11px] font-bold mt-2 ${accentClass === 'accent' ? 'text-dash-accent' : 'text-dash-success'}`}><Check size={12} /> Sélectionné</span>}
          </motion.button>
        )
      })}
    </div>
  )

  return (
    <div className="max-w-4xl space-y-10 pb-16">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/dashboard/billing" className="inline-flex items-center gap-2 text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">
          <ArrowLeft size={14} /> Retour à l&apos;abonnement
        </Link>
        <h1 className="dash-font-heading text-[32px] text-dash-ink mt-4">Recharger crédits &amp; messages</h1>
        <p className="text-dash-ink-soft text-sm mt-1">
          Solde partagé : <span className="text-dash-accent font-semibold">{account!.ai_credits + account!.purchased_credits} crédits IA</span>
          {account!.purchased_chatbot > 0 && <> · <span className="text-dash-success font-semibold">{account!.purchased_chatbot} messages en réserve</span></>}
        </p>
      </motion.div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Sparkles size={16} className="text-dash-accent" />
          <h2 className="text-dash-ink font-bold">Crédits IA</h2>
          <span className="text-dash-ink-faint text-xs">1 landing page = 5 crédits · 1 visuel pub = 1 crédit</span>
        </div>
        {renderPacks('ai_credits', CREDIT_PACKS, 'accent', 'crédits')}
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <MessageCircle size={16} className="text-dash-success" />
          <h2 className="text-dash-ink font-bold">Messages chatbot</h2>
          <span className="text-dash-ink-faint text-xs">consommés une fois la limite quotidienne atteinte</span>
        </div>
        {renderPacks('chatbot_messages', MESSAGE_PACKS, 'success', 'messages')}
      </div>

      <AnimatePresence>
        {selected && !submitted && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <Card className="border-dash-accent/30 space-y-5">
              <h3 className="text-dash-ink font-bold flex items-center gap-2">
                <CreditCard size={18} className="text-dash-accent" />
                Paiement — {selected.pack.label}
                <span className="ml-auto text-sm text-dash-accent font-bold">{selected.pack.amountDzd.toLocaleString('fr-DZ')} DZD</span>
              </h3>

              {onlineError && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{onlineError}</div>}
              <button onClick={payOnline} disabled={payingOnline}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-dash-surface transition-all hover:opacity-90 disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))' }}>
                {payingOnline ? <Loader2 size={16} className="animate-spin" /> : <><CreditCard size={16} /> Payer en ligne (CIB / Edahabia)</>}
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-dash-border" />
                <span className="text-dash-ink-faint text-xs">ou payer manuellement</span>
                <div className="flex-1 h-px bg-dash-border" />
              </div>

              <div className="bg-dash-surface-2 rounded-xl p-4 space-y-2 text-sm">
                <p className="text-dash-ink font-semibold">Effectuez le paiement vers :</p>
                <div className="space-y-2 text-dash-ink-soft">
                  {PAYMENT_METHODS.map(m => (
                    <div key={m.value} className="flex items-center gap-2 flex-wrap">
                      <span>{m.icon}</span>
                      <span className="text-dash-ink font-semibold">{m.label}</span>
                      <span className="text-dash-ink-faint">— {m.note} :</span>
                      <span className="text-dash-ink font-mono font-semibold select-all">{m.value}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-dash-border pt-2 mt-2">
                  <p className="text-dash-ink-faint text-xs flex items-center gap-1 flex-wrap">
                    <AlertCircle size={11} /> Incluez votre slug <span className="text-dash-ink font-mono">{account!.slug}</span> comme référence
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider font-bold">Capture d&apos;écran du paiement (recommandé)</label>
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

              <div className="flex gap-3">
                <button onClick={() => setSelected(null)} className="px-4 py-3 rounded-xl text-sm font-bold bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink transition-all">
                  Annuler
                </button>
                <button onClick={submit} disabled={submitting}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-dash-surface bg-dash-accent hover:bg-dash-accent-dark transition-all disabled:opacity-50">
                  {submitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={16} /> J&apos;ai effectué le paiement</>}
                </button>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {submitted && (
        <Card className="border-dash-success/20 bg-dash-success-soft text-center space-y-2">
          <p className="text-dash-success font-bold text-lg">Demande envoyée !</p>
          <p className="text-dash-ink-soft text-sm">Vos crédits seront ajoutés dès la vérification du paiement.</p>
          <p className="text-dash-ink-faint text-xs">Contactez-nous sur WhatsApp pour une activation immédiate.</p>
        </Card>
      )}
    </div>
  )
}
