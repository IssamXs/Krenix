'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { WILAYAS } from '@/lib/wilayas'
import { BUSINESS_PLANS, type Plan } from '@/types/database'
import { Truck, Loader2, Check, Lock, Trash2, KeyRound } from 'lucide-react'

const SOON_COMPANIES = [
  { name: 'ZR Express', logo: '/logos/zr-express.jpg', desc: 'Couverture nationale — tarifs compétitifs', bg: '#ffffff' },
  { name: 'Maystro', logo: '/logos/maystro.jpg', desc: 'Suivi en temps réel', bg: '#1B9BE2' },
]

export default function DeliveryIntegrationsPage() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [fromWilaya, setFromWilaya] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [apiId, setApiId] = useState('')
  const [apiToken, setApiToken] = useState('')
  const [formWilaya, setFormWilaya] = useState('Alger')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data: store } = await supabase.from('stores').select('plan').eq('owner_id', user.id).single()
      setPlan((store?.plan ?? null) as Plan | null)
      try {
        const res = await fetch('/api/integrations/delivery')
        if (res.ok) {
          const d = await res.json()
          setConnected(!!d.connected)
          setFromWilaya(d.integration?.from_wilaya ?? null)
        }
      } catch { /* non-blocking */ }
      setLoading(false)
    })
  }, [])

  const locked = plan != null && !BUSINESS_PLANS.includes(plan)

  const connect = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/integrations/delivery', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiId, apiToken, fromWilaya: formWilaya }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur de connexion'); return }
      setConnected(true); setFromWilaya(formWilaya); setShowForm(false); setApiId(''); setApiToken('')
    } finally { setSaving(false) }
  }

  const disconnect = async () => {
    if (!confirm('Déconnecter Yalidine ? Les commandes ne pourront plus être expédiées automatiquement.')) return
    await fetch('/api/integrations/delivery', { method: 'DELETE' })
    setConnected(false); setFromWilaya(null)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">← Intégrations</a>
      <div>
        <h2 className="text-2xl font-bold text-white">Sociétés de livraison</h2>
        <p className="text-gray-500 text-sm mt-1">Connectez votre propre compte livreur pour créer les expéditions automatiquement</p>
      </div>

      {/* Yalidine — live integration */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
        <div className="flex items-center gap-5">
          <div className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-2" style={{ background: '#C8201C' }}>
            <Image src="/logos/yalidine.jpg" alt="Yalidine" width={160} height={96} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-lg">Yalidine</p>
            <p className="text-gray-500 text-sm mt-0.5">Leader du marché — API de création de colis</p>
          </div>
          {loading ? (
            <Loader2 size={18} className="animate-spin text-gray-500" />
          ) : locked ? (
            <a href="/dashboard/billing/upgrade" className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
              <Lock size={12} /> Business
            </a>
          ) : connected ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 flex-shrink-0">
              <Check size={13} /> Connecté
            </span>
          ) : (
            <button onClick={() => setShowForm(f => !f)} className="text-xs font-bold px-4 py-2 rounded-xl text-white flex-shrink-0 transition-all hover:opacity-90" style={{ background: '#C8201C' }}>
              Connecter
            </button>
          )}
        </div>

        {/* Connected details */}
        {!loading && !locked && connected && (
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              Wilaya de départ : <span className="text-white font-medium">{fromWilaya ?? '—'}</span>
            </p>
            <button onClick={disconnect} className="flex items-center gap-1.5 text-xs text-red-500/70 hover:text-red-400 transition-colors">
              <Trash2 size={12} /> Déconnecter
            </button>
          </div>
        )}

        {/* Connect form */}
        {!loading && !locked && !connected && showForm && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            <div className="flex items-start gap-2 text-xs text-gray-500 bg-white/3 rounded-lg px-3 py-2">
              <KeyRound size={13} className="mt-0.5 flex-shrink-0 text-gray-400" />
              Récupérez votre <span className="text-gray-300">API ID</span> et <span className="text-gray-300">API Token</span> depuis votre tableau de bord Yalidine (section Développeurs / API).
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">API ID</label>
              <input value={apiId} onChange={e => setApiId(e.target.value)} placeholder="Votre API ID Yalidine"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#C8201C]/60 transition-all text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">API Token</label>
              <input value={apiToken} onChange={e => setApiToken(e.target.value)} type="password" placeholder="Votre API Token Yalidine"
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#C8201C]/60 transition-all text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 uppercase tracking-wider">Wilaya de départ (point de collecte)</label>
              <select value={formWilaya} onChange={e => setFormWilaya(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#C8201C]/60 transition-all text-sm">
                {WILAYAS.map(w => <option key={w} value={w} className="bg-[#1a1a24]">{w}</option>)}
              </select>
            </div>
            <button onClick={connect} disabled={saving || !apiId.trim() || !apiToken.trim()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50" style={{ background: '#C8201C' }}>
              {saving ? <><Loader2 size={15} className="animate-spin" /> Vérification…</> : 'Vérifier et connecter'}
            </button>
          </div>
        )}
      </div>

      {/* Other couriers — coming soon */}
      {SOON_COMPANIES.map(c => (
        <div key={c.name} className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-5 opacity-70">
          <div className="w-32 h-20 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center p-2" style={{ background: c.bg }}>
            <Image src={c.logo} alt={c.name} width={160} height={96} className="w-full h-full object-contain" />
          </div>
          <div className="flex-1">
            <p className="text-white font-semibold text-lg">{c.name}</p>
            <p className="text-gray-500 text-sm mt-0.5">{c.desc}</p>
          </div>
          <span className="text-xs px-3 py-1.5 rounded-lg bg-white/5 text-gray-500 font-semibold flex-shrink-0">Bientôt</span>
        </div>
      ))}

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-6 text-center">
        <Truck size={32} className="mx-auto mb-3 text-gray-600" />
        <p className="text-white font-semibold">Comment ça marche</p>
        <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
          Une fois connecté, un bouton « Créer l&apos;expédition » apparaît sur chaque commande : il crée le colis chez Yalidine et récupère le numéro de suivi automatiquement.
        </p>
      </div>
    </div>
  )
}
