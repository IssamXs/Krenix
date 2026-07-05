'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { WILAYAS } from '@/lib/wilayas'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'
import OtherCouriers from '@/components/dashboard/OtherCouriers'
import { Truck, Loader2, Check, Lock, Trash2, KeyRound } from 'lucide-react'

interface CommuneFee { communeName: string; home: number | null; desk: number | null }
interface FeesResult { fromWilaya: string; toWilaya: string; communes: CommuneFee[] }

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

  // Fee lookup
  const [feeWilaya, setFeeWilaya] = useState('Alger')
  const [fees, setFees] = useState<FeesResult | null>(null)
  const [feesLoading, setFeesLoading] = useState(false)
  const [feesError, setFeesError] = useState('')

  // Auto-open label toggle
  const [storeId, setStoreId] = useState<string | null>(null)
  const [autoPrint, setAutoPrint] = useState(false)
  const [storeSettings, setStoreSettings] = useState<Record<string, unknown>>({})
  const [otherConnected, setOtherConnected] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, plan, settings') as { id: string; plan: Plan; settings: Record<string, unknown> | null } | null
      setPlan((store?.plan ?? null) as Plan | null)
      if (store) {
        setStoreId(store.id)
        setStoreSettings((store.settings ?? {}) as Record<string, unknown>)
        setAutoPrint(!!(store.settings as { autoPrintLabel?: boolean } | null)?.autoPrintLabel)
      }
      try {
        const res = await fetch('/api/integrations/delivery')
        if (res.ok) {
          const d = await res.json()
          setConnected(!!d.connected)
          setFromWilaya(d.integration?.from_wilaya ?? null)
          setOtherConnected((d.connections ?? []).map((c: { provider: string }) => c.provider).filter((p: string) => p !== 'yalidine'))
        }
      } catch { /* non-blocking */ }
      setLoading(false)
    })
  }, [])

  const locked = plan != null && !ULTIMATE_PLANS.includes(plan)

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
    setConnected(false); setFromWilaya(null); setFees(null)
  }

  const toggleAutoPrint = async () => {
    if (!storeId) return
    const next = !autoPrint
    setAutoPrint(next)
    const supabase = createClient()
    await supabase.from('stores').update({ settings: { ...storeSettings, autoPrintLabel: next } }).eq('id', storeId)
    setStoreSettings(s => ({ ...s, autoPrintLabel: next }))
  }

  const lookupFees = async () => {
    setFeesLoading(true); setFeesError(''); setFees(null)
    try {
      const res = await fetch(`/api/integrations/delivery/fees?toWilaya=${encodeURIComponent(feeWilaya)}`)
      const d = await res.json()
      if (!res.ok) { setFeesError(d.error ?? 'Tarifs indisponibles'); return }
      setFees(d as FeesResult)
    } catch {
      setFeesError('Erreur réseau')
    } finally {
      setFeesLoading(false)
    }
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
              <Lock size={12} /> Ultimate
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

        {/* Auto-print label toggle */}
        {!loading && !locked && connected && (
          <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between gap-3">
            <div>
              <p className="text-white text-sm font-medium">Impression automatique de l&apos;étiquette</p>
              <p className="text-gray-500 text-xs mt-0.5">Ouvre l&apos;étiquette prête à imprimer après la création du colis</p>
            </div>
            <button
              onClick={toggleAutoPrint}
              className="relative w-11 h-6 rounded-full transition-colors flex-shrink-0"
              style={{ background: autoPrint ? '#22C55E' : 'rgba(255,255,255,0.15)' }}
              aria-label="Impression automatique"
            >
              <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: autoPrint ? '22px' : '2px' }} />
            </button>
          </div>
        )}

        {/* Fee lookup */}
        {!loading && !locked && connected && (
          <div className="mt-4 pt-4 border-t border-white/5 space-y-3">
            <p className="text-xs text-gray-500 uppercase tracking-wider">Consulter les tarifs de livraison</p>
            <div className="flex gap-2">
              <select value={feeWilaya} onChange={e => setFeeWilaya(e.target.value)}
                className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#C8201C]/60 transition-all text-sm">
                {WILAYAS.map(w => <option key={w} value={w} className="bg-[#1a1a24]">{w}</option>)}
              </select>
              <button onClick={lookupFees} disabled={feesLoading}
                className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 flex-shrink-0" style={{ background: '#C8201C' }}>
                {feesLoading ? <Loader2 size={15} className="animate-spin" /> : 'Consulter'}
              </button>
            </div>

            {feesError && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{feesError}</div>}

            {fees && (
              <div className="space-y-1.5">
                <p className="text-xs text-gray-500">
                  {fees.fromWilaya} → <span className="text-white">{fees.toWilaya}</span>
                  <span className="text-gray-600"> · domicile / stop desk</span>
                </p>
                {fees.communes.length === 0 ? (
                  <p className="text-xs text-gray-600">Aucun tarif retourné pour cette destination.</p>
                ) : (
                  <div className="max-h-56 overflow-y-auto rounded-xl border border-white/5 divide-y divide-white/5">
                    {fees.communes.map(c => (
                      <div key={c.communeName} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <span className="text-gray-300 truncate">{c.communeName}</span>
                        <span className="text-white font-medium whitespace-nowrap flex-shrink-0">
                          {c.home != null ? `${c.home.toLocaleString('fr-DZ')} DA` : '—'}
                          <span className="text-gray-600"> / </span>
                          {c.desk != null ? `${c.desk.toLocaleString('fr-DZ')} DA` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
      {!loading && !locked && <OtherCouriers connectedProviders={otherConnected} />}

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
