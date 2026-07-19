'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Order, OrderStatus, StoreSettings } from '@/types/database'
import { ORDER_STATUS_LABELS, ORDER_STATUS_DASH_COLORS, ORDER_SOURCE_LABELS } from '@/types/database'
import { buildWaLink, messageForStatus, orderMessageVars, renderTemplate, toWaNumber } from '@/lib/whatsapp'
import {
  ShoppingCart, X, Search, Eye,
  Clock, ClipboardCheck, Package, Truck, CheckCircle2, XCircle, RotateCcw,
  Loader2, MessageCircle, Trash2
} from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import StatusBadge from '@/components/dashboard/ui/StatusBadge'
import { rowHover } from '@/lib/dashboard-motion'

const STATUS_ICON: Record<OrderStatus, React.ElementType> = {
  pending: Clock, confirmed: ClipboardCheck, chez_livreur: Package,
  en_livraison: Truck, livree: CheckCircle2, annulee: XCircle, retournee: RotateCcw,
}

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree', 'annulee', 'retournee']

// Order joined with its product name, used to personalize WhatsApp messages.
type OrderWithProduct = Order & { product?: { name: string } | null }

export default function OrdersPage() {
  const router = useRouter()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [storeName, setStoreName] = useState('')
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [orders, setOrders] = useState<OrderWithProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | OrderStatus>('all')
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<OrderWithProduct | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [deliveryConnected, setDeliveryConnected] = useState(false)
  const [shipping, setShipping] = useState(false)
  const [shipError, setShipError] = useState('')

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [deleting, setDeleting] = useState(false)

  const fetchOrders = useCallback(async (sid: string) => {
    const supabase = createClient()
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, product:products(name)')
      .eq('store_id', sid)
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as OrderWithProduct[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, name, settings') as { id: string; name: string; settings: StoreSettings | null } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      setStoreId(store.id)
      setStoreName(store.name ?? '')
      setStoreSettings((store.settings ?? null) as StoreSettings | null)
      fetchOrders(store.id)
      fetch('/api/integrations/delivery')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setDeliveryConnected(!!d.connected) })
        .catch(() => {})
    })
  }, [router, fetchOrders])

  const sendWhatsApp = (order: OrderWithProduct, status: OrderStatus) => {
    const template = messageForStatus(status, storeSettings?.orderMessages)
    if (!template) return
    const vars = orderMessageVars(order, { storeName, productName: order.product?.name ?? null })
    const link = buildWaLink(order.customer_phone, renderTemplate(template, vars))
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  const createShipment = async () => {
    if (!detail) return
    setShipping(true); setShipError('')
    try {
      const res = await fetch('/api/integrations/delivery/ship', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: detail.id }),
      })
      const d = await res.json()
      if (!res.ok) { setShipError(d.error ?? 'Création du colis échouée'); return }
      const patch = { tracking_number: d.tracking ?? null, delivery_provider: 'yalidine', delivery_label_url: d.labelUrl ?? null }
      setOrders(prev => prev.map(o => o.id === detail.id ? { ...o, ...patch } : o))
      setDetail(dd => (dd ? { ...dd, ...patch } : dd))
      if (storeSettings?.autoPrintLabel && d.labelUrl) {
        window.open(d.labelUrl, '_blank', 'noopener,noreferrer')
      }
    } finally { setShipping(false) }
  }

  const STOCK_DEDUCTED = new Set<OrderStatus>(['confirmed', 'chez_livreur', 'en_livraison', 'livree'])

  const updateStatus = async (id: string, newStatus: OrderStatus) => {
    if (!storeId) return
    setUpdating(id)
    const supabase = createClient()

    const order = orders.find(o => o.id === id)
    const prevStatus = order?.status

    await supabase.from('orders').update({ status: newStatus }).eq('id', id).eq('store_id', storeId)

    const wasDeducted = prevStatus ? STOCK_DEDUCTED.has(prevStatus) : false
    const isDeducted = STOCK_DEDUCTED.has(newStatus)
    const delta = !wasDeducted && isDeducted ? -order!.quantity
      : wasDeducted && !isDeducted ? order!.quantity
      : 0

    if (order && delta !== 0) {
      if (order.product_id) {
        const { data: product } = await supabase.from('products').select('stock').eq('id', order.product_id).single()
        if (product) {
          await supabase.from('products').update({ stock: Math.max(0, product.stock + delta) }).eq('id', order.product_id)
        }
      } else if (order.landing_page_id) {
        const { data: lp } = await supabase
          .from('landing_pages').select('stock, product_id').eq('id', order.landing_page_id).single()
        if (lp?.product_id) {
          const { data: product } = await supabase.from('products').select('stock').eq('id', lp.product_id).single()
          if (product) {
            await supabase.from('products').update({ stock: Math.max(0, product.stock + delta) }).eq('id', lp.product_id)
          }
        } else if (lp && lp.stock !== null) {
          await supabase.from('landing_pages').update({ stock: Math.max(0, lp.stock + delta) }).eq('id', order.landing_page_id)
        }
      }
    }

    if (newStatus === 'confirmed' && prevStatus !== 'confirmed') {
      fetch('/api/integrations/sms/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: id }),
      }).catch(() => {})
    }

    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o))
    setDetail(d => d?.id === id ? { ...d, status: newStatus } : d)
    setUpdating(null)
  }

  const filtered = orders.filter(o => {
    const matchFilter = filter === 'all' || o.status === filter
    const matchSearch = !search || o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
      o.order_number.toLowerCase().includes(search.toLowerCase()) ||
      o.wilaya.toLowerCase().includes(search.toLowerCase())
    return matchFilter && matchSearch
  })

  const countOf = (s: string) => orders.filter(o => o.status === s).length

  // Selection is cleared directly in the filter/search handlers below (not
  // via a useEffect keyed on [filter, search]) — react-hooks/set-state-in-effect
  // flags that pattern, and clearing at the point of change is simpler anyway.
  const changeFilter = (f: 'all' | OrderStatus) => { setFilter(f); setSelectedIds([]) }
  const changeSearch = (v: string) => { setSearch(v); setSelectedIds([]) }

  const deleteSelected = async () => {
    if (!window.confirm(`Êtes-vous sûr de vouloir supprimer ${selectedIds.length} commande(s) ? Cette action est irréversible.`)) return
    setDeleting(true)
    try {
      const res = await fetch('/api/orders/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }),
      })
      if (!res.ok) throw new Error('Erreur de suppression')
      setOrders(prev => prev.filter(o => !selectedIds.includes(o.id)))
      setSelectedIds([])
    } catch {
      alert('Erreur lors de la suppression')
    } finally {
      setDeleting(false)
    }
  }

  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(filtered.map(o => o.id))
    else setSelectedIds([])
  }

  const toggleOne = (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const TIMELINE: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree']
  const detailWa = detail ? toWaNumber(detail.customer_phone) : null

  return (
    <div className="space-y-6 max-w-6xl">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
        <div>
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">Gestion</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">Commandes</h1>
        </div>
        <div className="relative sm:w-[260px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dash-ink-faint" />
          <input
            value={search}
            onChange={e => changeSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full pl-9 pr-4 py-2.5 rounded-[11px] bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm dash-font-sans"
          />
        </div>
      </motion.div>

      <div className="flex gap-2 flex-wrap items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => changeFilter('all')}
            className={`px-4 py-2 rounded-full text-[13px] font-bold dash-font-sans transition-all ${
              filter === 'all' ? 'bg-dash-ink text-dash-surface' : 'text-dash-ink-soft hover:text-dash-ink bg-dash-surface-2'
            }`}
          >
            Toutes <span className="opacity-70">{orders.length}</span>
          </button>
          {STATUS_ORDER.map(s => {
            const active = filter === s
            const c = ORDER_STATUS_DASH_COLORS[s]
            return (
              <button
                key={s}
                onClick={() => changeFilter(s)}
                className={`px-4 py-2 rounded-full text-[13px] font-bold dash-font-sans transition-all ${
                  active ? `${c.bg} ${c.fg}` : 'text-dash-ink-soft hover:text-dash-ink bg-dash-surface-2'
                }`}
              >
                {ORDER_STATUS_LABELS[s]} <span className="opacity-70">{countOf(s)}</span>
              </button>
            )
          })}
        </div>

        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-3 bg-dash-danger-soft border border-dash-danger/20 px-3 py-1.5 rounded-xl text-sm text-dash-danger"
            >
              <span className="font-semibold">{selectedIds.length} sélectionné(s)</span>
              <button
                onClick={deleteSelected}
                disabled={deleting}
                className="flex items-center gap-1.5 bg-dash-danger hover:opacity-90 text-white px-2.5 py-1 rounded-lg font-medium transition-opacity disabled:opacity-50"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Supprimer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 gap-3">
          <ShoppingCart size={36} className="text-dash-ink-faint" />
          <p className="text-dash-ink-soft font-medium">{search || filter !== 'all' ? 'Aucun résultat' : 'Aucune commande'}</p>
          <p className="text-dash-ink-faint text-xs text-center max-w-xs">
            {search || filter !== 'all' ? "Essayez d'autres filtres" : 'Partagez votre boutique pour recevoir vos premières commandes'}
          </p>
        </Card>
      ) : (
        <Card padding="sm" className="overflow-hidden !p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-dash-surface-2">
                  <th className="px-5 py-3.5 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedIds.length === filtered.length}
                      onChange={toggleAll}
                      className="w-4 h-4 rounded border-dash-border accent-dash-accent cursor-pointer"
                    />
                  </th>
                  {['Commande', 'Client', 'Wilaya', 'Articles', 'Montant', 'Statut', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-bold text-dash-ink-soft uppercase tracking-wider whitespace-nowrap dash-font-sans">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, i) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    {...rowHover}
                    className="border-t border-dash-border cursor-pointer"
                    onClick={() => setDetail(order)}
                  >
                    <td className="px-5 py-4 text-center" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(order.id)}
                        onChange={e => toggleOne(e as unknown as React.MouseEvent, order.id)}
                        className="w-4 h-4 rounded border-dash-border accent-dash-accent cursor-pointer"
                      />
                    </td>
                    <td className="px-5 py-4 text-dash-ink font-bold">#{order.order_number}</td>
                    <td className="px-5 py-4">
                      <p className="text-dash-ink font-semibold">{order.customer_name}</p>
                      <p className="text-dash-ink-faint text-xs">{order.customer_phone}</p>
                    </td>
                    <td className="px-5 py-4 text-dash-ink-soft">{order.wilaya}</td>
                    <td className="px-5 py-4 text-dash-ink-soft max-w-[160px]">
                      <p className="truncate text-xs">{order.color ?? '—'}</p>
                      <p className="text-dash-ink-faint text-xs">×{order.quantity}</p>
                    </td>
                    <td className="px-5 py-4 text-dash-ink font-bold whitespace-nowrap tabular-nums">
                      {Number(order.total_price).toLocaleString('fr-DZ')} DA
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-4">
                      <button
                        onClick={e => { e.stopPropagation(); setDetail(order) }}
                        className="p-1.5 text-dash-ink-faint hover:text-dash-accent hover:bg-dash-accent-soft rounded-lg transition-colors"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AnimatePresence>
        {detail && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-dash-surface border border-dash-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dash-border">
                <div>
                  <p className="text-dash-ink font-bold">{detail.order_number}</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5">
                    {new Date(detail.created_at).toLocaleDateString('fr-DZ', { dateStyle: 'long' })}
                  </p>
                </div>
                <button onClick={() => setDetail(null)} className="text-dash-ink-faint hover:text-dash-ink transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="px-6 pt-5 pb-4 border-b border-dash-border">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-dash-ink-soft uppercase tracking-wider dash-font-sans font-bold">Flux de la commande</p>
                  {!detailWa && <span className="text-[10px] text-dash-warning-dark">N° WhatsApp invalide</span>}
                </div>

                <div className="relative">
                  {TIMELINE.map((step, idx) => {
                    const Icon = STATUS_ICON[step]
                    const c = ORDER_STATUS_DASH_COLORS[step]
                    const currentIdx = TIMELINE.indexOf(detail.status as OrderStatus)
                    const done = currentIdx >= 0 && idx <= currentIdx
                    const active = idx === currentIdx
                    const hasMsg = messageForStatus(step, storeSettings?.orderMessages) !== null
                    const isLast = idx === TIMELINE.length - 1
                    return (
                      <div key={step} className="flex items-stretch gap-3">
                        <div className="flex flex-col items-center">
                          <button
                            onClick={() => updateStatus(detail.id, step)}
                            disabled={updating === detail.id || active}
                            title={ORDER_STATUS_LABELS[step]}
                            className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-all z-10 ${
                              active ? `${c.dot} border-transparent` : done ? `${c.bg} border-transparent` : 'border-dash-border bg-dash-surface-2'
                            } ${active ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} disabled:cursor-default`}
                          >
                            <Icon size={15} className={active ? 'text-white' : done ? c.fg : 'text-dash-ink-faint'} />
                          </button>
                          {!isLast && (
                            <div className={`w-px flex-1 my-1 rounded ${idx < currentIdx ? c.dot : 'bg-dash-border'}`} style={{ minHeight: 20 }} />
                          )}
                        </div>

                        <div className="flex-1 flex items-center justify-between gap-2 pb-4">
                          <div>
                            <p className={`text-sm font-medium ${active ? c.fg : done ? 'text-dash-ink' : 'text-dash-ink-faint'}`}>
                              {ORDER_STATUS_LABELS[step]}
                            </p>
                            {active && <p className="text-[11px] text-dash-ink-faint">Étape actuelle</p>}
                          </div>
                          {hasMsg && (
                            <button
                              onClick={() => sendWhatsApp(detail, step)}
                              disabled={!detailWa}
                              title={detailWa ? 'Envoyer une mise à jour WhatsApp' : 'Numéro WhatsApp invalide'}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                              style={{ background: detailWa ? '#25D366' : '#9CA3AF' }}
                            >
                              <MessageCircle size={12} /> WhatsApp
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-wrap gap-2 mt-1 pl-12">
                  {(['annulee', 'retournee'] as OrderStatus[]).map(s => {
                    const Icon = STATUS_ICON[s]
                    const c = ORDER_STATUS_DASH_COLORS[s]
                    const isActive = detail.status === s
                    return (
                      <button
                        key={s}
                        onClick={() => updateStatus(detail.id, s)}
                        disabled={updating === detail.id || isActive}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                          isActive ? `${c.bg} ${c.fg} border-transparent` : 'border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <Icon size={12} /> {ORDER_STATUS_LABELS[s]}
                      </button>
                    )
                  })}
                  {detail.status === 'annulee' && (
                    <button
                      onClick={() => sendWhatsApp(detail, 'annulee')}
                      disabled={!detailWa}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{ background: detailWa ? '#25D366' : '#9CA3AF' }}
                    >
                      <MessageCircle size={12} /> WhatsApp
                    </button>
                  )}
                </div>

                {updating === detail.id && (
                  <div className="flex items-center gap-2 text-xs text-dash-ink-faint mt-3">
                    <Loader2 size={12} className="animate-spin" /> Mise à jour…
                  </div>
                )}
              </div>

              {(deliveryConnected || detail.tracking_number) && (
                <div className="px-6 py-4 border-b border-dash-border">
                  <p className="text-xs text-dash-ink-soft uppercase tracking-wider mb-2 dash-font-sans font-bold">Livraison</p>
                  {detail.tracking_number ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-dash-ink">Colis Yalidine créé</p>
                        <p className="text-xs text-dash-ink-faint font-mono truncate">{detail.tracking_number}</p>
                      </div>
                      {detail.delivery_label_url && (
                        <a href={detail.delivery_label_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink transition-all flex-shrink-0">
                          Étiquette
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      {shipError && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg mb-2">{shipError}</div>}
                      <button
                        onClick={createShipment}
                        disabled={shipping}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                        style={{ background: '#C8201C' }}
                      >
                        {shipping ? <><Loader2 size={15} className="animate-spin" /> Création du colis…</> : <><Truck size={15} /> Créer l&apos;expédition Yalidine</>}
                      </button>
                    </>
                  )}
                </div>
              )}

              <div className="px-6 py-4 space-y-2.5 text-sm max-h-60 overflow-y-auto">
                {[
                  ['Client', detail.customer_name],
                  ['Téléphone', detail.customer_phone],
                  ['Wilaya', detail.wilaya],
                  ['Commune', detail.commune],
                  ['Couleur', detail.color ?? '—'],
                  ['Taille', detail.size ?? '—'],
                  ['Quantité', String(detail.quantity)],
                  ['Livraison', `${Number(detail.delivery_price).toLocaleString('fr-DZ')} DA`],
                  ['Total', `${Number(detail.total_price).toLocaleString('fr-DZ')} DA`],
                  ['Source', ORDER_SOURCE_LABELS[detail.source] ?? detail.source],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between items-start border-b border-dash-border pb-2 last:border-b-0 last:pb-0">
                    <span className="text-dash-ink-soft flex-shrink-0">{k}</span>
                    <span className="text-dash-ink text-right max-w-[55%]">{v}</span>
                  </div>
                ))}
                {detail.notes && (
                  <div className="bg-dash-surface-2 rounded-xl p-3 text-dash-ink-soft text-xs">{detail.notes}</div>
                )}
              </div>

              <div className="px-6 py-4">
                <button onClick={() => setDetail(null)} className="w-full py-2.5 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint transition-all text-sm">
                  Fermer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
