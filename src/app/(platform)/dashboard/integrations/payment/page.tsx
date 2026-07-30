'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Check, Trash2, KeyRound } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import type { PaymentProvider } from '@/types/database'

const PROVIDERS: { id: PaymentProvider; name: string; blurb: string; keyLabel: string; keyHint: string }[] = [
  {
    id: 'slickpay',
    name: 'SlickPay',
    blurb: 'Paiement par carte CIB et Edahabia — même système que Krenix utilise',
    keyLabel: 'Clé publique SlickPay',
    keyHint: 'Récupérez votre clé publique depuis votre tableau de bord SlickPay (section API).',
  },
  {
    id: 'chargily',
    name: 'Chargily',
    blurb: 'Paiement par carte CIB et Edahabia via Chargily Pay',
    keyLabel: 'Clé secrète Chargily',
    keyHint: 'Récupérez votre clé secrète depuis votre tableau de bord Chargily (section API Keys).',
  },
]

type ProviderStatus = { connected: boolean; enabled: boolean }

export default function PaymentIntegrationsPage() {
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
      if (!res.ok) { setError(d.error ?? 'Erreur de connexion'); return }
      setOpenForm(null); setKeyInput('')
      load()
    } finally { setSaving(false) }
  }

  const disconnect = async (provider: PaymentProvider) => {
    if (!confirm(`Déconnecter ${provider === 'slickpay' ? 'SlickPay' : 'Chargily'} ? Si c'est votre fournisseur actif, le paiement en ligne ne sera plus proposé à vos clients.`)) return
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
      if (!res.ok) { setError(d.error ?? 'Erreur'); return }
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
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">← Intégrations</a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Paiement en ligne</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Connectez SlickPay et/ou Chargily pour accepter le paiement par carte CIB / Edahabia sur votre boutique. Un seul fournisseur est actif à la fois.</p>
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
                  <Check size={13} /> Connecté
                </span>
              ) : (
                <button onClick={() => setOpenForm(f => f === p.id ? null : p.id)} className="text-xs font-bold px-4 py-2 rounded-xl text-white flex-shrink-0 transition-all hover:opacity-90 bg-dash-accent hover:bg-dash-accent-dark">
                  Connecter
                </button>
              )}
            </div>

            {!loading && s.connected && (
              <div className="mt-4 pt-4 border-t border-dash-border flex items-center justify-between gap-3">
                <div>
                  <p className="text-dash-ink text-sm font-medium">Afficher sur ma boutique</p>
                  <p className="text-dash-ink-soft text-xs mt-0.5">Vos clients pourront choisir de payer en ligne au moment de commander</p>
                </div>
                <button
                  onClick={() => (isActive ? deactivate() : activate(p.id))}
                  disabled={toggling === p.id}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${isActive ? 'bg-dash-success' : 'bg-dash-border'}`}
                  aria-label={`Afficher le paiement ${p.name} sur la boutique`}
                >
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: isActive ? '22px' : '2px' }} />
                </button>
              </div>
            )}

            {!loading && s.connected && (
              <div className="mt-4 pt-4 border-t border-dash-border flex items-center justify-between">
                <p className="text-xs text-dash-ink-soft">Compte {p.name} lié à votre boutique</p>
                <button onClick={() => disconnect(p.id)} className="flex items-center gap-1.5 text-xs text-dash-danger/70 hover:text-dash-danger transition-colors">
                  <Trash2 size={12} /> Déconnecter
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
                  {saving ? <><Loader2 size={15} className="animate-spin" /> Vérification…</> : 'Vérifier et connecter'}
                </button>
              </div>
            )}
          </Card>
        )
      })}

      <Card className="p-6 text-center">
        <CreditCard size={32} className="mx-auto mb-3 text-dash-ink-faint" />
        <p className="text-dash-ink font-semibold">Comment ça marche</p>
        <p className="text-dash-ink-soft text-sm mt-1 max-w-sm mx-auto">
          Krenix ne prend aucune commission sur ces paiements — l&apos;argent va directement sur votre propre compte. Utile notamment pour les produits numériques, livrés sans passage par un livreur.
        </p>
      </Card>
    </div>
  )
}
