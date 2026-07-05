'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { buildWaLink } from '@/lib/whatsapp'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'
import { ShoppingCart, Loader2, Lock, MessageCircle, MapPin, Clock } from 'lucide-react'

interface AbLead {
  id: string
  name: string
  phone: string
  wilaya: string | null
  created_at: string
  recovered: boolean
}

export default function AbandonedCartPage() {
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [storeName, setStoreName] = useState('')
  const [leads, setLeads] = useState<AbLead[]>([])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, name, plan') as { id: string; name: string; plan: Plan } | null
      if (!store) { setLoading(false); return }
      setStoreName(store.name ?? '')
      const ok = ULTIMATE_PLANS.includes(store.plan as Plan)
      setAllowed(ok)
      if (!ok) { setLoading(false); return }

      const [{ data: abandoned }, { data: orders }] = await Promise.all([
        supabase.from('leads').select('id, name, phone, wilaya, created_at').eq('store_id', store.id).eq('status', 'abandoned').order('created_at', { ascending: false }),
        supabase.from('orders').select('customer_phone').eq('store_id', store.id),
      ])
      const orderPhones = new Set((orders ?? []).map(o => o.customer_phone))
      setLeads((abandoned ?? []).map(l => ({ ...l, recovered: orderPhones.has(l.phone) })) as AbLead[])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-[#3B82F6]" size={26} /></div>
  }

  const captured = leads.length
  const recovered = leads.filter(l => l.recovered).length
  const rate = captured > 0 ? ((recovered / captured) * 100).toFixed(0) : '0'
  const open = leads.filter(l => !l.recovered)

  const relanceLink = (l: AbLead) =>
    buildWaLink(l.phone, `Bonjour ${l.name} 👋, vous avez commencé une commande chez ${storeName} mais ne l'avez pas finalisée. Puis-je vous aider à la compléter ?`)

  return (
    <div className="max-w-3xl space-y-6">
      <a href="/dashboard/integrations" className="text-gray-500 hover:text-white text-sm transition-colors">← Intégrations</a>
      <div>
        <h2 className="text-2xl font-bold text-white">Paniers abandonnés</h2>
        <p className="text-gray-500 text-sm mt-1">Récupérez les visiteurs qui ont laissé leurs coordonnées sans finaliser</p>
      </div>

      {!allowed ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Récupération de paniers</p>
            <p className="text-gray-500 text-xs">Disponible à partir du plan Ultimate</p>
          </div>
          <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Ultimate
          </a>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Paniers captés', value: captured, color: '#F59E0B' },
              { label: 'Récupérés', value: recovered, color: '#10B981' },
              { label: 'Taux de récupération', value: `${rate}%`, color: '#3B82F6' },
            ].map(s => (
              <div key={s.label} className="bg-[#111118] border border-white/5 rounded-2xl p-5 text-center">
                <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}</p>
                <p className="text-gray-500 text-xs mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          <div>
            <h3 className="text-white font-semibold text-sm mb-3">À relancer ({open.length})</h3>
            {open.length === 0 ? (
              <div className="bg-[#111118] border border-white/5 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
                <ShoppingCart size={32} className="text-gray-700" />
                <p className="text-gray-500 text-sm">Aucun panier abandonné à relancer pour l&apos;instant.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {open.map(l => {
                  const link = relanceLink(l)
                  return (
                    <div key={l.id} className="bg-[#111118] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(245,158,11,0.12)' }}>
                        <ShoppingCart size={16} className="text-[#F59E0B]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{l.name}</p>
                        <p className="text-gray-500 text-xs flex items-center gap-2 flex-wrap">
                          <span>{l.phone}</span>
                          {l.wilaya && <span className="flex items-center gap-1"><MapPin size={10} /> {l.wilaya}</span>}
                          <span className="flex items-center gap-1"><Clock size={10} /> {new Date(l.created_at).toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                      </div>
                      <a
                        href={link ?? '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex-shrink-0 transition-all hover:opacity-90"
                        style={{ background: '#25D366' }}
                      >
                        <MessageCircle size={13} /> Relancer
                      </a>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
