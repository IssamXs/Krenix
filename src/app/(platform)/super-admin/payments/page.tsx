'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, ExternalLink, Loader2, Clock, CreditCard, Sparkles, MessageCircle } from 'lucide-react'
import { PLAN_LABELS, PLAN_CREDITS, PLAN_CHATBOT_LIMITS, type Plan, type SubscriptionPaymentStatus, type CreditPurchase } from '@/types/database'

interface Payment {
  id: string
  store_id: string
  plan: Plan
  amount_dzd: number
  status: SubscriptionPaymentStatus
  payment_method: string | null
  payment_proof_url: string | null
  notes: string | null
  created_at: string
  store?: { name: string; slug: string; plan: Plan }
}

const STATUS_LABELS: Record<SubscriptionPaymentStatus, string> = {
  pending: 'En attente',
  active: 'Confirmé',
  expired: 'Expiré',
  cancelled: 'Annulé',
  rejected: 'Rejeté',
}

const STATUS_COLORS: Record<SubscriptionPaymentStatus, string> = {
  pending: 'text-yellow-400 bg-yellow-400/10',
  active: 'text-green-400 bg-green-400/10',
  expired: 'text-gray-400 bg-gray-400/10',
  cancelled: 'text-gray-400 bg-gray-400/10',
  rejected: 'text-red-400 bg-red-400/10',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cib: 'CIB',
  edahabia: 'Edahabia',
  baridimob: 'BaridiMob',
  virement: 'Virement',
  cash: 'Cash',
  other: 'Autre',
}

