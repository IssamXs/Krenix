'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { buildWaLink } from '@/lib/whatsapp'
import { ORDER_STATUS_LABELS, BUSINESS_PLANS, type Plan, type OrderStatus } from '@/types/database'
import { Users, Loader2, Search, MapPin, ChevronDown, ChevronUp, MessageCircle, FileText, Check } from 'lucide-react'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'

interface OrderLite {
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  total_price: number
  status: OrderStatus
  created_at: string
}

interface Customer {
  phone: string
  name: string
  wilaya: string
  orders: OrderLite[]
  totalSpent: number
  lastOrder: string
}

import { formatDA as DA } from '@/lib/format'

export default function CrmPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [storeId, setStoreId] = useState('')
  const [search, setSearch] = useState('')
  const [minOrders, setMinOrders] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, plan') as { id: string; plan: Plan } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      setStoreId(store.id)
      const ok = BUSINESS_PLANS.includes(store.plan as Plan)
      setAllowed(ok)
      if (!ok) { setLoading(false); return }

      const [{ data: orders }, { data: noteRows }] = await Promise.all([
        supabase.from('orders').select('order_number, customer_name, customer_phone, wilaya, total_price, status, created_at').eq('store_id', store.id).order('created_at', { ascending: false }),
        supabase.from('customer_notes').select('phone, note').eq('store_id', store.id),
      ])

      // Group orders by phone → customer profiles.
      const map = new Map<string, Customer>()
      for (const o of (orders ?? []) as OrderLite[]) {
        const c = map.get(o.customer_phone)
        if (c) {
          c.orders.push(o)
          c.totalSpent += Number(o.total_price ?? 0)
        } else {
          map.set(o.customer_phone, {
            phone: o.customer_phone,
            name: o.customer_name,
            wilaya: o.wilaya,
            orders: [o],
            totalSpent: Number(o.total_price ?? 0),
            lastOrder: o.created_at,
          })
        }
      }
      setCustomers([...map.values()].sort((a, b) => b.orders.length - a.orders.length))
      const n: Record<string, string> = {}
      for (const r of noteRows ?? []) n[r.phone] = r.note ?? ''
      setNotes(n)
      setLoading(false)
    })
  }, [router])

  const saveNote = async (phone: string) => {
    const supabase = createClient()
    await supabase.from('customer_notes').upsert(
      { store_id: storeId, phone, note: noteDraft, updated_at: new Date().toISOString() },
      { onConflict: 'store_id,phone' },
    )
    setNotes(prev => ({ ...prev, [phone]: noteDraft }))
    setEditingNote(null)
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">CRM</h1>
          <p className="text-dash-ink-soft text-sm mt-1">Historique et fiches clients</p>
        </div>
        <LockedFeatureCard title="Fiches clients & historique d'achat" requiredPlan="Business" />
      </div>
    )
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.wilaya.toLowerCase().includes(q)
    return matchQ && c.orders.length >= minOrders
  })

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">CRM</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{customers.length} client{customers.length !== 1 ? 's' : ''} · historique et fiches</p>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-dash-ink-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, téléphone, wilaya..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm" />
        </div>
        <select value={minOrders} onChange={e => setMinOrders(Number(e.target.value))}
          className="px-3 py-2.5 rounded-xl bg-dash-surface border border-dash-border text-dash-ink text-sm outline-none">
          <option value={0}>Toutes commandes</option>
          <option value={2}>2+ commandes</option>
          <option value={3}>3+ commandes</option>
          <option value={5}>5+ commandes</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-12 flex flex-col items-center gap-3 text-center">
          <Users size={32} className="text-dash-ink-faint" />
          <p className="text-dash-ink-soft text-sm">{search || minOrders ? 'Aucun client correspondant.' : 'Aucun client pour l\'instant.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isOpen = open === c.phone
            const wa = buildWaLink(c.phone, `Bonjour ${c.name} 👋`)
            return (
              <div key={c.phone} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : c.phone)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dash-surface-2 transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                    <Users size={17} className="text-dash-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-dash-ink text-sm font-medium truncate">{c.name}</p>
                    <p className="text-dash-ink-soft text-xs flex items-center gap-2">
                      <span>{c.phone}</span>
                      <span className="flex items-center gap-1"><MapPin size={10} /> {c.wilaya}</span>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-dash-ink text-sm font-semibold">{DA(c.totalSpent)}</p>
                    <p className="text-dash-ink-soft text-[11px]">{c.orders.length} commande{c.orders.length !== 1 ? 's' : ''}</p>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-dash-border pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#25D366' }}>
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                      )}
                      <span className="text-xs text-dash-ink-soft">Dernière commande : {new Date(c.lastOrder).toLocaleDateString('fr-DZ')}</span>
                    </div>

                    {/* Order history */}
                    <div className="space-y-1">
                      {c.orders.map(o => (
                        <div key={o.order_number} className="flex items-center justify-between text-xs py-1.5 border-b border-dash-border last:border-0">
                          <span className="text-dash-ink-soft font-mono">{o.order_number}</span>
                          <span className="text-dash-ink-soft">{new Date(o.created_at).toLocaleDateString('fr-DZ')}</span>
                          <span className="text-dash-ink-soft">{ORDER_STATUS_LABELS[o.status]}</span>
                          <span className="text-dash-ink font-semibold">{DA(Number(o.total_price))}</span>
                        </div>
                      ))}
                    </div>

                    {/* Note */}
                    <div className="pt-1">
                      {editingNote === c.phone ? (
                        <div className="flex gap-2">
                          <input autoFocus value={noteDraft} onChange={e => setNoteDraft(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveNote(c.phone)}
                            placeholder="Note interne sur ce client..."
                            className="flex-1 px-3 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50" />
                          <button onClick={() => saveNote(c.phone)} className="px-3 py-1.5 rounded-lg bg-dash-accent text-white text-xs"><Check size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingNote(c.phone); setNoteDraft(notes[c.phone] ?? '') }}
                          className="flex items-center gap-2 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
                          <FileText size={12} /> {notes[c.phone] || 'Ajouter une note...'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
