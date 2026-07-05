'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Users, Loader2, Lock, Trash2, Crown, Mail, Check, Clock } from 'lucide-react'

interface Member {
  id: string
  invited_email: string
  role: 'member'
  accepted_at: string | null
  created_at: string
}

interface TeamState {
  members: Member[]
  seatsUsed: number
  seatLimit: number | null // null = unlimited
  allowed: boolean
}

export default function TeamPage() {
  const [team, setTeam] = useState<TeamState | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.json())
      .then(d => { if (!d.error) setTeam(d as TeamState); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const refresh = async () => {
    const r = await fetch('/api/team')
    const d = await r.json()
    if (!d.error) setTeam(d as TeamState)
  }

  const invite = async () => {
    setInviting(true); setError(''); setNotice('')
    try {
      const res = await fetch('/api/team', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur'); return }
      setEmail('')
      setNotice(d.inviteSent
        ? 'Invitation envoyée par email ✉️'
        : 'Membre ajouté. Si cette personne a déjà un compte Novalux, elle peut se connecter directement.')
      await refresh()
    } finally { setInviting(false) }
  }

  const remove = async (m: Member) => {
    if (!confirm(`Retirer ${m.invited_email} de l'équipe ?`)) return
    setRemoving(m.id)
    await fetch('/api/team', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: m.id }),
    })
    setRemoving(null)
    await refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-[#3B82F6]" size={26} />
      </div>
    )
  }

  const seatLimitLabel = team?.seatLimit == null ? 'illimité' : String(team.seatLimit)
  const canInvite = team?.allowed && (team.seatLimit == null || team.seatsUsed < team.seatLimit)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Équipe</h2>
        <p className="text-gray-500 text-sm mt-1">Invitez des collaborateurs à gérer votre boutique avec vous</p>
      </div>

      {!team?.allowed ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Membres d&apos;équipe</p>
            <p className="text-gray-500 text-xs">Invitez des collaborateurs — disponible à partir du plan Ultimate</p>
          </div>
          <a href="/dashboard/billing/upgrade"
            className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Ultimate
          </a>
        </div>
      ) : (
        <>
          {/* Seats */}
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-4 flex items-center gap-3">
            <Users size={18} className="text-[#3B82F6] flex-shrink-0" />
            <p className="text-white text-sm font-medium flex-1">
              {team.seatsUsed} membre{team.seatsUsed !== 1 ? 's' : ''} <span className="text-gray-500 font-normal">/ {seatLimitLabel}</span>
            </p>
            {!canInvite && team.seatLimit != null && (
              <a href="/dashboard/billing/upgrade" className="text-xs text-[#F59E0B] font-semibold whitespace-nowrap">
                Plus de sièges →
              </a>
            )}
          </div>

          {/* Invite */}
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-[#3B82F6]" />
              <h3 className="text-white font-semibold text-sm">Inviter un collaborateur</h3>
            </div>
            {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}
            {notice && <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-xs px-3 py-2 rounded-xl">{notice}</div>}
            <div className="flex gap-2">
              <input
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && canInvite && email.trim()) invite() }}
                type="email"
                placeholder="email@exemple.com"
                disabled={!canInvite}
                className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm disabled:opacity-50"
              />
              <button
                onClick={invite}
                disabled={!canInvite || inviting || !email.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-white font-semibold text-sm hover:opacity-90 transition-all disabled:opacity-50 flex-shrink-0"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Inviter
              </button>
            </div>
            {!canInvite && team.seatLimit != null && (
              <p className="text-xs text-amber-400/80">
                Limite de {team.seatLimit} sièges atteinte pour votre plan.
              </p>
            )}
          </div>

          {/* Members list */}
          <div className="space-y-2">
            {/* Owner row */}
            <div className="bg-[#111118] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <Crown size={16} className="text-[#F59E0B]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium">Vous</p>
                <p className="text-gray-500 text-xs">Propriétaire</p>
              </div>
            </div>

            {team.members.map(m => (
              <div key={m.id} className="bg-[#111118] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}>
                  <Users size={16} className="text-[#3B82F6]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{m.invited_email}</p>
                  <p className="text-gray-500 text-xs flex items-center gap-1">
                    {m.accepted_at
                      ? <><Check size={11} className="text-green-400" /> Membre actif</>
                      : <><Clock size={11} className="text-amber-400" /> Invitation en attente</>}
                  </p>
                </div>
                <button
                  onClick={() => remove(m)}
                  disabled={removing === m.id}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Retirer"
                >
                  {removing === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}

            {team.members.length === 0 && (
              <p className="text-gray-600 text-xs text-center py-3">
                Aucun collaborateur pour l&apos;instant — invitez votre premier membre ci-dessus.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
