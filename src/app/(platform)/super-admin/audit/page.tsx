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
      <div><h1 className="text-2xl font-bold text-white">Journal d&apos;audit</h1><p className="text-gray-500 text-sm mt-1">200 dernières actions</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div> : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl divide-y divide-white/5">
          {entries.map(e => (
            <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-sm">
              <ScrollText size={14} className="text-gray-500 flex-shrink-0" />
              <span className="text-white font-medium">{e.action}</span>
              <span className="text-gray-500 text-xs">{e.target_type}{e.target_id ? `:${e.target_id.slice(0, 8)}` : ''}</span>
              <span className="ml-auto text-gray-600 text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</span>
            </div>
          ))}
          {!entries.length && <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucune action enregistrée.</div>}
        </div>
      )}
    </div>
  )
}
