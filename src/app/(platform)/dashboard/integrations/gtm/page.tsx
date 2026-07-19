'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { type Store } from '@/types/database'
import { Tag, Save, Loader2, Check, Trash2 } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'

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
      const data = await resolveActiveStore(supabase, user.id) as Store | null
      if (data) {
        setStore(data as Store)
        setGtmId((data as Store).settings?.gtmId ?? '')
      }
      setLoading(false)
    })
  }, [])

  // Ad pixels are available on every plan, Basic included: a store owner who
  // can't connect their own Meta/TikTok ads can't run the ads that sell the
  // product. Not a paid tier feature.

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
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Google Tag Manager</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Ajoutez des scripts tiers sans modifier le code de votre boutique</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-dash-ink-faint" /></div>
      ) : (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-dash-gold-dark" />
              <h3 className="text-dash-ink font-bold text-sm">ID de conteneur GTM</h3>
            </div>
            {store?.settings?.gtmId && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-dash-success-soft text-dash-success">
                <Check size={12} /> Actif sur votre boutique
              </span>
            )}
          </div>
          <p className="text-dash-ink-soft text-xs">
            Trouvez votre ID dans Google Tag Manager → Admin → Informations sur le conteneur. Format : GTM-XXXXXXX
          </p>
          {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}
          <input
            value={gtmId}
            onChange={e => { setGtmId(e.target.value); setError('') }}
            placeholder="GTM-XXXXXXX"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all font-mono"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => save(gtmId)}
              disabled={saving || !gtmId.trim()}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-dash-surface transition-all hover:opacity-90 disabled:opacity-50 ${saved ? 'bg-dash-success' : 'bg-dash-accent hover:bg-dash-accent-dark'}`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? 'Enregistré !' : 'Enregistrer'}
            </button>
            {store?.settings?.gtmId && (
              <button
                onClick={() => save('')}
                disabled={saving}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-dash-danger/70 hover:text-dash-danger border border-dash-border hover:border-dash-danger/30 transition-all disabled:opacity-50"
              >
                <Trash2 size={13} /> Retirer
              </button>
            )}
          </div>
          <p className="text-dash-ink-faint text-[11px]">
            Une fois enregistré, le script GTM est injecté automatiquement sur toutes les pages de votre boutique.
          </p>
        </Card>
      )}

      <Card className="space-y-3">
        <p className="text-dash-ink font-bold text-sm">Utilisations courantes</p>
        {COMMON_USES.map(item => (
          <div key={item} className="flex items-center gap-2 text-sm text-dash-ink-soft">
            <span className="text-dash-gold-dark">→</span> {item}
          </div>
        ))}
      </Card>
    </div>
  )
}
