'use client'

import { useEffect, useState } from 'react'
import { Table2, Loader2, Check, Trash2, Send, Save } from 'lucide-react'

export default function SheetsIntegrationPage() {
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    fetch('/api/integrations/sheets')
      .then(r => r.json())
      .then(d => { if (!d.error) { setSavedUrl(d.url ?? null); setUrl(d.url ?? '') } setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/integrations/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur'); return }
      setSavedUrl(d.url); setNotice('Webhook enregistré ✅')
    } finally { setSaving(false) }
  }

  const test = async () => {
    setTesting(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/integrations/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: true }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Échec du test'); return }
      setNotice('Ligne de test envoyée — vérifiez votre feuille Google 📄')
    } finally { setTesting(false) }
  }

  const remove = async () => {
    if (!confirm('Déconnecter Google Sheets ? Les nouvelles commandes ne seront plus exportées.')) return
    await fetch('/api/integrations/sheets', { method: 'DELETE' })
    setSavedUrl(null); setUrl(''); setNotice('')
  }

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h2 className="text-2xl font-bold text-white">Google Sheets</h2>
        <p className="text-gray-500 text-sm mt-1">Exportez automatiquement chaque nouvelle commande vers une feuille Google</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-gray-500" /></div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={16} className="text-emerald-400" />
              <h3 className="text-white font-semibold text-sm">URL du webhook</h3>
            </div>
            {savedUrl && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400">
                <Check size={12} /> Connecté
              </span>
            )}
          </div>

          <p className="text-gray-500 text-xs">
            Créez un script Google Apps (ou un hook Zapier/Make) qui ajoute une ligne à votre feuille, puis collez son URL ici.
            Chaque commande sera envoyée avec : n°, nom, téléphone, wilaya, commune, produit, quantité, total, statut, date.
          </p>

          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}
          {notice && <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-2 rounded-xl">{notice}</div>}

          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setError('') }}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-emerald-500/50 transition-all text-sm font-mono"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={save}
              disabled={saving || !url.trim() || url.trim() === savedUrl}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Enregistrer
            </button>
            {savedUrl && (
              <>
                <button
                  onClick={test}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/5 border border-white/10 text-gray-300 hover:text-white transition-all disabled:opacity-50"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Envoyer un test
                </button>
                <button
                  onClick={remove}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-red-500/70 hover:text-red-400 border border-white/10 hover:border-red-500/30 transition-all"
                >
                  <Trash2 size={13} /> Déconnecter
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
