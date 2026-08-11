'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { buildWaLink } from '@/lib/whatsapp'
import { orderStatusLabel, BUSINESS_PLANS, type Plan, type OrderStatus } from '@/types/database'
import { Users, Loader2, Search, MapPin, ChevronDown, ChevronUp, MessageCircle, FileText, Check } from 'lucide-react'
import LockedFeatureCard from '@/components/dashboard/ui/LockedFeatureCard'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface OrderLite {
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  total_price: number
  status: OrderStatus
  created_at: string
}

interface CustomerStats {
  customer_phone: string
  order_count: number
  customer_name: string | null
  wilaya: string | null
  total_spent: number
  last_order_at: string
}

interface Customer {
  phone: string
  name: string
  wilaya: string
  orderCount: number
  totalSpent: number
  lastOrder: string
}

import { formatDA as DA } from '@/lib/format'

export default function CrmPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [orderHistory, setOrderHistory] = useState<Record<string, OrderLite[]>>({})
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

      const [{ data: stats }, { data: noteRows }] = await Promise.all([
        supabase.from('store_customer_stats').select('customer_phone, order_count, customer_name, wilaya, total_spent, last_order_at').eq('store_id', store.id),
        supabase.from('customer_notes').select('phone, note').eq('store_id', store.id),
      ])

      // Customer list comes from the server-side aggregate view (054) — one row
      // per phone. Individual order histories are fetched on demand on expand.
      const customers = ((stats ?? []) as CustomerStats[])
        .filter(c => c.customer_phone)
        .map(c => ({
          phone: c.customer_phone,
          name: c.customer_name || '—',
          wilaya: c.wilaya || '—',
          orderCount: c.order_count,
          totalSpent: Number(c.total_spent ?? 0),
          lastOrder: c.last_order_at,
        }))
        .sort((a, b) => b.orderCount - a.orderCount)
      setCustomers(customers)
      const n: Record<string, string> = {}
      for (const r of noteRows ?? []) n[r.phone] = r.note ?? ''
      setNotes(n)
      setLoading(false)
    })
  }, [router])

  const toggleCustomer = async (c: Customer) => {
    if (open === c.phone) { setOpen(null); return }
    setOpen(c.phone)
    if (orderHistory[c.phone]) return
    const supabase = createClient()
    const { data } = await supabase
      .from('orders')
      .select('order_number, customer_name, customer_phone, wilaya, total_price, status, created_at')
      .eq('store_id', storeId)
      .eq('customer_phone', c.phone)
      .order('created_at', { ascending: false })
    setOrderHistory(prev => ({ ...prev, [c.phone]: (data ?? []) as OrderLite[] }))
  }

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
          <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('crm.title')}</h1>
          <p className="text-dash-ink-soft text-sm mt-1">{t('crm.lockedSubtitle')}</p>
        </div>
        <LockedFeatureCard title={t('crm.lockedFeatureTitle')} requiredPlan="Business" />
      </div>
    )
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchQ = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.wilaya.toLowerCase().includes(q)
    return matchQ && c.orderCount >= minOrders
  })

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('crm.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{t('crm.subtitle', { count: customers.length, plural: customers.length !== 1 ? 's' : '' })}</p>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-dash-ink-faint" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('crm.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm" />
        </div>
        <select value={minOrders} onChange={e => setMinOrders(Number(e.target.value))}
          className="px-3 py-2.5 rounded-xl bg-dash-surface border border-dash-border text-dash-ink text-sm outline-none">
          <option value={0}>{t('crm.filterAllOrders')}</option>
          <option value={2}>{t('crm.filterMin2')}</option>
          <option value={3}>{t('crm.filterMin3')}</option>
          <option value={5}>{t('crm.filterMin5')}</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-12 flex flex-col items-center gap-3 text-center">
          <Users size={32} className="text-dash-ink-faint" />
          <p className="text-dash-ink-soft text-sm">{search || minOrders ? t('crm.noMatchingCustomer') : t('crm.noCustomerYet')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const isOpen = open === c.phone
            const wa = buildWaLink(c.phone, t('crm.greeting', { name: c.name }))
            return (
              <div key={c.phone} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
                <button onClick={() => toggleCustomer(c)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dash-surface-2 transition-colors">
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
                    <p className="text-dash-ink-soft text-[11px]">{c.orderCount} commande{c.orderCount !== 1 ? 's' : ''}</p>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-dash-border pt-3 space-y-3">
                    <div className="flex items-center gap-2">
                      {wa && (
                        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: '#25D366' }}>
                          <MessageCircle size={12} /> {t('crm.whatsapp')}
                        </a>
                      )}
                      <span className="text-xs text-dash-ink-soft">{t('crm.lastOrder', { date: new Date(c.lastOrder).toLocaleDateString('fr-DZ') })}</span>
                    </div>

                    {/* Order history */}
                    <div className="space-y-1">
                      {(orderHistory[c.phone] ?? []).map(o => (
                        <div key={o.order_number} className="flex items-center justify-between text-xs py-1.5 border-b border-dash-border last:border-0">
                          <span className="text-dash-ink-soft font-mono">{o.order_number}</span>
                          <span className="text-dash-ink-soft">{new Date(o.created_at).toLocaleDateString('fr-DZ')}</span>
                          <span className="text-dash-ink-soft">{orderStatusLabel(o.status, locale)}</span>
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
                            placeholder={t('crm.notePlaceholder')}
                            className="flex-1 px-3 py-1.5 rounded-lg bg-dash-surface-2 border border-dash-border text-dash-ink text-xs outline-none focus:border-dash-accent/50" />
                          <button onClick={() => saveNote(c.phone)} className="px-3 py-1.5 rounded-lg bg-dash-accent text-white text-xs"><Check size={13} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingNote(c.phone); setNoteDraft(notes[c.phone] ?? '') }}
                          className="flex items-center gap-2 text-xs text-dash-ink-soft hover:text-dash-ink transition-colors">
                          <FileText size={12} /> {notes[c.phone] || t('crm.addNote')}
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
