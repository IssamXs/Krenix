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
const META_PIXEL_FORMAT = /^[0-9]{10,20}$/
const TIKTOK_PIXEL_FORMAT = /^[A-Z0-9]{10,30}$/i

export default function GTMPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [gtmId, setGtmId] = useState('')
  const [metaPixelId, setMetaPixelId] = useState('')
  const [tiktokPixelId, setTiktokPixelId] = useState('')
  const [saving, setSaving] = useState<'gtm' | 'meta' | 'tiktok' | null>(null)
  const [saved, setSaved] = useState<'gtm' | 'meta' | 'tiktok' | null>(null)
  const [error, setError] = useState<{ field: 'gtm' | 'meta' | 'tiktok'; message: string } | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const data = await resolveActiveStore(supabase, user.id) as Store | null
      if (data) {
        setStore(data as Store)
        setGtmId((data as Store).settings?.gtmId ?? '')
        setMetaPixelId((data as Store).settings?.metaPixelId ?? '')
        setTiktokPixelId((data as Store).settings?.tiktokPixelId ?? '')
      }
      setLoading(false)
    })
  }, [])

  // Ad pixels are available on every plan, Basic included: a store owner who
  // can't connect their own Meta/TikTok ads can't run the ads that sell the
  // product. Not a paid tier feature.

  const save = async (field: 'gtm' | 'meta' | 'tiktok', value: string) => {
    if (!store) return
    const trimmed = value.trim()
    const config = {
      gtm: { key: 'gtmId' as const, format: GTM_FORMAT, normalize: (v: string) => v.toUpperCase(), example: 'GTM-A1B2C3D' },
      meta: { key: 'metaPixelId' as const, format: META_PIXEL_FORMAT, normalize: (v: string) => v, example: '1234567890123456' },
      tiktok: { key: 'tiktokPixelId' as const, format: TIKTOK_PIXEL_FORMAT, normalize: (v: string) => v.toUpperCase(), example: 'C4A1B2C3D4E5F6G7' },
    }[field]

    const normalized = config.normalize(trimmed)
    if (normalized && !config.format.test(normalized)) {
      setError({ field, message: `Format invalide. Exemple attendu : ${config.example}` })
      return
    }
    setSaving(field); setError(null)
    const supabase = createClient()
    const { error: err } = await supabase.from('stores').update({
      settings: { ...store.settings, [config.key]: normalized || undefined },
    }).eq('id', store.id)
    if (err) {
      setError({ field, message: 'Erreur lors de la sauvegarde : ' + err.message })
    } else {
      setStore(s => s ? { ...s, settings: { ...s.settings, [config.key]: normalized || undefined } } : s)
      if (field === 'gtm') setGtmId(normalized)
      if (field === 'meta') setMetaPixelId(normalized)
      if (field === 'tiktok') setTiktokPixelId(normalized)
      setSaved(field)
      setTimeout(() => setSaved(null), 2500)
    }
    setSaving(null)
  }

  const renderCard = (opts: {
    field: 'gtm' | 'meta' | 'tiktok'
    title: string
    hint: string
    placeholder: string
    value: string
    setValue: (v: string) => void
    active: boolean
    monoUpper?: boolean
  }) => (
    <Card className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Tag size={16} className="text-dash-gold-dark" />
          <h3 className="text-dash-ink font-bold text-sm">{opts.title}</h3>
        </div>
        {opts.active && (
          <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-dash-success-soft text-dash-success">
            <Check size={12} /> Actif sur votre boutique
          </span>
        )}
      </div>
      <p className="text-dash-ink-soft text-xs">{opts.hint}</p>
      {error?.field === opts.field && (
        <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error.message}</div>
      )}
      <input
        value={opts.value}
        onChange={e => { opts.setValue(e.target.value); setError(null) }}
        placeholder={opts.placeholder}
        className={`w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all font-mono`}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => save(opts.field, opts.value)}
          disabled={saving === opts.field || !opts.value.trim()}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-dash-surface transition-all hover:opacity-90 disabled:opacity-50 ${saved === opts.field ? 'bg-dash-success' : 'bg-dash-accent hover:bg-dash-accent-dark'}`}
        >
          {saving === opts.field ? <Loader2 size={14} className="animate-spin" /> : saved === opts.field ? <Check size={14} /> : <Save size={14} />}
          {saved === opts.field ? 'Enregistré !' : 'Enregistrer'}
        </button>
        {opts.active && (
          <button
            onClick={() => save(opts.field, '')}
            disabled={saving === opts.field}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-dash-danger/70 hover:text-dash-danger border border-dash-border hover:border-dash-danger/30 transition-all disabled:opacity-50"
          >
            <Trash2 size={13} /> Retirer
          </button>
        )}
      </div>
    </Card>
  )

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Pixels & Tag Manager</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Connectez vos pixels publicitaires, avec ou sans Google Tag Manager</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-dash-ink-faint" /></div>
      ) : (
        <>
          {renderCard({
            field: 'meta',
            title: 'Meta Pixel (Facebook / Instagram)',
            hint: 'Trouvez votre ID dans Meta Events Manager → Sources de données → votre pixel. Numérique uniquement.',
            placeholder: '1234567890123456',
            value: metaPixelId,
            setValue: setMetaPixelId,
            active: !!store?.settings?.metaPixelId,
          })}
          {renderCard({
            field: 'tiktok',
            title: 'TikTok Pixel',
            hint: 'Trouvez votre ID dans TikTok Ads Manager → Bibliothèque d\'événements → votre pixel.',
            placeholder: 'C4A1B2C3D4E5F6G7',
            value: tiktokPixelId,
            setValue: setTiktokPixelId,
            active: !!store?.settings?.tiktokPixelId,
          })}
          {renderCard({
            field: 'gtm',
            title: 'Google Tag Manager (avancé)',
            hint: 'Trouvez votre ID dans Google Tag Manager → Admin → Informations sur le conteneur. Format : GTM-XXXXXXX. Utile si vous voulez gérer plusieurs scripts (Pixel, Google Ads, Hotjar...) au même endroit.',
            placeholder: 'GTM-XXXXXXX',
            value: gtmId,
            setValue: setGtmId,
            active: !!store?.settings?.gtmId,
          })}
          <p className="text-dash-ink-faint text-[11px] px-1">
            Meta Pixel et TikTok Pixel s&apos;injectent directement — aucune configuration Google Tag Manager requise. GTM reste disponible en option si vous préférez gérer vos scripts vous-même.
          </p>
        </>
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
