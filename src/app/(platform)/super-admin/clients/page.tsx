'use client'
import { useEffect, useState } from 'react'
import { Loader2, Ban, CheckCircle, Trash2, Store as StoreIcon, ShieldAlert } from 'lucide-react'
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

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Clients</h1><p className="text-gray-500 text-sm mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p></div>

      {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div> : (
        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.ownerId} className={`bg-[#111118] border rounded-2xl p-5 ${c.banned ? 'border-red-500/30 opacity-70' : 'border-white/5'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm truncate">{c.email}</p>
                    {c.banned && <span className="text-red-400 text-xs bg-red-400/10 px-2 py-0.5 rounded-full">Banni</span>}
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{c.storeCount} boutique{c.storeCount !== 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.stores.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-lg">
                        <StoreIcon size={10} /> {s.slug}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleBan(c)} disabled={busy === c.ownerId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${c.banned ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'} disabled:opacity-50`}>
                    {busy === c.ownerId ? <Loader2 size={13} className="animate-spin" /> : c.banned ? <CheckCircle size={13} /> : <Ban size={13} />}
                    {c.banned ? 'Débannir' : 'Bannir'}
                  </button>
                  <button onClick={() => { setDeleting(c); setConfirmText('') }}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all" title="Supprimer définitivement">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!clients.length && <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucun client.</div>}
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111118] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-red-400" /><h3 className="text-white font-bold">Suppression définitive</h3></div>
            <p className="text-gray-400 text-xs">Cela supprime <b className="text-white">toutes</b> les boutiques et données de <b className="text-white">{deleting.email}</b>, et son compte. Irréversible.</p>
            <p className="text-gray-500 text-xs">Tapez <b className="text-white">{deleting.stores[0]?.name ?? deleting.email}</b> pour confirmer :</p>
            <input value={confirmText} autoFocus onChange={e => setConfirmText(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-red-500/20 text-white outline-none text-sm" />
            <div className="flex gap-3">
              <button onClick={() => { setDeleting(null); setConfirmText('') }} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">Annuler</button>
              <button onClick={confirmDelete} disabled={confirmText !== (deleting.stores[0]?.name ?? deleting.email) || busy === deleting.ownerId}
                className="flex-1 flex items-center justify-center py-3 rounded-xl bg-red-500 text-white font-semibold text-sm disabled:opacity-40">
                {busy === deleting.ownerId ? <Loader2 size={16} className="animate-spin" /> : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {modal}
    </div>
  )
}