export default function SuperAdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [purchases, setPurchases] = useState<CreditPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | SubscriptionPaymentStatus>('pending')
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const load = async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('subscriptions')
      .select('*, store:stores(name, slug, plan)')
      .order('created_at', { ascending: false })
    setPayments((data ?? []) as Payment[])
    const { data: tops } = await supabase
      .from('credit_purchases')
      .select('*, store:stores(name, slug)')
      .order('created_at', { ascending: false })
    setPurchases((tops ?? []) as CreditPurchase[])
    setLoading(false)
  }

  // Initial load inlined as a promise chain so setState happens inside the
  // callback (satisfies react-hooks/set-state-in-effect); `load` stays for reuse.
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('subscriptions')
      .select('*, store:stores(name, slug, plan)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setPayments((data ?? []) as Payment[])
        supabase
          .from('credit_purchases')
          .select('*, store:stores(name, slug)')
          .order('created_at', { ascending: false })
          .then(({ data: tops }) => {
            setPurchases((tops ?? []) as CreditPurchase[])
            setLoading(false)
          })
      })
  }, [])

  const handleConfirm = async (payment: Payment) => {
    setProcessing(payment.id)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()

    // Current balance/plan to apply the margin rules (see CLAUDE.md).
    const { data: store } = await supabase
      .from('stores')
      .select('ai_credits, plan')
      .eq('id', payment.store_id)
      .single()

    const tierCredits = PLAN_CREDITS[payment.plan]
    const isRenewal = store?.plan === payment.plan
    // Renewal → reset to the tier allocation. Upgrade/new purchase → ADD to the
    // existing balance so unused credits are never destroyed.
    const nextCredits = isRenewal ? tierCredits : (store?.ai_credits ?? 0) + tierCredits

    // Basic is a one-time purchase (no expiry); everything else is a 30-day period.
    const now = new Date()
    const expiresAt = payment.plan === 'basic'
      ? null
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await supabase.from('subscriptions').update({
      status: 'active',
      confirmed_at: now.toISOString(),
      confirmed_by: user?.id ?? null,
      started_at: now.toISOString(),
      expires_at: expiresAt,
    }).eq('id', payment.id)

    await supabase.from('stores').update({
      plan: payment.plan,
      subscription_status: 'active',
      ai_credits: nextCredits,
      chatbot_daily_limit: PLAN_CHATBOT_LIMITS[payment.plan],
    }).eq('id', payment.store_id)

    await load()
    setProcessing(null)
  }

  const handleReject = async (paymentId: string) => {
    if (!rejectReason.trim()) return
    setProcessing(paymentId)
    const supabase = createClient()
    await supabase.from('subscriptions').update({
      status: 'rejected',
      rejected_reason: rejectReason,
    }).eq('id', paymentId)
    await load()
    setRejectId(null)
    setRejectReason('')
    setProcessing(null)
  }

  // ── Credit / message top-ups ──────────────────────────────────
  const handleConfirmPurchase = async (p: CreditPurchase) => {
    setProcessing(p.id)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    // Add the purchased quantity to the account store's permanent top-up balance.
    const column = p.kind === 'ai_credits' ? 'purchased_credits' : 'purchased_chatbot'
    const { data: store } = await supabase.from('stores').select(column).eq('id', p.store_id).single()
    const current = (store?.[column as keyof typeof store] as number | undefined) ?? 0
    await supabase.from('stores').update({ [column]: current + p.quantity }).eq('id', p.store_id)
    await supabase.from('credit_purchases').update({
      status: 'confirmed',
      confirmed_at: new Date().toISOString(),
      confirmed_by: user?.id ?? null,
    }).eq('id', p.id)
    await load()
    setProcessing(null)
  }

  const handleRejectPurchase = async (id: string) => {
    if (!rejectReason.trim()) return
    setProcessing(id)
    const supabase = createClient()
    await supabase.from('credit_purchases').update({ status: 'rejected', rejected_reason: rejectReason }).eq('id', id)
    await load()
    setRejectId(null)
    setRejectReason('')
    setProcessing(null)
  }

  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter)
  const pendingCount = payments.filter(p => p.status === 'pending').length
  const pendingPurchases = purchases.filter(p => p.status === 'pending')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Paiements</h1>
          <p className="text-gray-500 text-sm mt-1">{payments.length} paiement{payments.length !== 1 ? 's' : ''}</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-400/10 border border-yellow-400/20">
            <Clock size={14} className="text-yellow-400" />
            <span className="text-yellow-400 text-sm font-semibold">{pendingCount} en attente</span>
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(['all', 'pending', 'active', 'rejected'] as const).map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              filter === status
                ? 'bg-[#3B82F6] text-black'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            {status === 'all' ? 'Tous' : STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* ── Credit / message top-ups awaiting confirmation ── */}
      {!loading && pendingPurchases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-[#3B82F6]" />
            <h2 className="text-white font-bold text-sm">Recharges à confirmer</h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-400/10 text-yellow-400 font-semibold">{pendingPurchases.length}</span>
          </div>
          {pendingPurchases.map(p => (
            <div key={p.id} className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {p.kind === 'ai_credits'
                      ? <Sparkles size={14} className="text-[#3B82F6]" />
                      : <MessageCircle size={14} className="text-emerald-400" />}
                    <p className="text-white font-semibold">{p.store?.name ?? 'Boutique inconnue'}</p>
                  </div>
                  <p className="text-gray-500 text-xs">{p.store?.slug}.krenix.store</p>
                  <p className="text-gray-600 text-xs mt-0.5">{new Date(p.created_at).toLocaleString('fr-DZ')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[#3B82F6] font-black text-lg">{p.amount_dzd.toLocaleString('fr-DZ')} DZD</p>
                  <p className="text-gray-400 text-xs">
                    +{p.quantity.toLocaleString('fr-DZ')} {p.kind === 'ai_credits' ? 'crédits IA' : 'messages'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.payment_proof_url && (
                  <a href={p.payment_proof_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-xs">
                    <ExternalLink size={13} /> Voir la preuve
                  </a>
                )}
                <button onClick={() => handleConfirmPurchase(p)} disabled={processing === p.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all text-sm font-medium disabled:opacity-50">
                  {processing === p.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Confirmer
                </button>
                <button onClick={() => { setRejectId(p.id); setRejectReason('') }} disabled={processing === p.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50">
                  <XCircle size={14} /> Rejeter
                </button>
              </div>
              {rejectId === p.id && (
                <div className="space-y-2 pt-1">
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="Raison du rejet"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-red-500/20 text-white placeholder-gray-600 outline-none text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => handleRejectPurchase(p.id)} disabled={!rejectReason.trim() || processing === p.id}
                      className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-all disabled:opacity-50">
                      Confirmer le rejet
                    </button>
                    <button onClick={() => setRejectId(null)}
                      className="px-4 py-2 rounded-xl border border-white/10 text-gray-400 text-xs hover:text-white transition-all">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div>
      ) : (
        <div className="space-y-4">
          {filtered.map(payment => (
            <div key={payment.id} className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-white font-semibold">{payment.store?.name ?? 'Boutique inconnue'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[payment.status]}`}>
                      {STATUS_LABELS[payment.status]}
                    </span>
                  </div>
                  <p className="text-gray-500 text-xs">{payment.store?.slug}.krenix.store</p>
                  <p className="text-gray-600 text-xs mt-0.5">{new Date(payment.created_at).toLocaleString('fr-DZ')}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[#3B82F6] font-black text-lg">{payment.amount_dzd.toLocaleString('fr-DZ')} DZD</p>
                  <p className="text-gray-400 text-xs">{PLAN_LABELS[payment.plan]}</p>
                  {payment.payment_method && (
                    <p className="text-gray-500 text-xs mt-0.5">{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</p>
                  )}
                </div>
              </div>

              {payment.notes && (
                <div className="bg-white/3 rounded-xl px-4 py-2.5 text-gray-400 text-xs">
                  <span className="text-gray-500 font-medium">Note : </span>{payment.notes}
                </div>
              )}

              <div className="flex items-center gap-3">
                {payment.payment_proof_url && (
                  <a
                    href={payment.payment_proof_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-xs"
                  >
                    <ExternalLink size={13} /> Voir la preuve
                  </a>
                )}

                {payment.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleConfirm(payment)}
                      disabled={processing === payment.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-all text-sm font-medium disabled:opacity-50"
                    >
                      {processing === payment.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Confirmer
                    </button>
                    <button
                      onClick={() => { setRejectId(payment.id); setRejectReason('') }}
                      disabled={processing === payment.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all text-sm font-medium disabled:opacity-50"
                    >
                      <XCircle size={14} /> Rejeter
                    </button>
                  </>
                )}
              </div>

              {/* Reject reason input */}
              {rejectId === payment.id && (
                <div className="space-y-2 pt-1">
                  <input
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Raison du rejet (sera communiquée au client)"
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-red-500/20 text-white placeholder-gray-600 outline-none text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(payment.id)}
                      disabled={!rejectReason.trim() || processing === payment.id}
                      className="px-4 py-2 rounded-xl bg-red-500 text-white text-xs font-semibold hover:bg-red-600 transition-all disabled:opacity-50"
                    >
                      Confirmer le rejet
                    </button>
                    <button
                      onClick={() => setRejectId(null)}
                      className="px-4 py-2 rounded-xl border border-white/10 text-gray-400 text-xs hover:text-white transition-all"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!filtered.length && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CreditCard size={36} className="text-gray-700" />
              <p className="text-gray-500 text-sm">Aucun paiement {filter !== 'all' ? `"${STATUS_LABELS[filter as SubscriptionPaymentStatus]}"` : ''} pour le moment.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
