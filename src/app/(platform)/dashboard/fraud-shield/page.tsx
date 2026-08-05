'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { getFraudShieldStatus, FRAUD_SHIELD_PRICE_DZD } from '@/lib/fraud-shield/status'
import { PAYMENT_METHODS } from '@/lib/payment'
import type { FraudLabel } from '@/types/database'
import {
  ShieldAlert, ShieldCheck, Lock, Loader2, Check, X, ChevronDown, ChevronUp,
  Upload, CreditCard, Sparkles, BadgeCheck, History, ArrowRight,
} from 'lucide-react'
import { formatDA as DA } from '@/lib/format'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface FlaggedOrder {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  total_price: number
  created_at: string
  fraud_risk_score: number | null
  fraud_signals: Record<string, { points: number; detail: string }> | null
  fraud_label: FraudLabel
}

interface FsPurchase {
  id: string
  amount_dzd: number
  status: 'pending' | 'active' | 'expired' | 'rejected'
  expires_at: string | null
  rejected_reason: string | null
  created_at: string
}

const LABEL_STYLES: Record<FraudLabel, string> = {
  pending: 'bg-dash-warning-soft text-dash-warning-dark',
  confirmed_fake: 'bg-dash-danger-soft text-dash-danger',
  confirmed_real: 'bg-dash-success-soft text-dash-success',
}

const HISTORY_STYLES: Record<FsPurchase['status'], string> = {
  pending: 'bg-dash-warning-soft text-dash-warning-dark',
  active: 'bg-dash-success-soft text-dash-success',
  rejected: 'bg-dash-danger-soft text-dash-danger',
  expired: 'bg-dash-neutral-soft text-dash-neutral',
}

const HISTORY_TEXT: Record<FsPurchase['status'], string> = {
  pending: 'historyStatusPending',
  active: 'historyStatusActive',
  rejected: 'historyStatusRejected',
  expired: 'historyStatusExpired',
}

