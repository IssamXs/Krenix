'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { FraudLabel } from '@/types/database'
import { ShieldAlert, Loader2, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
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

const LABEL_STYLES: Record<FraudLabel, string> = {
  pending: 'bg-dash-warning-soft text-dash-warning-dark',
  confirmed_fake: 'bg-dash-danger-soft text-dash-danger',
  confirmed_real: 'bg-dash-success-soft text-dash-success',
}

export default function FraudShieldPage() {
  const { t } = useI18n()
  const LABEL_TEXT: Record<FraudLabel, string> = {
    pending: t('fraudShieldPage.labelPending'),
    confirmed_fake: t('fraudShieldPage.labelConfirmedFake'),
    confirmed_real: t('fraudShieldPage.labelConfirmedReal'),
  }
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState('')
  const [orders, setOrders] = useState<FlaggedOrder[]>([])
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, fraud_shield_enabled') as { id: string; fraud_shield_enabled: boolean } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      // Not plan-gated: redirect away entirely if this store's flag is off,
      // rather than showing a LockedFeatureCard (this isn't a paid upsell yet).
      if (!store.fraud_shield_enabled) { router.push('/dashboard'); return }
      setStoreId(store.id)

      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, wilaya, total_price, created_at, fraud_risk_score, fraud_signals, fraud_label')
        .eq('store_id', store.id)
        .not('fraud_risk_score', 'is', null)
        .order('fraud_risk_score', { ascending: false })
      setOrders((data ?? []) as FlaggedOrder[])
      setLoading(false)
    })
  }, [router])

  const confirmLabel = async (orderId: string, label: FraudLabel) => {
    const supabase = createClient()
    await supabase.from('orders').update({ fraud_label: label }).eq('id', orderId).eq('store_id', storeId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, fraud_label: label } : o))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

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

      {orders.length === 0 ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-12 flex flex-col items-center gap-3 text-center">
          <ShieldAlert size={32} className="text-dash-ink-faint" />
          <p className="text-dash-ink-soft text-sm">{t('fraudShieldPage.noOrdersYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
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
