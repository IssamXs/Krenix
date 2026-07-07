'use client'
import { useState, useCallback } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

// useProtectedAction: wraps a fetch-returning action. If the server replies
// STEPUP_REQUIRED, it opens a password modal, steps up, and retries once.
export function useProtectedAction() {
  const [pending, setPending] = useState<null | (() => Promise<Response>)>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (action: () => Promise<Response>): Promise<Response | null> => {
    const res = await action()
    if (res.status === 403) {
      const body = await res.clone().json().catch(() => ({}))
      if (body.code === 'STEPUP_REQUIRED') { setPending(() => action); setPassword(''); setError(''); return null }
      if (body.code === 'MFA_REQUIRED') { window.location.href = '/super-admin/security?challenge=1'; return null }
    }
    return res
  }, [])

  const submit = useCallback(async () => {
    if (!pending) return
    setBusy(true); setError('')
    const su = await fetch('/api/super-admin/step-up', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    })
    if (!su.ok) { setError('Mot de passe incorrect'); setBusy(false); return }
    const retry = await pending()
    setBusy(false); setPending(null); setPassword('')
    return retry
  }, [pending, password])

  const modal = pending ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-400" /><h3 className="text-white font-bold">Confirmer votre identité</h3></div>
        <p className="text-gray-500 text-xs">Action sensible — entrez votre mot de passe pour continuer.</p>
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <input type="password" value={password} autoFocus onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Mot de passe"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#3B82F6]/50 text-sm" />
        <div className="flex gap-3">
          <button onClick={() => { setPending(null); setPassword('') }} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">Annuler</button>
          <button onClick={submit} disabled={busy || !password} className="flex-1 flex items-center justify-center py-3 rounded-xl bg-amber-500 text-black font-semibold text-sm disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { run, modal }
}
