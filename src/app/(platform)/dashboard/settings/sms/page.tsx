'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Loader2, Check, Lock, Trash2, KeyRound } from 'lucide-react'

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
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-[#3B82F6]" size={26} /></div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">SMS de confirmation</h2>
        <p className="text-gray-500 text-sm mt-1">Envoyez un SMS automatique au client quand sa commande est confirmée</p>
      </div>

      {locked ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">SMS automatiques (Twilio)</p>
            <p className="text-gray-500 text-xs">Disponible à partir du plan Business</p>
          </div>
          <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Business
          </a>
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare size={16} className="text-[#3B82F6]" />
              <h3 className="text-white font-semibold text-sm">Compte Twilio</h3>
            </div>
            {connected && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400">
                <Check size={12} /> Connecté ({sender})
              </span>
            )}
          </div>
          <div className="flex items-start gap-2 text-xs text-gray-500 bg-white/3 rounded-lg px-3 py-2">
            <KeyRound size={13} className="mt-0.5 flex-shrink-0 text-gray-400" />
            Trouvez votre Account SID et Auth Token dans la console Twilio. Le numéro expéditeur doit être un numéro Twilio actif (format +1..., ou identifiant alphanumérique).
          </div>
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}

          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Account SID</label>
            <input value={sid} onChange={e => { setSid(e.target.value); setError('') }} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Auth Token</label>
            <input value={token} onChange={e => { setToken(e.target.value); setError('') }} type="password" placeholder="Votre Auth Token"
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm font-mono" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Numéro expéditeur</label>
            <input value={sender} onChange={e => { setSender(e.target.value); setError('') }} placeholder="+1..."
              className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm font-mono" />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving || !sid.trim() || !token.trim() || !sender.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={14} className="animate-spin" /> : 'Vérifier et connecter'}
            </button>
            {connected && (
              <button onClick={remove} className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-red-500/70 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-all">
                <Trash2 size={13} /> Déconnecter
              </button>
            )}
          </div>
          <p className="text-gray-600 text-[11px]">
            Le SMS utilise votre modèle de message « Confirmée » (Paramètres → messages WhatsApp/commande).
          </p>
        </div>
      )}
    </div>
  )
}
