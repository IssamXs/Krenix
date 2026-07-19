'use client'

import { useEffect, useState } from 'react'
import { Globe, Loader2, Check, Clock, Trash2, RefreshCw, Copy } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

interface DomainState {
  domain: string | null
  verified: boolean
  allowed: boolean
}

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.store'
const CNAME_TARGET = `stores.${ROOT}`

export default function DomainPage() {
  const [state, setState] = useState<DomainState | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [hint, setHint] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/domain')
      .then(r => r.json())
      .then(d => {
        if (!d.error) { setState(d as DomainState); setInput(d.domain ?? '') }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setError(''); setHint('')
    try {
      const res = await fetch('/api/domain', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: input }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur'); return }
      setState(s => s ? { ...s, domain: d.domain, verified: false } : s)
      setInput(d.domain)
    } finally { setSaving(false) }
  }

  const verify = async () => {
    setVerifying(true); setError(''); setHint('')
    try {
      const res = await fetch('/api/domain/verify', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur de vérification'); return }
      if (d.verified) {
        setState(s => s ? { ...s, verified: true } : s)
      } else {
        setHint(d.hint ?? 'Pas encore vérifié.')
      }
    } finally { setVerifying(false) }
  }

  const removeDomain = async () => {
    if (!confirm('Détacher ce domaine ? Votre boutique restera accessible sur son sous-domaine Krenix.')) return
    await fetch('/api/domain', { method: 'DELETE' })
    setState(s => s ? { ...s, domain: null, verified: false } : s)
    setInput('')
  }

  const copyTarget = () => {
    navigator.clipboard.writeText(CNAME_TARGET)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-dash-accent" size={26} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Domaine personnalisé</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Utilisez votre propre nom de domaine pour votre boutique</p>
      </div>

      {!state?.allowed ? (
        <LockedFeatureCard title="Domaine personnalisé — connectez votre propre domaine" requiredPlan="Growth" />
      ) : (
        <>
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-dash-accent" />
                <h3 className="text-dash-ink font-bold text-sm">Votre domaine</h3>
              </div>
              {state.domain && (
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                  state.verified ? 'bg-dash-success-soft text-dash-success' : 'bg-dash-warning-soft text-dash-warning-dark'
                }`}>
                  {state.verified ? <><Check size={12} /> Vérifié</> : <><Clock size={12} /> En attente de vérification</>}
                </span>
              )}
            </div>
            {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}
            {hint && <div className="bg-dash-warning-soft border border-dash-warning/20 text-dash-warning-dark text-xs px-3 py-2 rounded-xl">{hint}</div>}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setError('') }}
                placeholder="www.maboutique.dz"
                className="flex-1 px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm font-mono"
              />
              <button
                onClick={save}
                disabled={saving || !input.trim() || input.trim().toLowerCase() === (state.domain ?? '')}
                className="px-4 py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-dash-surface font-bold text-sm transition-all disabled:opacity-50 flex-shrink-0"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : 'Enregistrer'}
              </button>
            </div>
            {state.domain && (
              <div className="flex items-center gap-2 pt-1">
                {!state.verified && (
                  <button
                    onClick={verify}
                    disabled={verifying}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink-soft hover:text-dash-ink text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Vérifier le DNS
                  </button>
                )}
                <button
                  onClick={removeDomain}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-dash-danger/70 hover:text-dash-danger border border-dash-border hover:border-dash-danger/30 transition-all"
                >
                  <Trash2 size={12} /> Détacher
                </button>
              </div>
            )}
          </Card>

          <Card className="space-y-3">
            <p className="text-dash-ink font-bold text-sm">Configuration DNS</p>
            <p className="text-dash-ink-soft text-xs">
              Chez votre registrar (là où vous avez acheté le domaine), ajoutez cet enregistrement :
            </p>
            <div className="bg-dash-surface-2 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 text-xs">
                <div className="px-3 py-2 text-dash-ink-soft uppercase tracking-wider border-b border-dash-border">Type</div>
                <div className="px-3 py-2 text-dash-ink-soft uppercase tracking-wider border-b border-dash-border">Nom</div>
                <div className="px-3 py-2 text-dash-ink-soft uppercase tracking-wider border-b border-dash-border">Valeur</div>
                <div className="px-3 py-2 text-dash-ink font-mono">CNAME</div>
                <div className="px-3 py-2 text-dash-ink font-mono truncate">{state.domain ?? 'www'}</div>
                <div className="px-3 py-2 text-dash-ink font-mono flex items-center gap-2 min-w-0">
                  <span className="truncate">{CNAME_TARGET}</span>
                  <button onClick={copyTarget} className="text-dash-ink-soft hover:text-dash-ink flex-shrink-0" title="Copier">
                    {copied ? <Check size={12} className="text-dash-success" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-dash-ink-faint text-[11px]">
              La propagation DNS peut prendre de quelques minutes à 24 h. Cliquez ensuite sur « Vérifier le DNS ».
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
