'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store } from '@/types/database'
import { Palette, Loader2, Check, Save, Upload } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

const WHITE_LABEL_PLANS = ['enterprise', 'sur_mesure']
const LOGO_BUCKET = process.env.NEXT_PUBLIC_STORAGE_BUCKET_LOGOS ?? 'store-logos'

export default function WhiteLabelPage() {
  const [store, setStore] = useState<Store | null>(null)
  const [loading, setLoading] = useState(true)
  const [logoUrl, setLogoUrl] = useState('')
  const [platformName, setPlatformName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#3B82F6')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const data = await resolveActiveStore(supabase, user.id) as Store | null
      if (data) {
        const s = data as Store
        setStore(s)
        const wl = s.settings?.whiteLabel
        setLogoUrl(wl?.logoUrl ?? '')
        setPlatformName(wl?.platformName ?? '')
        setPrimaryColor(wl?.primaryColor ?? '#3B82F6')
      }
      setLoading(false)
    })
  }, [])

  const locked = store != null && !WHITE_LABEL_PLANS.includes(store.plan)

  const uploadLogo = async (file: File) => {
    if (!store) return
    setUploading(true); setError('')
    const supabase = createClient()
    const ext = file.name.split('.').pop()
    const path = `white-label/${store.id}-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true })
    if (upErr) { setError('Échec du téléversement : ' + upErr.message); setUploading(false); return }
    const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
    setLogoUrl(data.publicUrl)
    setUploading(false)
  }

  const save = async () => {
    if (!store) return
    setSaving(true); setError('')
    const supabase = createClient()
    const { error: err } = await supabase.from('stores').update({
      settings: { ...store.settings, whiteLabel: { logoUrl: logoUrl || undefined, platformName: platformName || undefined, primaryColor } },
    }).eq('id', store.id)
    if (err) setError('Erreur : ' + err.message)
    else { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Marque blanche</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Remplacez la marque Krenix par la vôtre dans le tableau de bord</p>
      </div>

      {locked ? (
        <LockedFeatureCard title="Marque blanche" requiredPlan="Enterprise" />
      ) : (
        <Card className="space-y-5">
          {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}

          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider font-bold">Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-dash-surface-2 border border-dash-border flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Palette size={20} className="text-dash-ink-faint" />
                )}
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink-soft hover:text-dash-ink text-sm cursor-pointer transition-all">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Téléverser
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider font-bold">Nom de la plateforme</label>
            <input value={platformName} onChange={e => setPlatformName(e.target.value)} placeholder="Krenix"
              className="w-full px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm" />
          </div>

          <div>
            <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider font-bold">Couleur principale</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-12 h-10 rounded-lg bg-transparent border border-dash-border cursor-pointer" />
              <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-32 px-3 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none text-sm font-mono" />
            </div>
          </div>

          <button onClick={save} disabled={saving}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-dash-surface transition-all hover:opacity-90 disabled:opacity-50 ${saved ? 'bg-dash-success' : 'bg-dash-accent hover:bg-dash-accent-dark'}`}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? 'Enregistré !' : 'Enregistrer'}
          </button>
          <p className="text-dash-ink-faint text-[11px]">Le logo et le nom apparaissent dans la barre latérale de votre tableau de bord.</p>
        </Card>
      )}
    </div>
  )
}
