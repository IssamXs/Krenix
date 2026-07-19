'use client'
import { useEffect, useState } from 'react'
import { Loader2, Ban, CheckCircle, Trash2, Store as StoreIcon, ShieldAlert, Plus, X } from 'lucide-react'
import { useProtectedAction } from '@/components/super-admin/StepUpModal'

interface Client {
  ownerId: string; email: string; banned: boolean; storeCount: number
  stores: { id: string; name: string; slug: string; plan: string; subscription_status: string; is_suspended: boolean }[]
}

export default function SuperAdminClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)
  const [confirmText, setConfirmText] = useState('')
  
  // New Client State
  const [showAddClient, setShowAddClient] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addError, setAddError] = useState('')

  const { run, modal } = useProtectedAction()

  const load = () => fetch('/api/super-admin/clients').then(r => r.json()).then(d => { setClients(d.clients ?? []); setLoading(false) })
  useEffect(() => { fetch('/api/super-admin/clients').then(r => r.json()).then(d => { setClients(d.clients ?? []); setLoading(false) }) }, [])

  const toggleBan = async (c: Client) => {
    setBusy(c.ownerId)
    const res = await run(() => fetch(`/api/super-admin/clients/${c.ownerId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: c.banned ? 'unban' : 'ban' }),
    }))
    if (res && res.ok) await load()
    setBusy(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const expected = deleting.stores[0]?.name ?? deleting.email
    if (confirmText !== expected) return
    setBusy(deleting.ownerId)
    const res = await run(() => fetch(`/api/super-admin/clients/${deleting.ownerId}`, { method: 'DELETE' }))
    if (res && res.ok) { setDeleting(null); setConfirmText(''); await load() }
    setBusy(null)
  }

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddError('')
    setBusy('adding')
    const res = await run(() => fetch('/api/super-admin/clients', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newEmail, password: newPassword })
    }))
    
    if (res && res.ok) {
      setShowAddClient(false)
      setNewEmail('')
      setNewPassword('')
      await load()
    } else if (res) {
      const data = await res.json()
      setAddError(data.error || 'Erreur lors de la création')
    }
    setBusy(null)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Clients</h1>
          <p className="text-dash-ink-soft text-sm mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => setShowAddClient(true)} className="flex items-center gap-2 px-4 py-2 bg-dash-accent hover:bg-dash-accent-dark text-white rounded-xl text-sm font-semibold transition-all">
          <Plus size={16} /> Ajouter un client
        </button>
      </div>

      {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-dash-accent" /></div> : (
        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.ownerId} className={`bg-dash-surface border rounded-[20px] p-5 ${c.banned ? 'border-dash-danger/30 opacity-70' : 'border-dash-border'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-dash-ink font-semibold text-sm truncate">{c.email}</p>
                    {c.banned && <span className="text-dash-danger text-xs bg-dash-danger-soft px-2 py-0.5 rounded-full">Banni</span>}
                  </div>
                  <p className="text-dash-ink-soft text-xs mt-0.5">{c.storeCount} boutique{c.storeCount !== 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.stores.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1 text-[11px] text-dash-ink-soft bg-dash-surface-2 px-2 py-0.5 rounded-lg">
                        <StoreIcon size={10} /> {s.slug}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleBan(c)} disabled={busy === c.ownerId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${c.banned ? 'bg-dash-success-soft text-dash-success hover:bg-dash-success/15' : 'bg-dash-warning-soft text-dash-warning-dark hover:bg-dash-warning/15'} disabled:opacity-50`}>
                    {busy === c.ownerId ? <Loader2 size={13} className="animate-spin" /> : c.banned ? <CheckCircle size={13} /> : <Ban size={13} />}
                    {c.banned ? 'Débannir' : 'Bannir'}
                  </button>
                  <button onClick={() => { setDeleting(c); setConfirmText('') }}
                    className="p-1.5 rounded-lg text-dash-danger hover:bg-dash-danger-soft transition-all" title="Supprimer définitivement">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!clients.length && <div className="px-6 py-12 text-center text-dash-ink-soft text-sm">Aucun client.</div>}
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-dash-surface border border-dash-danger/30 rounded-[20px] p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-dash-danger" /><h3 className="text-dash-ink font-bold">Suppression définitive</h3></div>
            <p className="text-dash-ink-soft text-xs">Cela supprime <b className="text-dash-ink">toutes</b> les boutiques et données de <b className="text-dash-ink">{deleting.email}</b>, et son compte. Irréversible.</p>
            <p className="text-dash-ink-soft text-xs">Tapez <b className="text-dash-ink">{deleting.stores[0]?.name ?? deleting.email}</b> pour confirmer :</p>
            <input value={confirmText} autoFocus onChange={e => setConfirmText(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-danger/20 text-dash-ink outline-none text-sm" />
            <div className="flex gap-3">
              <button onClick={() => { setDeleting(null); setConfirmText('') }} className="flex-1 py-3 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink text-sm">Annuler</button>
              <button onClick={confirmDelete} disabled={confirmText !== (deleting.stores[0]?.name ?? deleting.email) || busy === deleting.ownerId}
                className="flex-1 flex items-center justify-center py-3 rounded-xl bg-dash-danger text-white font-semibold text-sm disabled:opacity-40">
                {busy === deleting.ownerId ? <Loader2 size={16} className="animate-spin" /> : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <form onSubmit={handleAddClient} className="bg-dash-surface border border-dash-border rounded-[20px] p-6 w-full max-w-sm space-y-4 relative">
            <button type="button" onClick={() => setShowAddClient(false)} className="absolute top-4 right-4 text-dash-ink-soft hover:text-dash-ink"><X size={16} /></button>
            <h3 className="text-dash-ink font-bold text-lg mb-4">Créer un nouveau client</h3>

            {addError && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs p-3 rounded-xl">{addError}</div>}

            <div>
              <label className="block text-dash-ink-soft text-xs font-semibold mb-1">Email du client</label>
              <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-colors text-sm"
                placeholder="client@email.com" />
            </div>

            <div>
              <label className="block text-dash-ink-soft text-xs font-semibold mb-1">Mot de passe (Minimum 6 caractères)</label>
              <input type="password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink outline-none focus:border-dash-accent/50 transition-colors text-sm"
                placeholder="••••••" />
            </div>

            <button type="submit" disabled={busy === 'adding' || !newEmail || newPassword.length < 6}
              className="w-full flex items-center justify-center py-3 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-white font-semibold text-sm disabled:opacity-40 mt-2">
              {busy === 'adding' ? <Loader2 size={16} className="animate-spin" /> : 'Créer le compte'}
            </button>

            <p className="text-dash-ink-soft text-[10px] text-center mt-2">
              Cette méthode contourne la limite de sécurité (Trop de tentatives) de Supabase.
            </p>
          </form>
        </div>
      )}

      {modal}
    </div>
  )
}
