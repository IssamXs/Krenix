'use client'
import { useEffect, useState } from 'react'
import { Loader2, ScrollText } from 'lucide-react'

interface Entry { id: string; action: string; target_type: string; target_id: string | null; details: Record<string, unknown>; created_at: string }

export default function SuperAdminAudit() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/super-admin/audit').then(r => r.json()).then(d => { setEntries(d.entries ?? []); setLoading(false) }) }, [])
  return (
    <div className="space-y-6">
      <div><h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Journal d&apos;audit</h1><p className="text-dash-ink-soft text-sm mt-1">200 dernières actions</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-dash-accent" /></div> : (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] divide-y divide-dash-border overflow-hidden">
          {entries.map(e => (
            <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-sm">
              <ScrollText size={14} className="text-dash-ink-faint flex-shrink-0" />
              <span className="text-dash-ink font-medium">{e.action}</span>
              <span className="text-dash-ink-soft text-xs">{e.target_type}{e.target_id ? `:${e.target_id.slice(0, 8)}` : ''}</span>
              <span className="ml-auto text-dash-ink-faint text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString('fr-DZ')}</span>
            </div>
          ))}
          {!entries.length && <div className="px-6 py-12 text-center text-dash-ink-soft text-sm">Aucune action enregistrée.</div>}
        </div>
      )}
    </div>
  )
}
