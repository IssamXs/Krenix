'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CheckCircle, XCircle, ExternalLink, Loader2, Clock, CreditCard, Sparkles, MessageCircle } from 'lucide-react'
import { PLAN_LABELS, type Plan, type SubscriptionPaymentStatus, type CreditPurchase, type CreditPurchaseStatus } from '@/types/database'
import { useProtectedAction } from '@/components/super-admin/StepUpModal'

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
  confirmed_at: string | null
  expires_at: string | null
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
  pending: 'text-dash-warning-dark bg-dash-warning-soft',
  active: 'text-dash-success bg-dash-success-soft',
  expired: 'text-dash-neutral bg-dash-neutral-soft',
  cancelled: 'text-dash-neutral bg-dash-neutral-soft',
  rejected: 'text-dash-danger bg-dash-danger-soft',
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cib: 'CIB',
  edahabia: 'Edahabia',
  baridimob: 'BaridiMob',
  virement: 'Virement',
  cash: 'Cash',
  other: 'Autre',
}

// The two tables spell "confirmed" differently: subscriptions use 'active',
// credit_purchases use 'confirmed'. The filter chips speak subscription-ese, so
// map a chip onto the equivalent credit_purchase status before comparing —
// without this, confirmed recharges match nothing and silently disappear.
const PURCHASE_STATUS_FOR_FILTER: Record<SubscriptionPaymentStatus, CreditPurchaseStatus | null> = {
  pending: 'pending',
  active: 'confirmed',
  rejected: 'rejected',
  expired: null,    // no equivalent — top-ups never expire
  cancelled: null,
}

const PURCHASE_STATUS_LABELS: Record<CreditPurchaseStatus, string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  rejected: 'Rejeté',
}

