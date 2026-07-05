'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { buildWaLink } from '@/lib/whatsapp'
import { ORDER_STATUS_LABELS, BUSINESS_PLANS, type Plan, type OrderStatus } from '@/types/database'
import { Users, Loader2, Lock, Search, MapPin, ChevronDown, ChevronUp, MessageCircle, FileText, Check } from 'lucide-react'

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

const DA = (n: number) => `${Math.round(n).toLocaleString('fr-DZ')} DA`

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
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-[#3B82F6]" size={26} /></div>
  }

  if (!allowed) {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">CRM</h2>
          <p className="text-gray-500 text-sm mt-1">Historique et fiches clients</p>
        </div>
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-70">
          <Lock size={20} className="text-gray-500 flex-shrink-0" />
          <div>
            <p className="text-white text-sm font-semibold">Fiches clients & historique d&apos;achat</p>
            <p className="text-gray-500 text-xs">Disponible à partir du plan Business</p>
          </div>
          <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>
            Passer à Business
          </a>
        </div>
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
        <h2 className="text-2xl font-bold text-white">CRM</h2>
        <p className="text-gray-500 text-sm mt-1">{customers.length} client{customers.length !== 1 ? 's' : ''} · historique et fiches</p>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher par nom, téléphone, wilaya..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#111118] border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm" />
        </div>
        <select value={minOrders} onChange={e => setMinOrders(Number(e.target.value))}
          className="px-3 py-2.5 rounded-xl bg-[#111118] border border-white/10 text-white text-sm outline-none">
          <option value={0} className="bg-[#1a1a24]">Toutes commandes</option>
          <option value={2} className="bg-[#1a1a24]">2+ commandes</option>
          <option value={3} className="bg-[#1a1a24]">3+ commandes</option>
          <option value={5} className="bg-[#1a1a24]">5+ commandes</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-3 text-center">
          <Users size={32} className="text-gray-700" />
          <p className="text-gray-500 text-sm">{search || minOrders ? 'Aucun client correspondant.' : 'Aucun client pour l\'instant.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isOpen = open === c.phone
            const wa = buildWaLink(c.phone, `Bonjour ${c.name} 👋`)
            return (
              <div key={c.phone} className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : c.phone)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(59,130,246,0.12)' }}>
                    <Users size={17} className="text-[#3B82F6]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{c.name}</p>
                    <p className="text-gray-500 text-xs flex items-center gap-2">
                      <span>{c.phone}</span>
                      <span className="flex items-center gap-1"><MapPin size={10} /> {c.wilaya}</span>
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white text-sm font-semibold">{DA(c.totalSpent)}</p>
                    <p className="text-gray-500 text-[11px]">{c.orders.length} commande{c.orders.length !== 1 ? 's' : ''}</p>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#25D366' }}>
                          <MessageCircle size={12} /> WhatsApp
                        </a>
                      )}
                      <span className="text-xs text-gray-500">Dernière commande : {new Date(c.lastOrder).toLocaleDateString('fr-DZ')}</span>
                    </div>

                    {/* Order history */}
                    <div className="space-y-1">
                      {c.orders.map(o => (
                        <div key={o.order_number} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-0">
                          <span className="text-gray-500 font-mono">{o.order_number}</span>
                          <span className="text-gray-400">{new Date(o.created_at).toLocaleDateString('fr-DZ')}</span>
                          <span className="text-gray-400">{ORDER_STATUS_LABELS[o.status]}</span>
                          <span className="text-white font-semibold">{DA(Number(o.total_price))}</span>
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
                            className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-xs outline-none focus:border-[#3B82F6]/50" />
                          <button onClick={() => saveNote(c.phone)} className="px-3 py-1.5 rounded-lg bg-[#3B82F6] text-white text-xs"><Check size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingNote(c.phone); setNoteDraft(notes[c.phone] ?? '') }}
                          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
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
