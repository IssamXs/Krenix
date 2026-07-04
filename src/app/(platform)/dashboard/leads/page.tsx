'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Lead, LeadStatus } from '@/types/database'
import { LEAD_STATUS_LABELS, LEAD_STATUS_COLORS } from '@/types/database'
import { Users, Phone, MapPin, FileText, MessageCircle, Check, ChevronDown } from 'lucide-react'

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'converted', 'lost']

function StatusDropdown({ lead, onUpdate }: { lead: Lead; onUpdate: (id: string, status: LeadStatus) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}
      >
        {LEAD_STATUS_LABELS[lead.status]}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-8 left-0 z-20 bg-[#1a1a24] border border-white/10 rounded-xl shadow-xl overflow-hidden min-w-[130px]">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { onUpdate(lead.id, s); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-white/5 transition-colors ${LEAD_STATUS_COLORS[s]}`}
            >
              {lead.status === s && <Check size={11} />}
              {lead.status !== s && <span className="w-3" />}
              {LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LeadsPage() {
  const router = useRouter()
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<LeadStatus | 'all'>('all')
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
      if (!store) { router.push('/onboarding/step-1'); return }

      const { data } = await supabase
        .from('leads')
        .select('*, landing_page:landing_pages(id, title, slug)')
        .eq('store_id', store.id)
        .order('created_at', { ascending: false })

      setLeads((data ?? []) as Lead[])
      setLoading(false)
    })
  }, [router])

  const updateStatus = useCallback(async (id: string, status: LeadStatus) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, status } : l))
    await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
  }, [])

  const saveNote = useCallback(async (id: string) => {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, notes: noteText } : l))
    await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, notes: noteText }) })
    setEditingNote(null)
  }, [noteText])

  const filtered = filter === 'all' ? leads : leads.filter(l => l.status === filter)

  const counts = {
    all: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    converted: leads.filter(l => l.status === 'converted').length,
    lost: leads.filter(l => l.status === 'lost').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Leads</h2>
        <p className="text-gray-500 text-sm mt-1">
          Clients potentiels qui ont laissé leurs coordonnées sans commander
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: counts.all, color: '#3B82F6' },
          { label: 'Nouveaux', value: counts.new, color: '#60A5FA' },
          { label: 'Contactés', value: counts.contacted, color: '#F59E0B' },
          { label: 'Convertis', value: counts.converted, color: '#10B981' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#111118] border border-white/5 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black" style={{ color }}>{value}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['all', ...STATUS_OPTIONS] as const).map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              filter === s
                ? 'bg-[#3B82F6] text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {s === 'all' ? `Tous (${counts.all})` : `${LEAD_STATUS_LABELS[s]} (${counts[s]})`}
          </button>
        ))}
      </div>

      {/* Leads list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <Users size={28} className="text-gray-600" />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold">Aucun lead pour l&apos;instant</p>
            <p className="text-gray-500 text-sm mt-1">
              Les leads apparaissent quand des visiteurs laissent leurs coordonnées sans commander.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lead => (
            <div key={lead.id} className="bg-[#111118] border border-white/5 rounded-2xl p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <p className="text-white font-bold">{lead.name}</p>
                    <StatusDropdown lead={lead} onUpdate={updateStatus} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <a
                      href={`https://wa.me/${lead.phone.replace(/\s/g, '')}?text=${encodeURIComponent(`Bonjour ${lead.name}, je vous contacte suite à votre intérêt sur notre boutique.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-green-400 hover:text-green-300 transition-colors"
                    >
                      <MessageCircle size={12} />
                      {lead.phone}
                    </a>
                    {lead.wilaya && (
                      <span className="flex items-center gap-1.5 text-xs text-gray-500">
                        <MapPin size={12} /> {lead.wilaya}
                      </span>
                    )}
                    {lead.landing_page && (
                      <span className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Phone size={12} /> via {lead.landing_page.title}
                      </span>
                    )}
                    <span className="text-xs text-gray-600">
                      {new Date(lead.created_at).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* WhatsApp quick action */}
                <a
                  href={`https://wa.me/${lead.phone.replace(/\s/g, '')}?text=${encodeURIComponent(`Bonjour ${lead.name}, je vous contacte suite à votre intérêt sur notre boutique.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all hover:opacity-90"
                  style={{ background: '#25D366' }}
                  onClick={() => updateStatus(lead.id, 'contacted')}
                >
                  <MessageCircle size={13} />
                  Contacter
                </a>
              </div>

              {/* Notes */}
              <div className="mt-3 pt-3 border-t border-white/5">
                {editingNote === lead.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveNote(lead.id)}
                      placeholder="Note interne..."
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-[#3B82F6]/50"
                    />
                    <button onClick={() => saveNote(lead.id)} className="px-3 py-1.5 rounded-lg bg-[#3B82F6] text-white text-xs font-semibold">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 rounded-lg bg-white/5 text-gray-400 text-xs">
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingNote(lead.id); setNoteText(lead.notes ?? '') }}
                    className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    <FileText size={12} />
                    {lead.notes ? lead.notes : 'Ajouter une note...'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
