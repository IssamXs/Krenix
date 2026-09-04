'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Lead, LeadStatus } from '@/types/database'
import { leadStatusLabel, LEAD_STATUS_DASH_COLORS as LEAD_STATUS_COLORS } from '@/types/database'
import { buildWaLink } from '@/lib/whatsapp'
import { Users, Phone, MapPin, FileText, MessageCircle, Check, ChevronDown } from 'lucide-react'
import { useI18n } from '@/lib/i18n/LocaleProvider'

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'converted', 'lost']

function StatusDropdown({ lead, onUpdate }: { lead: Lead; onUpdate: (id: string, status: LeadStatus) => void }) {
  const { locale } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${LEAD_STATUS_COLORS[lead.status]}`}
      >
        {leadStatusLabel(lead.status, locale)}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-8 left-0 z-20 bg-dash-surface border border-dash-border rounded-xl shadow-xl overflow-hidden min-w-[130px]">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => { onUpdate(lead.id, s); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-xs font-semibold flex items-center gap-2 hover:bg-dash-surface-2 transition-colors ${LEAD_STATUS_COLORS[s]}`}
            >
              {lead.status === s && <Check size={11} />}
              {lead.status !== s && <span className="w-3" />}
              {leadStatusLabel(s, locale)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function LeadsPage() {
  const { t, locale } = useI18n()
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
      const store = await resolveActiveStore(supabase, user.id, 'id') as { id: string } | null
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
    abandoned: leads.filter(l => l.status === 'abandoned').length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('leads.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">
          {t('leads.subtitle')}
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: t('leads.statTotal'), value: counts.all, cls: 'text-dash-accent' },
          { label: t('leads.statNew'), value: counts.new, cls: 'text-dash-info' },
          { label: t('leads.statContacted'), value: counts.contacted, cls: 'text-dash-gold-dark' },
          { label: t('leads.statConverted'), value: counts.converted, cls: 'text-dash-success' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-dash-surface border border-dash-border rounded-[20px] p-4 text-center">
            <p className={`dash-font-heading text-[26px] ${cls}`}>{value}</p>
            <p className="text-dash-ink-soft text-xs mt-1">{label}</p>
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
                ? 'bg-dash-accent text-white'
                : 'bg-dash-surface-2 text-dash-ink-soft hover:bg-dash-border hover:text-dash-ink'
            }`}
          >
            {s === 'all' ? t('leads.filterAll', { count: counts.all }) : `${leadStatusLabel(s, locale)} (${counts[s]})`}
          </button>
        ))}
      </div>

      {/* Leads list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-dash-surface-2 flex items-center justify-center">
            <Users size={28} className="text-dash-ink-faint" />
          </div>
          <div className="text-center">
            <p className="text-dash-ink font-semibold">{t('leads.noLeadsYet')}</p>
            <p className="text-dash-ink-soft text-sm mt-1">
              {t('leads.noLeadsSubtitle')}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lead => {
            const waLink = buildWaLink(lead.phone, t('leads.whatsappMessage', { name: lead.name }))
            return (
            <div key={lead.id} className="bg-dash-surface border border-dash-border rounded-[20px] p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <p className="text-dash-ink font-bold">{lead.name}</p>
                    <StatusDropdown lead={lead} onUpdate={updateStatus} />
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {waLink ? (
                      <a
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-dash-success hover:opacity-80 transition-opacity"
                      >
                        <MessageCircle size={12} />
                        {lead.phone}
                      </a>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-dash-ink-faint opacity-60">
                        <MessageCircle size={12} />
                        {lead.phone}
                      </span>
                    )}
                    {lead.wilaya && (
                      <span className="flex items-center gap-1.5 text-xs text-dash-ink-soft">
                        <MapPin size={12} /> {lead.wilaya}
                      </span>
                    )}
                    {lead.landing_page && (
                      <span className="flex items-center gap-1.5 text-xs text-dash-ink-soft">
                        <Phone size={12} /> {t('leads.viaLandingPage', { title: lead.landing_page.title })}
                      </span>
                    )}
                    <span className="text-xs text-dash-ink-faint">
                      {new Date(lead.created_at).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* WhatsApp quick action */}
                {waLink ? (
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all hover:opacity-90"
                    style={{ background: '#25D366' }}
                    onClick={() => updateStatus(lead.id, 'contacted')}
                  >
                    <MessageCircle size={13} />
                    {t('leads.contact')}
                  </a>
                ) : null}
              </div>

              {/* Notes */}
              <div className="mt-3 pt-3 border-t border-dash-border">
                {editingNote === lead.id ? (
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveNote(lead.id)}
                      placeholder={t('leads.notePlaceholder')}
                      className="flex-1 px-3 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50"
                    />
                    <button onClick={() => saveNote(lead.id)} className="px-3 py-1.5 rounded-lg bg-dash-accent text-white text-xs font-semibold">
                      <Check size={13} />
                    </button>
                    <button onClick={() => setEditingNote(null)} className="px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft text-xs">
                      ✕
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setEditingNote(lead.id); setNoteText(lead.notes ?? '') }}
                    className="flex items-center gap-2 text-xs text-dash-ink-faint hover:text-dash-ink-soft transition-colors"
                  >
                    <FileText size={12} />
                    {lead.notes ? lead.notes : t('leads.addNote')}
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
