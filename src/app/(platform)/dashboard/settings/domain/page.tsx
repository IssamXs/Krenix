'use client'

import { useEffect, useState } from 'react'
import { Globe, Loader2, Lock, Check, Clock, Trash2, RefreshCw, Copy } from 'lucide-react'

interface DomainState {
  domain: string | null
  verified: boolean
  allowed: boolean
}

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.com'
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
        <Loader2 className="animate-spin text-[#3B82F6]" size={26} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Domaine personnalisé</h2>
        <p className="text-gray-500 text-sm mt-1">Utilisez votre propre nom de domaine pour votre boutique</p>
      </div>

      {!state?.allowed ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Domaine personnalisé</p>
            <p className="text-gray-500 text-xs">Connectez votre propre domaine — disponible à partir du plan Growth</p>
          </div>
          <a href="/dashboard/billing/upgrade"
            className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Growth
          </a>
        </div>
      ) : (
        <>
          {/* Domain input */}
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe size={16} className="text-[#3B82F6]" />
                <h3 className="text-white font-semibold text-sm">Votre domaine</h3>
              </div>
              {state.domain && (
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${
                  state.verified ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'
                }`}>
                  {state.verified ? <><Check size={12} /> Vérifié</> : <><Clock size={12} /> En attente de vérification</>}
                </span>
              )}
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}
            {hint && <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs px-3 py-2 rounded-xl">{hint}</div>}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => { setInput(e.target.value); setError('') }}
                placeholder="www.maboutique.dz"
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm font-mono"
              />
              <button
                onClick={save}
                disabled={saving || !input.trim() || input.trim().toLowerCase() === (state.domain ?? '')}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex-shrink-0"
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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    {verifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    Vérifier le DNS
                  </button>
                )}
                <button
                  onClick={removeDomain}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-red-500/70 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-all"
                >
                  <Trash2 size={12} /> Détacher
                </button>
              </div>
            )}
          </div>

          {/* DNS instructions */}
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
            <p className="text-white font-semibold text-sm">Configuration DNS</p>
            <p className="text-gray-500 text-xs">
              Chez votre registrar (là où vous avez acheté le domaine), ajoutez cet enregistrement :
            </p>
            <div className="bg-white/3 rounded-xl overflow-hidden">
              <div className="grid grid-cols-3 text-xs">
                <div className="px-3 py-2 text-gray-500 uppercase tracking-wider border-b border-white/5">Type</div>
                <div className="px-3 py-2 text-gray-500 uppercase tracking-wider border-b border-white/5">Nom</div>
                <div className="px-3 py-2 text-gray-500 uppercase tracking-wider border-b border-white/5">Valeur</div>
                <div className="px-3 py-2 text-white font-mono">CNAME</div>
                <div className="px-3 py-2 text-white font-mono truncate">{state.domain ?? 'www'}</div>
                <div className="px-3 py-2 text-white font-mono flex items-center gap-2 min-w-0">
                  <span className="truncate">{CNAME_TARGET}</span>
                  <button onClick={copyTarget} className="text-gray-500 hover:text-white flex-shrink-0" title="Copier">
                    {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-[11px]">
              La propagation DNS peut prendre de quelques minutes à 24 h. Cliquez ensuite sur « Vérifier le DNS ».
            </p>
          </div>
        </>
      )}
    </div>
  )
}