const PURCHASE_STATUS_COLORS: Record<CreditPurchaseStatus, string> = {
  pending: 'text-dash-warning-dark bg-dash-warning-soft',
  confirmed: 'text-dash-success bg-dash-success-soft',
  rejected: 'text-dash-danger bg-dash-danger-soft',
}

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('fr-DZ', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

// Un-paid SlickPay attempts leave a 'pending' row behind that the admin can't
// action (the customer simply never completed checkout) — hide those.
const isAbandonedSlickpay = (p: { status: string; notes?: string | null }) =>
  p.status === 'pending' && p.notes === 'SlickPay (en ligne)'

// Outside the component: touches no state, so it needn't be a hook dependency.
async function fetchPayments(): Promise<{ subs: Payment[]; tops: CreditPurchase[] }> {
  const supabase = createClient()
  const [{ data: subs }, { data: tops }] = await Promise.all([
    supabase.from('subscriptions')
      .select('*, store:stores(name, slug, plan)')
      .order('created_at', { ascending: false }),
    supabase.from('credit_purchases')
      .select('*, store:stores(name, slug)')
      .order('created_at', { ascending: false }),
  ])
  return {
    subs: (subs ?? []).filter(p => !isAbandonedSlickpay(p)) as Payment[],
    tops: (tops ?? []).filter(p => !isAbandonedSlickpay(p)) as CreditPurchase[],
  }
}

export default function SuperAdminPayments() {
  const { run, modal } = useProtectedAction()
  const [payments, setPayments] = useState<Payment[]>([])
  const [purchases, setPurchases] = useState<CreditPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | SubscriptionPaymentStatus>('pending')
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [selectedProofUrl, setSelectedProofUrl] = useState<string | null>(null)

  const load = async () => {
    const { subs, tops } = await fetchPayments()
    setPayments(subs)
    setPurchases(tops)
    setLoading(false)
  }

  // setState lands in the promise callback rather than the effect body, which is
  // what react-hooks/set-state-in-effect wants; `load` is reused after actions.
  useEffect(() => {
    fetchPayments().then(({ subs, tops }) => {
      setPayments(subs)
      setPurchases(tops)
      setLoading(false)
    })
  }, [])

  const handleConfirm = async (payment: Payment) => {
    setProcessing(payment.id)
    const res = await run(() => fetch(`/api/super-admin/payments/${payment.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }),
    }))
    if (res && res.ok) await load()
    else if (res) alert(await res.text())
    setProcessing(null)
  }

  const handleReject = async (paymentId: string) => {
    if (!rejectReason.trim()) return
    setProcessing(paymentId)
    const res = await run(() => fetch(`/api/super-admin/payments/${paymentId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: rejectReason }),
    }))
    if (res && res.ok) await load()
    setRejectId(null); setRejectReason(''); setProcessing(null)
  }

  const handleCancel = async (paymentId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cette confirmation ? Cela remettra le paiement en attente et retirera les crédits ajoutés.')) return
    setProcessing(paymentId)
    const res = await run(() => fetch(`/api/super-admin/payments/${paymentId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }),
    }))
    if (res && res.ok) await load()
    setProcessing(null)
  }

  // ── Credit / message top-ups ──────────────────────────────────
  const handleConfirmPurchase = async (p: CreditPurchase) => {
    setProcessing(p.id)
    const res = await run(() => fetch(`/api/super-admin/credit-purchases/${p.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }),
    }))
    if (res && res.ok) await load()
    setProcessing(null)
  }

  const handleRejectPurchase = async (id: string) => {
    if (!rejectReason.trim()) return
    setProcessing(id)
    const res = await run(() => fetch(`/api/super-admin/credit-purchases/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: rejectReason }),
    }))
    if (res && res.ok) await load()
    setRejectId(null); setRejectReason(''); setProcessing(null)
  }

  const filtered = filter === 'all' ? payments : payments.filter(p => p.status === filter)
  const filteredPurchases = filter === 'all'
    ? purchases
    : purchases.filter(p => p.status === PURCHASE_STATUS_FOR_FILTER[filter])
  const pendingCount = payments.filter(p => p.status === 'pending').length + purchases.filter(p => p.status === 'pending').length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Paiements</h1>
          <p className="text-dash-ink-soft text-sm mt-1">{payments.length} paiement{payments.length !== 1 ? 's' : ''}</p>
        </div>
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dash-warning-soft border border-dash-warning/20">
            <Clock size={14} className="text-dash-warning-dark" />
            <span className="text-dash-warning-dark text-sm font-semibold">{pendingCount} en attente</span>
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
                ? 'bg-dash-accent text-white'
                : 'bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink hover:bg-dash-border'
            }`}
          >
            {status === 'all' ? 'Tous' : STATUS_LABELS[status]}
          </button>
        ))}
      </div>

      {/* ── Credit / message top-ups awaiting confirmation ── */}
      {!loading && filteredPurchases.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-dash-accent" />
            <h2 className="text-dash-ink font-bold text-sm">{filter === 'pending' ? 'Recharges à confirmer' : 'Recharges'}</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
              filter === 'pending' ? 'bg-dash-warning-soft text-dash-warning-dark' : 'bg-dash-surface-2 text-dash-ink-soft'
            }`}>{filteredPurchases.length}</span>
          </div>
          {filteredPurchases.map(p => (
            <div key={p.id} className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    {p.kind === 'ai_credits'
                      ? <Sparkles size={14} className="text-dash-accent" />
                      : <MessageCircle size={14} className="text-dash-success" />}
                    <p className="text-dash-ink font-semibold">{p.store?.name ?? 'Boutique inconnue'}</p>
                    {p.status !== 'pending' && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PURCHASE_STATUS_COLORS[p.status]}`}>
                        {PURCHASE_STATUS_LABELS[p.status]}
                      </span>
                    )}
                  </div>
                  <p className="text-dash-ink-soft text-xs">{p.store?.slug}.krenix.store</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5">Demandé le {fmtDate(p.created_at)}</p>
                  {p.status === 'confirmed' && (
                    <p className="text-dash-success/80 text-xs mt-0.5">Confirmé le {fmtDate(p.confirmed_at)}</p>
                  )}
                  {p.status === 'rejected' && p.rejected_reason && (
                    <p className="text-dash-danger/80 text-xs mt-0.5">Rejeté : {p.rejected_reason}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-dash-accent font-black text-lg">{p.amount_dzd.toLocaleString('fr-DZ')} DZD</p>
                  <p className="text-dash-ink-soft text-xs">
                    +{p.quantity.toLocaleString('fr-DZ')} {p.kind === 'ai_credits' ? 'crédits IA' : 'messages'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {p.payment_proof_url && (
                  <button
                    onClick={() => setSelectedProofUrl(p.payment_proof_url)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all text-xs"
                  >
                    <ExternalLink size={13} /> Voir la preuve
                  </button>
                )}
                {p.status === 'pending' && (
                  <>
                    <button onClick={() => handleConfirmPurchase(p)} disabled={processing === p.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-dash-success-soft border border-dash-success/20 text-dash-success hover:bg-dash-success/15 transition-all text-sm font-medium disabled:opacity-50">
                      {processing === p.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Confirmer
                    </button>
                    <button onClick={() => { setRejectId(p.id); setRejectReason('') }} disabled={processing === p.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-dash-danger-soft border border-dash-danger/20 text-dash-danger hover:bg-dash-danger/15 transition-all text-sm font-medium disabled:opacity-50">
                      <XCircle size={14} /> Rejeter
                    </button>
                  </>
                )}
              </div>
              {rejectId === p.id && (
                <div className="space-y-2 pt-1">
                  <input value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    placeholder="Raison du rejet"
                    className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-danger/20 text-dash-ink placeholder-dash-ink-faint outline-none text-sm" />
                  <div className="flex gap-2">
                    <button onClick={() => handleRejectPurchase(p.id)} disabled={!rejectReason.trim() || processing === p.id}
                      className="px-4 py-2 rounded-xl bg-dash-danger text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50">
                      Confirmer le rejet
                    </button>
                    <button onClick={() => setRejectId(null)}
                      className="px-4 py-2 rounded-xl border border-dash-border text-dash-ink-soft text-xs hover:text-dash-ink transition-all">
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
        <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-dash-accent" /></div>
      ) : (
        <div className="space-y-4">
          {filtered.map(payment => (
            <div key={payment.id} className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-dash-ink font-semibold">{payment.store?.name ?? 'Boutique inconnue'}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[payment.status]}`}>
                      {STATUS_LABELS[payment.status]}
                    </span>
                  </div>
                  <p className="text-dash-ink-soft text-xs">{payment.store?.slug}.krenix.store</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5">Demandé le {fmtDate(payment.created_at)}</p>
                  {payment.status === 'active' && (
                    <>
                      <p className="text-dash-success/80 text-xs mt-0.5">Confirmé le {fmtDate(payment.confirmed_at)}</p>
                      <p className={`text-xs mt-0.5 ${payment.expires_at ? 'text-dash-ink-soft' : 'text-dash-ink-faint'}`}>
                        {payment.expires_at ? `Expire le ${fmtDate(payment.expires_at)}` : 'Sans expiration (paiement unique)'}
                      </p>
                    </>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-dash-accent font-black text-lg">{payment.amount_dzd.toLocaleString('fr-DZ')} DZD</p>
                  <p className="text-dash-ink-soft text-xs">{PLAN_LABELS[payment.plan]}</p>
                  {payment.payment_method && (
                    <p className="text-dash-ink-soft text-xs mt-0.5">{PAYMENT_METHOD_LABELS[payment.payment_method] ?? payment.payment_method}</p>
                  )}
                </div>
              </div>

              {payment.notes && (
                <div className="bg-dash-surface-2 rounded-xl px-4 py-2.5 text-dash-ink-soft text-xs">
                  <span className="text-dash-ink-soft font-medium">Note : </span>{payment.notes}
                </div>
              )}

              <div className="flex items-center gap-3">
                {payment.payment_proof_url && (
                  <button
                    onClick={() => setSelectedProofUrl(payment.payment_proof_url)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all text-xs"
                  >
                    <ExternalLink size={13} /> Voir la preuve
                  </button>
                )}

                {payment.status === 'pending' && (
                  <>
                    <button
                      onClick={() => handleConfirm(payment)}
                      disabled={processing === payment.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-dash-success-soft border border-dash-success/20 text-dash-success hover:bg-dash-success/15 transition-all text-sm font-medium disabled:opacity-50"
                    >
                      {processing === payment.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                      Confirmer
                    </button>
                    <button
                      onClick={() => { setRejectId(payment.id); setRejectReason('') }}
                      disabled={processing === payment.id}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-dash-danger-soft border border-dash-danger/20 text-dash-danger hover:bg-dash-danger/15 transition-all text-sm font-medium disabled:opacity-50"
                    >
                      <XCircle size={14} /> Rejeter
                    </button>
                  </>
                )}

                {payment.status === 'active' && (
                  <button
                    onClick={() => handleCancel(payment.id)}
                    disabled={processing === payment.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-dash-warning-soft border border-dash-warning/20 text-dash-warning-dark hover:bg-dash-warning/15 transition-all text-sm font-medium disabled:opacity-50"
                  >
                    {processing === payment.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                    Annuler la confirmation
                  </button>
                )}
              </div>

              {/* Reject reason input */}
              {rejectId === payment.id && (
                <div className="space-y-2 pt-1">
                  <input
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    placeholder="Raison du rejet (sera communiquée au client)"
                    className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-danger/20 text-dash-ink placeholder-dash-ink-faint outline-none text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReject(payment.id)}
                      disabled={!rejectReason.trim() || processing === payment.id}
                      className="px-4 py-2 rounded-xl bg-dash-danger text-white text-xs font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      Confirmer le rejet
                    </button>
                    <button
                      onClick={() => setRejectId(null)}
                      className="px-4 py-2 rounded-xl border border-dash-border text-dash-ink-soft text-xs hover:text-dash-ink transition-all"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {!filtered.length && !filteredPurchases.length && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <CreditCard size={36} className="text-dash-ink-faint" />
              <p className="text-dash-ink-soft text-sm">Aucun paiement {filter !== 'all' ? `"${STATUS_LABELS[filter as SubscriptionPaymentStatus]}"` : ''} pour le moment.</p>
            </div>
          )}
        </div>
      )}

      {/* Proof Modal */}
      {selectedProofUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setSelectedProofUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col items-center justify-center">
            <button 
              className="absolute -top-10 right-0 text-white hover:text-red-400 transition-colors bg-white/10 rounded-full p-2"
              onClick={() => setSelectedProofUrl(null)}
            >
              <XCircle size={24} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selectedProofUrl}
              alt="Preuve de paiement"
              className="max-w-full max-h-[85vh] rounded-xl object-contain border border-white/10 shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <a
              href={selectedProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="mt-4 flex items-center gap-2 px-6 py-3 bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold rounded-xl transition-colors"
            >
              <ExternalLink size={16} /> Ouvrir dans un nouvel onglet
            </a>
          </div>
        </div>
      )}

      {modal}
    </div>
  )
}
