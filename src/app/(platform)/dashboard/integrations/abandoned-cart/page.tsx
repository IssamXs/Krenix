'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { buildWaLink } from '@/lib/whatsapp'
import { ULTIMATE_PLANS, type Plan } from '@/types/database'
import { ShoppingCart, Loader2, MessageCircle, MapPin, Clock } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

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
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  const captured = leads.length
  const recovered = leads.filter(l => l.recovered).length
  const rate = captured > 0 ? ((recovered / captured) * 100).toFixed(0) : '0'
  const open = leads.filter(l => !l.recovered)

  const relanceLink = (l: AbLead) =>
    buildWaLink(l.phone, `Bonjour ${l.name} 👋, vous avez commencé une commande chez ${storeName} mais ne l'avez pas finalisée. Puis-je vous aider à la compléter ?`)

  const STATS = [
    { label: 'Paniers captés', value: captured, cls: 'text-dash-gold-dark' },
    { label: 'Récupérés', value: recovered, cls: 'text-dash-success' },
    { label: 'Taux de récupération', value: `${rate}%`, cls: 'text-dash-accent' },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">← Intégrations</a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Paniers abandonnés</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Récupérez les visiteurs qui ont laissé leurs coordonnées sans finaliser</p>
      </div>

      {!allowed ? (
        <LockedFeatureCard title="Récupération de paniers" requiredPlan="Ultimate" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            {STATS.map((s, i) => (
              <Card key={s.label} delayMs={i * 50} className="text-center">
                <p className={`dash-font-heading text-[26px] ${s.cls}`}>{s.value}</p>
                <p className="text-dash-ink-soft text-xs mt-1">{s.label}</p>
              </Card>
            ))}
          </div>

          <div>
            <h3 className="text-dash-ink font-bold text-sm mb-3">À relancer ({open.length})</h3>
            {open.length === 0 ? (
              <Card className="p-10 flex flex-col items-center gap-3 text-center">
                <ShoppingCart size={32} className="text-dash-ink-faint" />
                <p className="text-dash-ink-soft text-sm">Aucun panier abandonné à relancer pour l&apos;instant.</p>
              </Card>
            ) : (
              <div className="space-y-2">
                {open.map((l, i) => {
                  const link = relanceLink(l)
                  return (
                    <Card key={l.id} delayMs={i * 40} padding="sm" className="!py-3 flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-gold-soft">
                        <ShoppingCart size={16} className="text-dash-gold-dark" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-dash-ink text-sm font-medium truncate">{l.name}</p>
                        <p className="text-dash-ink-soft text-xs flex items-center gap-2 flex-wrap">
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
                    </Card>
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
