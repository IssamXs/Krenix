'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Check, Trash2, KeyRound } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import type { PaymentProvider } from '@/types/database'
import { useI18n } from '@/lib/i18n/LocaleProvider'

type ProviderStatus = { connected: boolean; enabled: boolean }

export default function PaymentIntegrationsPage() {
  const { t } = useI18n()
  const PROVIDERS: { id: PaymentProvider; name: string; blurb: string; keyLabel: string; keyHint: string }[] = [
    {
      id: 'slickpay',
      name: 'SlickPay',
      blurb: t('payment.slickpayBlurb'),
      keyLabel: t('payment.slickpayKeyLabel'),
      keyHint: t('payment.slickpayKeyHint'),
    },
    {
      id: 'chargily',
      name: 'Chargily',
      blurb: t('payment.chargilyBlurb'),
      keyLabel: t('payment.chargilyKeyLabel'),
      keyHint: t('payment.chargilyKeyHint'),
    },
  ]
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<PaymentProvider, ProviderStatus>>({
    slickpay: { connected: false, enabled: false },
    chargily: { connected: false, enabled: false },
  })
  const [activeProvider, setActiveProvider] = useState<PaymentProvider | null>(null)
  const [showOnStorefront, setShowOnStorefront] = useState(false)

  const [openForm, setOpenForm] = useState<PaymentProvider | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<PaymentProvider | null>(null)

  const load = () => {
    fetch('/api/integrations/payment')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return
        setStatus({ slickpay: d.slickpay, chargily: d.chargily })
        setShowOnStorefront(!!d.showOnStorefront)
        setActiveProvider(d.activeProvider ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const connect = async (provider: PaymentProvider) => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/integrations/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, publicKey: keyInput }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? t('payment.errorConnectGeneric')); return }
      setOpenForm(null); setKeyInput('')
      load()
    } finally { setSaving(false) }
  }

  const disconnect = async (provider: PaymentProvider) => {
    if (!confirm(t('payment.confirmDisconnect', { name: provider === 'slickpay' ? 'SlickPay' : 'Chargily' }))) return
    await fetch('/api/integrations/payment', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }),
    })
    load()
  }

  const activate = async (provider: PaymentProvider) => {
    setToggling(provider); setError('')
    try {
      const res = await fetch('/api/integrations/payment', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showOnStorefront: true, provider }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? t('payment.errorGeneric')); return }
      load()
    } finally { setToggling(null) }
  }

  const deactivate = async () => {
    setToggling(activeProvider); setError('')
    try {
      await fetch('/api/integrations/payment', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showOnStorefront: false }),
      })
      load()
    } finally { setToggling(null) }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">{t('payment.backLink')}</a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('payment.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{t('payment.subtitle')}</p>
      </div>

      {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{error}</div>}

      {PROVIDERS.map(p => {
        const s = status[p.id]
        const isActive = activeProvider === p.id && showOnStorefront
        return (
          <Card key={p.id}>
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                <CreditCard size={24} className="text-dash-accent-dark" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-dash-ink font-semibold text-lg">{p.name}</p>
                <p className="text-dash-ink-soft text-sm mt-0.5">{p.blurb}</p>
              </div>
              {loading ? (
                <Loader2 size={18} className="animate-spin text-dash-ink-faint" />
              ) : s.connected ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-success-soft text-dash-success flex-shrink-0">
                  <Check size={13} /> {t('payment.connected')}
                </span>
              ) : (
                <button onClick={() => setOpenForm(f => f === p.id ? null : p.id)} className="text-xs font-bold px-4 py-2 rounded-xl text-white flex-shrink-0 transition-all hover:opacity-90 bg-dash-accent hover:bg-dash-accent-dark">
                  {t('payment.connect')}
                </button>
              )}
            </div>

            {!loading && s.connected && (
              <div className="mt-4 pt-4 border-t border-dash-border flex items-center justify-between gap-3">
                <div>
                  <p className="text-dash-ink text-sm font-medium">{t('payment.showOnStorefrontTitle')}</p>
                  <p className="text-dash-ink-soft text-xs mt-0.5">{t('payment.showOnStorefrontHint')}</p>
                </div>
                <button
                  onClick={() => (isActive ? deactivate() : activate(p.id))}
                  disabled={toggling === p.id}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${isActive ? 'bg-dash-success' : 'bg-dash-border'}`}
                  aria-label={t('payment.showOnStorefrontAriaLabel', { name: p.name })}
                >
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: isActive ? '22px' : '2px' }} />
                </button>
              </div>
            )}

            {!loading && s.connected && (
              <div className="mt-4 pt-4 border-t border-dash-border flex items-center justify-between">
                <p className="text-xs text-dash-ink-soft">{t('payment.accountLinked', { name: p.name })}</p>
                <button onClick={() => disconnect(p.id)} className="flex items-center gap-1.5 text-xs text-dash-danger/70 hover:text-dash-danger transition-colors">
                  <Trash2 size={12} /> {t('payment.disconnect')}
                </button>
              </div>
            )}

            {!loading && !s.connected && openForm === p.id && (
              <div className="mt-4 pt-4 border-t border-dash-border space-y-3">
                <div className="flex items-start gap-2 text-xs text-dash-ink-soft bg-dash-surface-2 rounded-lg px-3 py-2">
                  <KeyRound size={13} className="mt-0.5 flex-shrink-0 text-dash-ink-soft" />
                  {p.keyHint}
                </div>
                <div>
                  <label className="block text-xs text-dash-ink-soft mb-1.5 uppercase tracking-wider font-bold">{p.keyLabel}</label>
                  <input value={keyInput} onChange={e => setKeyInput(e.target.value)} type="password" placeholder={p.keyLabel}
                    className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm" />
                </div>
                <button onClick={() => connect(p.id)} disabled={saving || !keyInput.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 bg-dash-accent hover:bg-dash-accent-dark">
                  {saving ? <><Loader2 size={15} className="animate-spin" /> {t('payment.verifying')}</> : t('payment.verifyAndConnect')}
                </button>
              </div>
            )}
          </Card>
        )
      })}

      <Card className="p-6 text-center">
        <CreditCard size={32} className="mx-auto mb-3 text-dash-ink-faint" />
        <p className="text-dash-ink font-semibold">{t('payment.howItWorksTitle')}</p>
        <p className="text-dash-ink-soft text-sm mt-1 max-w-sm mx-auto">
          {t('payment.howItWorksBody')}
        </p>
      </Card>
    </div>
  )
}
