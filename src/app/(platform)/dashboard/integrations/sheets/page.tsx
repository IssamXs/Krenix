'use client'

import { useEffect, useState } from 'react'
import { Table2, Loader2, Check, Trash2, Send, Save, Code2, Copy, ExternalLink } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import { SHEETS_APPS_SCRIPT } from '@/lib/sheets-apps-script'

const SETUP_STEPS = [
  'Ouvrez votre Google Sheet (ou créez-en un nouveau).',
  'Menu Extensions → Apps Script.',
  'Supprimez le code par défaut et collez le code ci-dessous (bouton Copier).',
  'Cliquez sur Déployer → Nouveau déploiement.',
  'Type : Application Web. Exécuter en tant que : Moi. Qui a accès : Tout le monde.',
  'Cliquez Déployer, puis autorisez l’accès (c’est votre propre script).',
  'Copiez l’URL se terminant par /exec et collez-la ci-dessous dans Krenix.',
]

export default function SheetsIntegrationPage() {
  const [loading, setLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [codeCopied, setCodeCopied] = useState(false)

  const copyScript = () => {
    navigator.clipboard.writeText(SHEETS_APPS_SCRIPT)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 2500)
  }

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
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">
        ← Intégrations
      </a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Google Sheets</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Exportez automatiquement chaque nouvelle commande vers une feuille Google</p>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Code2 size={16} className="text-dash-success" />
          <h3 className="text-dash-ink font-bold text-sm">Étape 1 — Coller le code dans Apps Script</h3>
        </div>
        <p className="text-dash-ink-soft text-xs">
          Ce code reçoit chaque commande et l&apos;ajoute proprement dans un onglet <span className="font-mono text-dash-ink">Commandes</span> —
          en-têtes en français, colonnes ajustées automatiquement, statuts traduits. Aucune ligne en désordre.
        </p>

        <ol className="space-y-1.5 text-xs text-dash-ink-soft list-decimal list-inside">
          {SETUP_STEPS.map((step, i) => <li key={i}>{step}</li>)}
        </ol>

        <div className="relative">
          <pre className="max-h-64 overflow-y-auto rounded-xl bg-dash-surface-2 border border-dash-border p-3 text-[11px] leading-relaxed text-dash-ink font-mono whitespace-pre">
            <code>{SHEETS_APPS_SCRIPT}</code>
          </pre>
          <button
            onClick={copyScript}
            className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 bg-dash-success"
          >
            {codeCopied ? <><Check size={12} /> Copié !</> : <><Copy size={12} /> Copier le code</>}
          </button>
        </div>

        <a
          href="https://script.google.com/home"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-dash-success hover:opacity-80 transition-opacity font-medium"
        >
          Ouvrir Google Apps Script <ExternalLink size={11} />
        </a>
      </Card>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={22} className="animate-spin text-dash-ink-faint" /></div>
      ) : (
        <Card className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Table2 size={16} className="text-dash-success" />
              <h3 className="text-dash-ink font-bold text-sm">Étape 2 — Coller l&apos;URL du déploiement</h3>
            </div>
            {savedUrl && (
              <span className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg bg-dash-success-soft text-dash-success">
                <Check size={12} /> Connecté
              </span>
            )}
          </div>

          <p className="text-dash-ink-soft text-xs">
            Collez ici l&apos;URL <span className="font-mono text-dash-ink">/exec</span> obtenue après le déploiement du script ci-dessus
            (ou l&apos;URL d&apos;un hook Zapier/Make si vous préférez). Chaque commande sera envoyée automatiquement.
          </p>

          {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}
          {notice && <div className="bg-dash-success-soft border border-dash-success/20 text-dash-success text-xs px-3 py-2 rounded-xl">{notice}</div>}

          <input
            value={url}
            onChange={e => { setUrl(e.target.value); setError('') }}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-success/50 transition-all text-sm font-mono"
          />

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={save}
              disabled={saving || !url.trim() || url.trim() === savedUrl}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-dash-surface transition-all hover:opacity-90 disabled:opacity-50 bg-dash-success"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Enregistrer
            </button>
            {savedUrl && (
              <>
                <button
                  onClick={test}
                  disabled={testing}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-dash-surface-2 border border-dash-border text-dash-ink-soft hover:text-dash-ink transition-all disabled:opacity-50"
                >
                  {testing ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Envoyer un test
                </button>
                <button
                  onClick={remove}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs text-dash-danger/70 hover:text-dash-danger border border-dash-border hover:border-dash-danger/30 transition-all"
                >
                  <Trash2 size={13} /> Déconnecter
                </button>
              </>
            )}
          </div>
        </Card>
      )}
    </div>
  )
}
