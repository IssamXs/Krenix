'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Store } from '@/types/database'
import { Palette, Loader2, Lock, Check, Save, Upload } from 'lucide-react'

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
      const { data } = await supabase.from('stores').select('*').eq('owner_id', user.id).single()
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
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-[#3B82F6]" size={26} /></div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Marque blanche</h2>
        <p className="text-gray-500 text-sm mt-1">Remplacez la marque Novalux par la vôtre dans le tableau de bord</p>
      </div>

      {locked ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Marque blanche</p>
            <p className="text-gray-500 text-xs">Disponible sur le plan Enterprise</p>
          </div>
          <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Enterprise
          </a>
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-5">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}

          {/* Logo */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">Logo</label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="Logo" className="w-full h-full object-contain" />
                ) : (
                  <Palette size={20} className="text-gray-600" />
                )}
              </div>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-gray-300 hover:text-white text-sm cursor-pointer transition-all">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Téléverser
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
              </label>
            </div>
          </div>

          {/* Platform name */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">Nom de la plateforme</label>
            <input value={platformName} onChange={e => setPlatformName(e.target.value)} placeholder="Novalux"
              className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm" />
          </div>

          {/* Primary color */}
          <div>
            <label className="block text-xs text-gray-500 mb-2 uppercase tracking-wider">Couleur principale</label>
            <div className="flex items-center gap-3">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-12 h-10 rounded-lg bg-transparent border border-white/10 cursor-pointer" />
              <input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                className="w-32 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white outline-none text-sm font-mono" />
            </div>
          </div>

          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            style={{ background: saved ? '#22C55E' : 'linear-gradient(135deg, #3B82F6, #2563EB)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
            {saved ? 'Enregistré !' : 'Enregistrer'}
          </button>
          <p className="text-gray-600 text-[11px]">Le logo et le nom apparaissent dans la barre latérale de votre tableau de bord.</p>
        </div>
      )}
    </div>
  )
}
