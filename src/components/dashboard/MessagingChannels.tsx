'use client'

import { useEffect, useState, useCallback } from 'react'
import { MessageCircle, Loader2, Plus, Trash2, Check } from 'lucide-react'

interface Connection { id: string; platform: 'messenger' | 'instagram'; page_name: string | null; enabled: boolean }
interface PageOption { id: string; name: string; hasInstagram: boolean }

// Instagram glyph isn't in lucide-react (brand icon removed upstream) — inline SVG, same pattern as ContactSection.tsx.
function Instagram({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

// Minimal typing for the Facebook JS SDK we use.
declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void
      login: (cb: (r: { authResponse?: { accessToken?: string } }) => void, o: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

const FB_SCOPES = 'pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages,business_management'

export default function MessagingChannels({ locked }: { locked: boolean }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(!locked)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pages, setPages] = useState<PageOption[] | null>(null)
  const [userToken, setUserToken] = useState('')

  const refresh = useCallback(async () => {
    const res = await fetch('/api/channels/meta')
    const json = await res.json()
    setConnections(json.connections ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (locked) return
    fetch('/api/channels/meta')
      .then(res => res.json())
      .then(json => { setConnections(json.connections ?? []); setLoading(false) })
    // Load FB SDK once.
    if (!document.getElementById('fb-sdk')) {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId: process.env.NEXT_PUBLIC_META_APP_ID, cookie: true, xfbml: false, version: 'v21.0' })
      }
      const s = document.createElement('script')
      s.id = 'fb-sdk'
      s.src = 'https://connect.facebook.net/en_US/sdk.js'
      s.async = true
      document.body.appendChild(s)
    }
  }, [locked])

  const startLogin = () => {
    setError('')
    if (!window.FB) { setError('SDK Facebook non chargé. Réessayez dans un instant.'); return }
    window.FB.login(async (resp) => {
      const token = resp.authResponse?.accessToken
      if (!token) { setError('Connexion annulée.'); return }
      setUserToken(token)
      setBusy(true)
      try {
        const res = await fetch('/api/channels/meta/connect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userToken: token }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Erreur'); return }
        setPages(json.pages ?? [])
      } finally { setBusy(false) }
    }, { scope: FB_SCOPES })
  }

  const choosePage = async (pageId: string) => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/channels/meta/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken, pageId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erreur'); return }
      setPages(null); setUserToken('')
      await refresh()
    } finally { setBusy(false) }
  }

  const toggle = async (c: Connection) => {
    await fetch('/api/channels/meta', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, enabled: !c.enabled }),
    })
    refresh()
  }

  const disconnect = async () => {
    if (!confirm('Déconnecter cette page ? Le chatbot cessera de répondre sur Messenger/Instagram.')) return
    setBusy(true)
    await fetch('/api/channels/meta', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: 'ALL' }),
    })
    setBusy(false)
    refresh()
  }

  if (locked) {
    return (
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-60">
        <MessageCircle size={20} className="text-gray-500 flex-shrink-0" />
        <div>
          <p className="text-white text-sm font-semibold">Messenger & Instagram</p>
          <p className="text-gray-500 text-xs">Répondez automatiquement à vos DM — disponible sur le plan Ultimate</p>
        </div>
        <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg"
           style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>Passer à Ultimate</a>
      </div>
    )
  }

  return (
    <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-[#3B82F6]" />
        <h3 className="text-white font-semibold text-sm">Canaux de messagerie</h3>
      </div>
      <p className="text-gray-500 text-xs">
        Connectez votre page Facebook pour que le chatbot réponde sur Messenger et Instagram Direct.
      </p>

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#3B82F6]" size={20} /></div>
      ) : pages ? (
        <div className="space-y-2">
          <p className="text-white text-xs font-medium">Choisissez la page à connecter :</p>
          {pages.length === 0 && <p className="text-gray-500 text-xs">Aucune page trouvée sur ce compte.</p>}
          {pages.map(p => (
            <button key={p.id} onClick={() => choosePage(p.id)} disabled={busy}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#3B82F6]/50 transition-all text-left disabled:opacity-60">
              <span className="text-white text-sm">{p.name}</span>
              <span className="flex items-center gap-2 text-xs text-gray-500">
                {p.hasInstagram && <Instagram size={13} />}
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              </span>
            </button>
          ))}
        </div>
      ) : connections.length === 0 ? (
        <button onClick={startLogin} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: '#1877F2' }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
          Connecter Facebook / Instagram
        </button>
      ) : (
        <div className="space-y-2">
          {connections.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
              {c.platform === 'instagram' ? <Instagram size={15} className="text-pink-400" /> : <MessageCircle size={15} className="text-[#1877F2]" />}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{c.page_name ?? '—'}</p>
                <p className="text-gray-500 text-xs capitalize">{c.platform}</p>
              </div>
              <button onClick={() => toggle(c)}
                className={`text-xs px-2 py-1 rounded-lg font-medium ${c.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                {c.enabled ? <span className="flex items-center gap-1"><Check size={11} />Actif</span> : 'Inactif'}
              </button>
            </div>
          ))}
          <button onClick={disconnect} disabled={busy}
            className="flex items-center gap-1.5 text-xs text-red-500/70 hover:text-red-400 transition-colors pt-1">
            <Trash2 size={12} /> Déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