export default function FraudShieldPage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()
  const LABEL_TEXT: Record<FraudLabel, string> = {
    pending: t('fraudShieldPage.labelPending'),
    confirmed_fake: t('fraudShieldPage.labelConfirmedFake'),
    confirmed_real: t('fraudShieldPage.labelConfirmedReal'),
  }

  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState('')
  const [slug, setSlug] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getFraudShieldStatus>> | null>(null)
  const [purchases, setPurchases] = useState<FsPurchase[]>([])
  const [orders, setOrders] = useState<FlaggedOrder[]>([])
  const [open, setOpen] = useState<string | null>(null)
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [payingOnline, setPayingOnline] = useState(false)
  const [onlineError, setOnlineError] = useState('')
  const [toggleBusy, setToggleBusy] = useState(false)

  const notice = useMemo(() => {
    const paid = searchParams.get('paid')
    const failed = searchParams.get('failed')
    if (paid === '1') return 'paid'
    if (failed === '1') return 'failed'
    return null
  }, [searchParams])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, slug, fraud_shield_enabled') as { id: string; slug: string; fraud_shield_enabled: boolean } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      setStoreId(store.id)
      setSlug(store.slug)
      setEnabled(!!store.fraud_shield_enabled)

      const [fsStatus, fsList, { data }] = await Promise.all([
        getFraudShieldStatus(supabase, store.id),
        supabase.from('fraud_shield_purchases')
          .select('id, amount_dzd, status, expires_at, rejected_reason, created_at')
          .eq('store_id', store.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase.from('orders')
          .select('id, order_number, customer_name, customer_phone, wilaya, total_price, created_at, fraud_risk_score, fraud_signals, fraud_label')
          .eq('store_id', store.id)
          .not('fraud_risk_score', 'is', null)
          .order('fraud_risk_score', { ascending: false })
          .limit(100),
      ])
      setStatus(fsStatus)
      setPurchases((fsList.data ?? []) as FsPurchase[])
      setOrders((data ?? []) as FlaggedOrder[])
      setLoading(false)
    })
  }, [router])

  const confirmLabel = async (orderId: string, label: FraudLabel) => {
    const supabase = createClient()
    await supabase.from('orders').update({ fraud_label: label }).eq('id', orderId).eq('store_id', storeId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, fraud_label: label } : o))
  }

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

  const handleSubmitPayment = async () => {
    if (!storeId) return
    setSubmitting(true)
    const supabase = createClient()
    await supabase.from('fraud_shield_purchases').insert({
      store_id: storeId, amount_dzd: FRAUD_SHIELD_PRICE_DZD, months: 1,
      status: 'pending', payment_proof_url: proofUrl || null,
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  const payOnline = async () => {
    if (!storeId) return
    setPayingOnline(true); setOnlineError('')
    try {
      const res = await fetch('/api/payments/slickpay/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'fraud_shield' }),
      })
      const d = await res.json()
      if (!res.ok || !d.checkoutUrl) {
        setOnlineError(d.code === 'NOT_CONFIGURED' ? t('billing.paymentOnlineUnavailable') : (d.error ?? t('billing.genericPaymentError')))
        setPayingOnline(false)
        return
      }
      window.location.href = d.checkoutUrl
    } catch {
      setOnlineError(t('billing.networkError')); setPayingOnline(false)
    }
  }

  const toggle = async (next: boolean) => {
    setToggleBusy(true)
    try {
      const res = await fetch('/api/orders/fraud-shield/toggle', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) {
        setEnabled(next)
        setStatus(prev => prev ? { ...prev, enabled: next, canScan: next && prev.active } : prev)
      } else {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? t('billing.genericPaymentError'))
      }
    } finally {
      setToggleBusy(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  const active = status?.active ?? false
  const canScan = status?.canScan ?? false
  const pendingRequest = status?.pendingRequest ?? false

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink flex items-center gap-2">
          <ShieldAlert size={24} className="text-dash-accent" /> {t('fraudShieldPage.title')}
        </h1>
        <p className="text-dash-ink-soft text-sm mt-1">
          {t('fraudShieldPage.subtitle', { count: orders.length, plural: orders.length !== 1 ? 's' : '' })}
        </p>
      </div>

      {notice === 'paid' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-dash-success-soft border border-dash-success/25 text-dash-success text-sm">
          <BadgeCheck size={18} /> <span className="font-semibold">{t('fraudShieldPage.subscriptionActiveTitle')}</span>
        </div>
      )}
      {notice === 'failed' && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-dash-danger-soft border border-dash-danger/25 text-dash-danger text-sm">
          <X size={18} /> {t('billing.genericPaymentError')}
        </div>
      )}

      {/* ── Subscription / activation card ─────────────────────── */}
      {active ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-dash-success-soft text-dash-success flex items-center justify-center">
                <ShieldCheck size={24} />
              </div>
              <div>
                <p className="text-dash-ink font-bold text-lg">{t('fraudShieldPage.subscriptionActiveTitle')}</p>
                <p className="text-dash-ink-soft text-sm">
                  {t('fraudShieldPage.activeUntil', { date: new Date(status?.paidUntil ?? '').toLocaleDateString('fr-DZ') })}
                </p>
              </div>
            </div>
            <button onClick={() => payOnline()} disabled={payingOnline}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all text-sm font-medium disabled:opacity-50">
              {payingOnline ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {t('fraudShieldPage.renew')}
            </button>
          </div>

          {/* Enable / disable the shield (AI scan gated on it) */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-dash-border">
            <div>
              <p className="text-dash-ink font-semibold text-sm">{t('fraudShieldPage.activate')}</p>
              <p className="text-dash-ink-soft text-xs mt-0.5">{t('fraudShieldPage.activateHint')}</p>
            </div>
            <button
              onClick={() => toggle(!enabled)}
              disabled={toggleBusy}
              className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-dash-success' : 'bg-dash-border'}`}
              aria-label={enabled ? t('fraudShieldPage.deactivate') : t('fraudShieldPage.activate')}
            >
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${enabled ? 'left-7' : 'left-1'}`} />
            </button>
          </div>

          {!canScan && (
            <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-dash-warning-soft border border-dash-warning/20 text-dash-warning-dark">
              <Lock size={16} className="mt-0.5 flex-shrink-0" />
              <p className="text-xs font-medium">{t('fraudShieldPage.lockedSubtitle')}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-6 space-y-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-dash-warning-soft text-dash-warning-dark flex items-center justify-center">
                <ShieldAlert size={24} />
              </div>
              <div>
                <p className="text-dash-ink font-bold text-lg">{t('fraudShieldPage.notSubscribedTitle')}</p>
                <p className="text-dash-ink-soft text-sm">{t('fraudShieldPage.notSubscribedSubtitle')}</p>
              </div>
            </div>
            <p className="text-dash-accent font-black text-2xl">{t('fraudShieldPage.priceMonthly', { price: DA(FRAUD_SHIELD_PRICE_DZD) })}</p>
          </div>

          <ul className="grid gap-2">
            {(['featureRuleBased', 'featureAiDetector', 'featureAutoFlag', 'featureNoAutoBlock'] as const).map(f => (
              <li key={f} className="flex items-start gap-2.5 text-sm text-dash-ink-soft">
                <Check size={15} className="text-dash-success mt-0.5 flex-shrink-0" /> {t(`fraudShieldPage.${f}`)}
              </li>
            ))}
          </ul>

          {pendingRequest && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-dash-warning-soft border border-dash-warning/20 text-dash-warning-dark text-sm">
              <Loader2 size={15} className="animate-spin flex-shrink-0" /> {t('fraudShieldPage.pendingPayment')}
            </div>
          )}

          {!submitted && (
            <div className="space-y-4">
              <button onClick={payOnline} disabled={payingOnline}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-dash-accent text-white font-semibold hover:opacity-90 transition-all text-sm disabled:opacity-50">
                {payingOnline ? <Loader2 size={17} className="animate-spin" /> : <CreditCard size={17} />}
                {t('fraudShieldPage.payOnline')}
              </button>
              {onlineError && <p className="text-dash-danger text-xs">{onlineError}</p>}

              <div className="flex items-center gap-3 text-dash-ink-faint text-xs">
                <div className="h-px flex-1 bg-dash-border" /> {t('fraudShieldPage.orPayManually')} <div className="h-px flex-1 bg-dash-border" />
              </div>

              <div className="space-y-1.5 text-sm">
                <p className="text-dash-ink-soft">{t('fraudShieldPage.payTo')}</p>
                {PAYMENT_METHODS.map(m => (
                  <div key={m.value} className="flex items-center justify-between bg-dash-surface-2 rounded-xl px-4 py-2.5">
                    <span className="text-dash-ink font-medium text-xs flex items-center gap-2"><span>{m.icon}</span> {m.label}</span>
                    <span className="font-mono text-dash-ink text-sm font-semibold" dir="ltr">{m.value} <span className="text-dash-ink-faint text-[10px]">{m.note}</span></span>
                  </div>
                ))}
                <p className="text-dash-ink-faint text-xs pt-1">{t('fraudShieldPage.reference', { slug })}</p>
              </div>

              <div className="space-y-2">
                <p className="text-dash-ink-soft text-sm">{t('fraudShieldPage.proofLabel')}</p>
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-dash-border cursor-pointer hover:border-dash-accent/40 transition-all text-sm text-dash-ink-soft">
                  {uploading ? <Loader2 size={16} className="animate-spin text-dash-ink-faint" /> : <Upload size={16} className="text-dash-ink-faint" />}
                  {proofUrl ? t('fraudShieldPage.changeProof') : t('fraudShieldPage.addProof')}
                  <input type="file" accept="image/*" className="hidden" onChange={handleProofUpload} />
                </label>
                {proofUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proofUrl} alt={t('billing.proofAlt')} className="w-40 h-28 object-cover rounded-xl border border-dash-border" />
                )}
              </div>

              <button onClick={handleSubmitPayment} disabled={submitting}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-dash-success text-white font-semibold hover:opacity-90 transition-all text-sm disabled:opacity-50">
                {submitting ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                {t('fraudShieldPage.paymentDone')}
              </button>
            </div>
          )}

          {submitted && (
            <div className="flex items-start gap-3 px-4 py-4 rounded-xl bg-dash-success-soft border border-dash-success/25 text-dash-success text-sm">
              <BadgeCheck size={18} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-bold">{t('fraudShieldPage.requestSent')}</p>
                <p className="text-xs opacity-90 mt-0.5">{t('fraudShieldPage.activationNotice')}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── AI detector locked hint ─────────────────────────────── */}
      {!canScan && (
        <div className="flex items-start gap-3 px-5 py-4 rounded-[20px] bg-dash-surface-2 border border-dash-border">
          <Lock size={18} className="text-dash-ink-faint mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-dash-ink font-semibold text-sm">{t('fraudShieldPage.lockedTitle')}</p>
            <p className="text-dash-ink-soft text-xs mt-0.5">{t('fraudShieldPage.lockedSubtitle')}</p>
          </div>
        </div>
      )}

      {/* ── History ─────────────────────────────────────────────── */}
      {purchases.length > 0 && (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History size={15} className="text-dash-ink-faint" />
            <p className="text-dash-ink font-bold text-sm">{t('fraudShieldPage.historyTitle')}</p>
          </div>
          <div className="space-y-2">
            {purchases.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 bg-dash-surface-2 rounded-xl">
                <div>
                  <p className="text-dash-ink text-sm font-medium">
                    {DA(p.amount_dzd)} <span className="text-dash-ink-faint text-xs font-normal">· {new Date(p.created_at).toLocaleDateString('fr-DZ')}</span>
                  </p>
                  {p.status === 'rejected' && p.rejected_reason && (
                    <p className="text-dash-danger/80 text-[11px]">{p.rejected_reason}</p>
                  )}
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${HISTORY_STYLES[p.status]}`}>
                  {t(`fraudShieldPage.${HISTORY_TEXT[p.status]}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Flagged orders (rule-based review) ──────────────────── */}
      {orders.length === 0 ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-12 flex flex-col items-center gap-3 text-center">
          <ShieldCheck size={32} className="text-dash-ink-faint" />
          <p className="text-dash-ink-soft text-sm">{t('fraudShieldPage.noOrdersYet')}</p>
          <button onClick={() => router.push('/dashboard/orders')}
            className="flex items-center gap-1.5 text-dash-accent text-sm font-medium hover:opacity-80 transition-all">
            <Sparkles size={14} /> {t('fraudShieldPage.backToOrders')}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles size={15} className="text-dash-accent" />
            <p className="text-dash-ink font-bold text-sm">{t('orders.fraudSectionTitle')}</p>
          </div>
          {orders.map(o => {
            const isOpen = open === o.id
            const scoreTone = (o.fraud_risk_score ?? 0) >= 60 ? 'text-dash-danger' : (o.fraud_risk_score ?? 0) >= 30 ? 'text-dash-warning-dark' : 'text-dash-ink-soft'
            return (
              <div key={o.id} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : o.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dash-surface-2 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-surface-2 font-bold ${scoreTone}`}>
                    {o.fraud_risk_score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-dash-ink text-sm font-medium truncate">{o.customer_name} · {o.order_number}</p>
                    <p className="text-dash-ink-soft text-xs">{o.wilaya} · {new Date(o.created_at).toLocaleString('fr-DZ')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-dash-ink text-sm font-semibold">{DA(o.total_price)}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LABEL_STYLES[o.fraud_label]}`}>{LABEL_TEXT[o.fraud_label]}</span>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-dash-border pt-3 space-y-3">
                    <div className="space-y-1.5">
                      {Object.entries(o.fraud_signals ?? {}).map(([key, sig]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-dash-ink-soft">{sig.detail}</span>
                          <span className="text-dash-ink font-semibold">+{sig.points}</span>
                        </div>
                      ))}
                      {Object.keys(o.fraud_signals ?? {}).length === 0 && (
                        <p className="text-dash-ink-faint text-xs">{t('fraudShieldPage.noSignalDetected')}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => confirmLabel(o.id, 'confirmed_real')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-dash-success-soft text-dash-success">
                        <Check size={12} /> {t('fraudShieldPage.confirmReal')}
                      </button>
                      <button onClick={() => confirmLabel(o.id, 'confirmed_fake')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-dash-danger-soft text-dash-danger">
                        <X size={12} /> {t('fraudShieldPage.confirmFake')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
