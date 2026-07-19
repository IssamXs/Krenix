'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Loader2, Check, Trash2, KeyRound } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

const INPUT = 'w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm font-mono'
const LABEL = 'block text-xs text-dash-ink-soft mb-1.5 uppercase tracking-wider font-bold'

export default function SmsSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [locked, setLocked] = useState(false)
  const [sender, setSender] = useState('')
  const [sid, setSid] = useState('')
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/integrations/sms')
      .then(async r => {
        if (r.status === 403) { setLocked(true); return null }
        return r.ok ? r.json() : null
      })
      .then(d => { if (d) { setConnected(!!d.connected); setSender(d.sender ?? '') } setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/integrations/sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountSid: sid, authToken: token, sender }),
      })
      const d = await res.json()
      if (res.status === 403) { setLocked(true); return }
      if (!res.ok) { setError(d.error ?? 'Erreur'); return }
      setConnected(true); setSid(''); setToken('')
    } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!confirm('Déconnecter Twilio ? Les SMS de confirmation ne seront plus envoyés.')) return
    await fetch('/api/integrations/sms', { method: 'DELETE' })
    setConnected(false); setSender('')
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">SMS de confirmation</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Envoyez un SMS automatique au client quand sa commande est confirmée</p>
      </div>

      {locked ? (
        <LockedFeatureCard title="SMS automatiques (Twilio)" requiredPlan="Business" />
      ) : (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-dash-accent" />
              <h3 className="text-dash-ink font-bold text-sm">Compte Twilio</h3>
            </div>
            {connected && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-dash-success-soft text-dash-success">
                <Check size={12} /> Connecté ({sender})
              </span>
            )}
          </div>
          <div className="flex items-start gap-2 text-xs text-dash-ink-soft bg-dash-surface-2 rounded-lg px-3 py-2">
            <KeyRound size={13} className="mt-0.5 flex-shrink-0 text-dash-ink-soft" />
            Trouvez votre Account SID et Auth Token dans la console Twilio. Le numéro expéditeur doit être un numéro Twilio actif (format +1..., ou identifiant alphanumérique).
          </div>
          {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}

          <div>
            <label className={LABEL}>Account SID</label>
            <input value={sid} onChange={e => { setSid(e.target.value); setError('') }} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Auth Token</label>
            <input value={token} onChange={e => { setToken(e.target.value); setError('') }} type="password" placeholder="Votre Auth Token" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Numéro expéditeur</label>
            <input value={sender} onChange={e => { setSender(e.target.value); setError('') }} placeholder="+1..." className={INPUT} />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving || !sid.trim() || !token.trim() || !sender.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-dash-surface font-bold text-sm transition-all disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Vérifier et connecter'}
            </button>
            {connected && (
              <button onClick={remove} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-dash-danger/70 hover:text-dash-danger border border-dash-border hover:border-dash-danger/30 transition-all">
                <Trash2 size={13} /> Déconnecter
              </button>
            )}
          </div>
          <p className="text-dash-ink-faint text-[11px]">
            Le SMS utilise votre modèle de message « Confirmée » (Paramètres → messages WhatsApp/commande).
          </p>
        </Card>
      )}
    </div>
  )
}
