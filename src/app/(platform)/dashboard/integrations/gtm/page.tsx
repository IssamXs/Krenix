'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ULTIMATE_PLANS, type Plan, type Store } from '@/types/database'
import { Tag, Save, Loader2, Check, Lock, Trash2 } from 'lucide-react'

const COMMON_USES = [
  'Facebook Pixel & Conversions API',
  'Google Ads remarketing',
  'Snapchat Pixel',
  'TikTok Pixel',
  'Hotjar / Microsoft Clarity',
]

const GTM_FORMAT = /^GTM-[A-Z0-9]{4,10}$/i

export default function GTMPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [gtmId, setGtmId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const { data } = await supabase.from('stores').select('*').eq('owner_id', user.id).single()
      if (data) {
        setStore(data as Store)
        setGtmId((data as Store).settings?.gtmId ?? '')
      }
      setLoading(false)
    })
  }, [])

  const locked = store != null && !ULTIMATE_PLANS.includes(store.plan as Plan)

  const save = async (value: string) => {
    if (!store) return
    const trimmed = value.trim().toUpperCase()
    if (trimmed && !GTM_FORMAT.test(trimmed)) {
      setError('Format invalide. Exemple attendu : GTM-A1B2C3D')
      return
    }
    setSaving(true); setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from('stores').update({
      settings: { ...store.settings, gtmId: trimmed || undefined },
    }).eq('id', store.id)
    if (err) {
      setError('Erreur lors de la sauvegarde : ' + err.message)
    } else {
      setStore(s => s ? { ...s, settings: { ...s.settings, gtmId: trimmed || undefined } } : s)
      setGtmId(trimmed)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
    setSaving(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h2 className="text-2xl font-bold text-white">Google Tag Manager</h2>
        <p className="text-gray-500 text-sm mt-1">Ajoutez des scripts tiers sans modifier le code de votre boutique</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-500" /></div>
      ) : locked ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Pixel Facebook & TikTok via GTM</p>
            <p className="text-gray-500 text-xs">Disponible à partir du plan Ultimate</p>
          </div>
          <a href="/dashboard/billing/upgrade"
            className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Ultimate
          </a>
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-[#F59E0B]" />
              <h3 className="text-white font-semibold text-sm">ID de conteneur GTM</h3>
            </div>
            {store?.settings?.gtmId && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400">
                <Check size={12} /> Actif sur votre boutique
              </span>
            )}
          </div>
          <p className="text-gray-500 text-xs">
            Trouvez votre ID dans Google Tag Manager → Admin → Informations sur le conteneur. Format : GTM-XXXXXXX
          </p>
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}
          <input
            value={gtmId}
            onChange={e => { setGtmId(e.target.value); setError('') }}
            placeholder="GTM-XXXXXXX"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all font-mono"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => save(gtmId)}
              disabled={saving || !gtmId.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: saved ? '#22C55E' : 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? 'Enregistré !' : 'Enregistrer'}
            </button>
            {store?.settings?.gtmId && (
              <button
                onClick={() => save('')}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-red-500/70 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-all disabled:opacity-50"
              >
                <Trash2 size={13} /> Retirer
              </button>
            )}
          </div>
          <p className="text-gray-600 text-[11px]">
            Une fois enregistré, le script GTM est injecté automatiquement sur toutes les pages de votre boutique.
          </p>
        </div>
      )}

      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
        <p className="text-white font-semibold text-sm">Utilisations courantes</p>
        {COMMON_USES.map(item => (
          <div key={item} className="flex items-center gap-2 text-sm text-gray-400">
            <span className="text-[#F59E0B]">→</span> {item}
          </div>
        ))}
      </div>
    </div>
  )
}
