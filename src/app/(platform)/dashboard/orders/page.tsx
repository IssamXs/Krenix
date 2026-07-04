'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Order, OrderStatus, StoreSettings } from '@/types/database'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_SOURCE_LABELS } from '@/types/database'
import { buildWaLink, messageForStatus, orderMessageVars, renderTemplate, toWaNumber } from '@/lib/whatsapp'
import {
  ShoppingCart, X, Search, Eye,
  Clock, ClipboardCheck, Package, Truck, CheckCircle2, XCircle, RotateCcw,
  Loader2, MessageCircle
} from 'lucide-react'

const STATUS_CONFIG = {
  pending:      { icon: Clock,          label: ORDER_STATUS_LABELS.pending,       color: '#3B82F6' },
  confirmed:    { icon: ClipboardCheck, label: ORDER_STATUS_LABELS.confirmed,     color: '#3B82F6' },
  chez_livreur: { icon: Package,        label: ORDER_STATUS_LABELS.chez_livreur,  color: '#8B5CF6' },
  en_livraison: { icon: Truck,          label: ORDER_STATUS_LABELS.en_livraison,  color: '#06B6D4' },
  livree:       { icon: CheckCircle2,   label: ORDER_STATUS_LABELS.livree,        color: '#22C55E' },
  annulee:      { icon: XCircle,        label: ORDER_STATUS_LABELS.annulee,       color: '#EF4444' },
  retournee:    { icon: RotateCcw,      label: ORDER_STATUS_LABELS.retournee,     color: '#9CA3AF' },
} as const

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
      const { data: store } = await supabase.from('stores').select('id, name, settings').eq('owner_id', user.id).single()
      if (!store) { router.push('/onboarding/step-1'); return }
      setStoreId(store.id)
      setStoreName(store.name ?? '')
      setStoreSettings((store.settings ?? null) as StoreSettings | null)
      fetchOrders(store.id)
      // Is a courier (Yalidine) connected? Controls the "Créer l'expédition" action.
      fetch('/api/integrations/delivery')
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setDeliveryConnected(!!d.connected) })
        .catch(() => {})
    })
  }, [router, fetchOrders])

  // Open WhatsApp (wa.me) pre-filled with the status message for this order.
  const sendWhatsApp = (order: OrderWithProduct, status: OrderStatus) => {
    const template = messageForStatus(status, storeSettings?.orderMessages)
    if (!template) return
    const vars = orderMessageVars(order, { storeName, productName: order.product?.name ?? null })
    const link = buildWaLink(order.customer_phone, renderTemplate(template, vars))
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  // Create a Yalidine parcel for the open order, then store its tracking number.
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
    } finally { setShipping(false) }
  }

  // Statuses where stock has been deducted (order was accepted into the pipeline)
  const STOCK_DEDUCTED = new Set<OrderStatus>(['confirmed', 'chez_livreur', 'en_livraison', 'livree'])

  const updateStatus = async (id: string, newStatus: OrderStatus) => {
    if (!storeId) return
    setUpdating(id)
    const supabase = createClient()

    const order = orders.find(o => o.id === id)
    const prevStatus = order?.status

    await supabase.from('orders').update({ status: newStatus }).eq('id', id).eq('store_id', storeId)

    // Adjust inventory when the order moves in/out of the "confirmed zone".
    // Delta: -qty when entering, +qty when leaving, 0 otherwise.
    const wasDeducted = prevStatus ? STOCK_DEDUCTED.has(prevStatus) : false
    const isDeducted = STOCK_DEDUCTED.has(newStatus)
    const delta = !wasDeducted && isDeducted ? -order!.quantity
      : wasDeducted && !isDeducted ? order!.quantity
      : 0

    if (order && delta !== 0) {
      if (order.product_id) {
        // Store-product order → adjust products.stock
        const { data: product } = await supabase.from('products').select('stock').eq('id', order.product_id).single()
        if (product) {
          await supabase.from('products')
            .update({ stock: Math.max(0, product.stock + delta) })
            .eq('id', order.product_id)
        }
      } else if (order.landing_page_id) {
        // Landing-page order. If the page is linked to a product, the product
        // owns the stock → adjust it. Otherwise fall back to the page's own
        // stock column (null = untracked, skip).
        const { data: lp } = await supabase
          .from('landing_pages')
          .select('stock, product_id')
          .eq('id', order.landing_page_id)
          .single()
        if (lp?.product_id) {
          const { data: product } = await supabase.from('products').select('stock').eq('id', lp.product_id).single()
          if (product) {
            await supabase.from('products')
              .update({ stock: Math.max(0, product.stock + delta) })
              .eq('id', lp.product_id)
          }
        } else if (lp && lp.stock !== null) {
          await supabase.from('landing_pages')
            .update({ stock: Math.max(0, lp.stock + delta) })
            .eq('id', order.landing_page_id)
        }
      }
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

  const TIMELINE: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree']

  // WhatsApp-ready number for the currently open order (null if not sendable)
  const detailWa = detail ? toWaNumber(detail.customer_phone) : null

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Commandes</h2>
          <p className="text-gray-500 text-sm mt-1">{orders.length} commande{orders.length !== 1 ? 's' : ''} au total</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher par client, wilaya, numéro..."
          className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#111118] border border-white/10 text-white placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all text-sm"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            filter === 'all'
              ? 'border-[#3B82F6]/40 bg-[#3B82F6]/10 text-[#3B82F6]'
              : 'border-white/10 text-gray-500 hover:text-white hover:border-white/20'
          }`}
        >
          Toutes ({orders.length})
        </button>
        {(Object.keys(STATUS_CONFIG) as OrderStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s]
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={filter === s ? { borderColor: cfg.color + '40', color: cfg.color, backgroundColor: cfg.color + '15' } : undefined}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filter === s ? '' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/20'
              }`}
            >
              {cfg.label} ({countOf(s)})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 bg-[#111118] border border-white/5 rounded-2xl">
          <ShoppingCart size={36} className="text-gray-600" />
          <p className="text-gray-400 font-medium">{search || filter !== 'all' ? 'Aucun résultat' : 'Aucune commande'}</p>
          <p className="text-gray-600 text-xs text-center max-w-xs">
            {search || filter !== 'all' ? 'Essayez d\'autres filtres' : 'Partagez votre boutique pour recevoir vos premières commandes'}
          </p>
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['#', 'Client', 'Wilaya', 'Produit', 'Total', 'Statut', ''].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map(order => {
                  const cfg = STATUS_CONFIG[order.status]
                  return (
                    <tr key={order.id} className="hover:bg-white/2 transition-colors cursor-pointer" onClick={() => setDetail(order)}>
                      <td className="px-5 py-4 text-gray-500 text-xs font-mono">{order.order_number}</td>
                      <td className="px-5 py-4">
                        <p className="text-white font-medium">{order.customer_name}</p>
                        <p className="text-gray-500 text-xs">{order.customer_phone}</p>
                      </td>
                      <td className="px-5 py-4 text-gray-400">{order.wilaya}</td>
                      <td className="px-5 py-4 text-gray-300 max-w-[160px]">
                        <p className="truncate text-xs">{order.color ?? '—'}</p>
                        <p className="text-gray-500 text-xs">×{order.quantity}</p>
                      </td>
                      <td className="px-5 py-4 text-[#3B82F6] font-semibold whitespace-nowrap">
                        {Number(order.total_price).toLocaleString('fr-DZ')} DA
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap ${ORDER_STATUS_COLORS[order.status]}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <button
                          onClick={e => { e.stopPropagation(); setDetail(order) }}
                          className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setDetail(null)}>
          <div className="bg-[#111118] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
              <div>
                <p className="text-white font-semibold">{detail.order_number}</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {new Date(detail.created_at).toLocaleDateString('fr-DZ', { dateStyle: 'long' })}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-500 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Workflow — vertical node graph (n8n style) */}
            <div className="px-6 pt-5 pb-4 border-b border-white/5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500 uppercase tracking-wider">Flux de la commande</p>
                {!detailWa && (
                  <span className="text-[10px] text-amber-400/80">N° WhatsApp invalide</span>
                )}
              </div>

              <div className="relative">
                {TIMELINE.map((step, idx) => {
                  const cfg = STATUS_CONFIG[step]
                  const Icon = cfg.icon
                  const currentIdx = TIMELINE.indexOf(detail.status as OrderStatus)
                  const done = currentIdx >= 0 && idx <= currentIdx
                  const active = idx === currentIdx
                  const hasMsg = messageForStatus(step, storeSettings?.orderMessages) !== null
                  const isLast = idx === TIMELINE.length - 1
                  return (
                    <div key={step} className="flex items-stretch gap-3">
                      {/* Node + connector */}
                      <div className="flex flex-col items-center">
                        <button
                          onClick={() => updateStatus(detail.id, step)}
                          disabled={updating === detail.id || active}
                          title={cfg.label}
                          style={{
                            borderColor: done ? cfg.color : undefined,
                            backgroundColor: active ? cfg.color : done ? cfg.color + '22' : undefined,
                            boxShadow: active ? `0 0 0 4px ${cfg.color}22` : undefined,
                          }}
                          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border-2 transition-all z-10 ${
                            done ? '' : 'border-white/15 bg-white/5'
                          } ${active ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} disabled:cursor-default`}
                        >
                          <Icon size={15} style={{ color: done ? (active ? '#fff' : cfg.color) : '#6b7280' }} />
                        </button>
                        {!isLast && (
                          <div
                            className="w-px flex-1 my-1 rounded"
                            style={{ minHeight: 20, background: idx < currentIdx ? cfg.color : 'rgba(255,255,255,0.1)' }}
                          />
                        )}
                      </div>

                      {/* Label + WhatsApp action */}
                      <div className="flex-1 flex items-center justify-between gap-2 pb-4">
                        <div>
                          <p className="text-sm font-medium" style={{ color: active ? cfg.color : done ? '#fff' : '#9ca3af' }}>
                            {cfg.label}
                          </p>
                          {active && <p className="text-[11px] text-gray-600">Étape actuelle</p>}
                        </div>
                        {hasMsg && (
                          <button
                            onClick={() => sendWhatsApp(detail, step)}
                            disabled={!detailWa}
                            title={detailWa ? 'Envoyer une mise à jour WhatsApp' : 'Numéro WhatsApp invalide'}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                            style={{ background: detailWa ? '#25D366' : '#374151' }}
                          >
                            <MessageCircle size={12} /> WhatsApp
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Branch: cancel / return */}
              <div className="flex flex-wrap gap-2 mt-1 pl-12">
                {(['annulee', 'retournee'] as OrderStatus[]).map(s => {
                  const cfg = STATUS_CONFIG[s]
                  const Icon = cfg.icon
                  const isActive = detail.status === s
                  return (
                    <button
                      key={s}
                      onClick={() => updateStatus(detail.id, s)}
                      disabled={updating === detail.id || isActive}
                      style={isActive ? { borderColor: cfg.color, color: cfg.color, background: cfg.color + '15' } : undefined}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                        isActive ? '' : 'border-white/10 text-gray-500 hover:text-white hover:border-white/25'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Icon size={12} /> {cfg.label}
                    </button>
                  )
                })}
                {detail.status === 'annulee' && (
                  <button
                    onClick={() => sendWhatsApp(detail, 'annulee')}
                    disabled={!detailWa}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: detailWa ? '#25D366' : '#374151' }}
                  >
                    <MessageCircle size={12} /> WhatsApp
                  </button>
                )}
              </div>

              {updating === detail.id && (
                <div className="flex items-center gap-2 text-xs text-gray-500 mt-3">
                  <Loader2 size={12} className="animate-spin" /> Mise à jour…
                </div>
              )}
            </div>

            {/* Delivery — Yalidine */}
            {(deliveryConnected || detail.tracking_number) && (
              <div className="px-6 py-4 border-b border-white/5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Livraison</p>
                {detail.tracking_number ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-white">Colis Yalidine créé</p>
                      <p className="text-xs text-gray-500 font-mono truncate">{detail.tracking_number}</p>
                    </div>
                    {detail.delivery_label_url && (
                      <a href={detail.delivery_label_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 text-gray-300 hover:text-white transition-all flex-shrink-0">
                        Étiquette
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    {shipError && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg mb-2">{shipError}</div>}
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

            {/* Order info */}
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
                <div key={k} className="flex justify-between items-start border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
                  <span className="text-gray-500 flex-shrink-0">{k}</span>
                  <span className="text-white text-right max-w-[55%]">{v}</span>
                </div>
              ))}
              {detail.notes && (
                <div className="bg-white/5 rounded-xl p-3 text-gray-400 text-xs">{detail.notes}</div>
              )}
            </div>

            <div className="px-6 py-4">
              <button onClick={() => setDetail(null)} className="w-full py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm">
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
