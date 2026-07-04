'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, ExternalLink, Loader2, Clock, CreditCard, Filter } from 'lucide-react'
import { PLAN_LABELS, PLAN_PRICES, type Plan, type SubscriptionPaymentStatus } from '@/types/database'

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
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleConfirm = async (payment: Payment) => {
    setProcessing(payment.id)
    const supabase = createClient()

    await supabase.from('subscriptions').update({
      status: 'active',
      confirmed_at: new Date().toISOString(),
    }).eq('id', payment.id)

    // Upgrade store plan
    const planCredits: Record<Plan, number> = { basic: 5, pro: 20, ultimate: 100, growth: 200, business: 400, agency: 800, enterprise: 1500, sur_mesure: 0 }
    await supabase.from('stores').update({
      plan: payment.plan,
      subscription_status: 'active',
      ai_credits: planCredits[payment.plan],
      chatbot_daily_limit: payment.plan === 'ultimate' ? 150 : 0,
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

  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter)
  const pendingCount = payments.filter(p => p.status === 'pending').length

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
                  <p className="text-gray-500 text-xs">{payment.store?.slug}.novalux.com</p>
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
