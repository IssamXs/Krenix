'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Loader2, Check, Trash2, Truck } from 'lucide-react'

const OTHERS = [
  { provider: 'maystro', label: 'Maystro', color: '#1B9BE2', logo: '/logos/maystro.jpg', logoBg: '#1B9BE2', idLabel: 'API Key', tokenLabel: 'Store ID' },
  { provider: 'zr_express', label: 'ZR Express', color: '#111827', logo: '/logos/zr-express.jpg', logoBg: '#ffffff', idLabel: 'Token', tokenLabel: 'Clé (key)' },
  { provider: 'procolis', label: 'Procolis', color: '#0EA5E9', logo: null, logoBg: '#0EA5E922', idLabel: 'Token', tokenLabel: 'Clé (key)' },
] as const

export default function OtherCouriers({ connectedProviders }: { connectedProviders: string[] }) {
  const [done, setDone] = useState<Set<string>>(new Set(connectedProviders))
  const [openP, setOpenP] = useState<string | null>(null)
  const [id, setId] = useState('')
  const [tok, setTok] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const connect = async (provider: string) => {
    setBusy(true); setErr('')
    try {
      const res = await fetch('/api/integrations/delivery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiId: id, apiToken: tok }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? 'Erreur'); return }
      setDone(s => new Set(s).add(provider)); setOpenP(null); setId(''); setTok('')
    } finally { setBusy(false) }
  }

  const disconnect = async (provider: string) => {
    await fetch('/api/integrations/delivery', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider }),
    })
    setDone(s => { const n = new Set(s); n.delete(provider); return n })
  }

  return (
    <>
      {OTHERS.map(c => {
        const isConnected = done.has(c.provider)
        const isOpen = openP === c.provider
        return (
          <div key={c.provider} className="bg-[#111118] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center gap-5">
              <div className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-2" style={{ background: c.logoBg }}>
                {c.logo ? (
                  <Image src={c.logo} alt={c.label} width={160} height={96} className="w-full h-full object-contain" />
                ) : (
                  <Truck size={22} style={{ color: c.color }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold text-lg">{c.label}</p>
                <p className="text-gray-500 text-sm mt-0.5">Créez vos expéditions automatiquement</p>
              </div>
              {isConnected ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 flex-shrink-0">
                  <Check size={13} /> Connecté
                </span>
              ) : (
                <button onClick={() => { setOpenP(isOpen ? null : c.provider); setErr('') }}
                  className="text-xs font-bold px-4 py-2 rounded-xl text-white flex-shrink-0 transition-all hover:opacity-90" style={{ background: c.color }}>
                  Connecter
                </button>
              )}
            </div>

            {isConnected && (
              <div className="mt-4 pt-4 border-t border-white/5 flex justify-end">
                <button onClick={() => disconnect(c.provider)} className="flex items-center gap-1.5 text-xs text-red-500/70 hover:text-red-400 transition-colors">
                  <Trash2 size={12} /> Déconnecter
                </button>
              </div>
            )}

            {!isConnected && isOpen && (
              <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
                {err && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{err}</div>}
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">{c.idLabel}</label>
                  <input value={id} onChange={e => { setId(e.target.value); setErr('') }}
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 transition-all text-sm font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">{c.tokenLabel}</label>
                  <input value={tok} onChange={e => { setTok(e.target.value); setErr('') }} type="password"
                    className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-white/30 transition-all text-sm font-mono" />
                </div>
                <button onClick={() => connect(c.provider)} disabled={busy || !id.trim() || !tok.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ background: c.color }}>
                  {busy ? <><Loader2 size={15} className="animate-spin" /> Vérification…</> : 'Vérifier et connecter'}
                </button>
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
