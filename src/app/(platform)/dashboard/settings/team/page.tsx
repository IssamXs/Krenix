'use client'

import { useEffect, useState } from 'react'
import { UserPlus, Users, Loader2, Trash2, Crown, Mail, Check, Clock } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

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
        : 'Membre ajouté. Si cette personne a déjà un compte Krenix, elle peut se connecter directement.')
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
        <Loader2 className="animate-spin text-dash-accent" size={26} />
      </div>
    )
  }

  const seatLimitLabel = team?.seatLimit == null ? 'illimité' : String(team.seatLimit)
  const canInvite = team?.allowed && (team.seatLimit == null || team.seatsUsed < team.seatLimit)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Équipe</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Invitez des collaborateurs à gérer votre boutique avec vous</p>
      </div>

      {!team?.allowed ? (
        <LockedFeatureCard title="Membres d'équipe — invitez des collaborateurs" requiredPlan="Ultimate" />
      ) : (
        <>
          <Card padding="sm" className="flex items-center gap-3">
            <Users size={18} className="text-dash-accent flex-shrink-0" />
            <p className="text-dash-ink text-sm font-medium flex-1">
              {team.seatsUsed} membre{team.seatsUsed !== 1 ? 's' : ''} <span className="text-dash-ink-soft font-normal">/ {seatLimitLabel}</span>
            </p>
            {!canInvite && team.seatLimit != null && (
              <a href="/dashboard/billing/upgrade" className="text-xs text-dash-gold-dark font-semibold whitespace-nowrap">
                Plus de sièges →
              </a>
            )}
          </Card>

          <Card className="space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-dash-accent" />
              <h3 className="text-dash-ink font-bold text-sm">Inviter un collaborateur</h3>
            </div>
            {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-xl">{error}</div>}
            {notice && <div className="bg-dash-success-soft border border-dash-success/20 text-dash-success text-xs px-3 py-2 rounded-xl">{notice}</div>}
            <div className="flex gap-2">
              <input
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter' && canInvite && email.trim()) invite() }}
                type="email"
                placeholder="email@exemple.com"
                disabled={!canInvite}
                className="flex-1 px-4 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm disabled:opacity-50"
              />
              <button
                onClick={invite}
                disabled={!canInvite || inviting || !email.trim()}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-dash-accent hover:bg-dash-accent-dark text-dash-surface font-bold text-sm transition-all disabled:opacity-50 flex-shrink-0"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                Inviter
              </button>
            </div>
            {!canInvite && team.seatLimit != null && (
              <p className="text-xs text-dash-warning-dark">Limite de {team.seatLimit} sièges atteinte pour votre plan.</p>
            )}
          </Card>

          <div className="space-y-2">
            <Card padding="sm" className="!py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-gold-soft">
                <Crown size={16} className="text-dash-gold-dark" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-dash-ink text-sm font-medium">Vous</p>
                <p className="text-dash-ink-soft text-xs">Propriétaire</p>
              </div>
            </Card>

            {team.members.map(m => (
              <Card key={m.id} padding="sm" className="!py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                  <Users size={16} className="text-dash-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-dash-ink text-sm font-medium truncate">{m.invited_email}</p>
                  <p className="text-dash-ink-soft text-xs flex items-center gap-1">
                    {m.accepted_at
                      ? <><Check size={11} className="text-dash-success" /> Membre actif</>
                      : <><Clock size={11} className="text-dash-warning-dark" /> Invitation en attente</>}
                  </p>
                </div>
                <button
                  onClick={() => remove(m)}
                  disabled={removing === m.id}
                  className="p-2 text-dash-ink-faint hover:text-dash-danger hover:bg-dash-danger-soft rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
                  title="Retirer"
                >
                  {removing === m.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </Card>
            ))}

            {team.members.length === 0 && (
              <p className="text-dash-ink-faint text-xs text-center py-3">
                Aucun collaborateur pour l&apos;instant — invitez votre premier membre ci-dessus.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
