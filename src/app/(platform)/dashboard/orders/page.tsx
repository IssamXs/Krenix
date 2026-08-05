'use client'

import { useEffect, useState, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Order, OrderStatus, StoreSettings } from '@/types/database'
import { ORDER_STATUS_DASH_COLORS, orderStatusLabel, orderSourceLabel } from '@/types/database'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { buildWaLink, messageForStatus, orderMessageVars, renderTemplate, toWaNumber } from '@/lib/whatsapp'
import { applyVariantDelta, type VariantStock } from '@/lib/variants'
import { COURIERS } from '@/lib/couriers'
import type { DeliveryProvider } from '@/types/database'
import { getFraudShieldStatus } from '@/lib/fraud-shield/status'
import type { AiScanResult } from '@/lib/fraud-shield/ai-scan'
import { applySort, type SortValue } from '@/lib/sort'
import SortSelect from '@/components/dashboard/ui/SortSelect'
import {
  ShoppingCart, X, Search, Eye,
  Clock, ClipboardCheck, Package, Truck, CheckCircle2, XCircle, RotateCcw,
  Loader2, MessageCircle, Trash2, ChevronDown, ShieldAlert, Check,
  Bot, Lock, Archive, ArchiveRestore
} from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import StatusBadge from '@/components/dashboard/ui/StatusBadge'
import { rowHover } from '@/lib/dashboard-motion'

const STATUS_ICON: Record<OrderStatus, React.ElementType> = {
  pending: Clock, confirmed: ClipboardCheck, chez_livreur: Package,
  en_livraison: Truck, livree: CheckCircle2, annulee: XCircle, retournee: RotateCcw,
}

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree', 'annulee', 'retournee']

// Order joined with its product name + preferred courier, used to personalize
// WhatsApp messages and to pre-select the ship button's provider.
type OrderWithProduct = Order & { 
  product?: { name: string; preferred_delivery_provider: DeliveryProvider | null } | null
  landing_page?: { title: string } | null
}

async function fetchOrders(storeId: string): Promise<OrderWithProduct[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('orders')
    .select('*, product:products(name, preferred_delivery_provider), landing_page:landing_pages(title)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
  return (data ?? []) as OrderWithProduct[]
}

export default function OrdersPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const queryClient = useQueryClient()
  const [storeId, setStoreId] = useState<string | null>(null)
  const [storeName, setStoreName] = useState('')
  const [storeSettings, setStoreSettings] = useState<StoreSettings | null>(null)
  const [fraudShieldEnabled, setFraudShieldEnabled] = useState(false)
  const [filter, setFilter] = useState<'all' | 'at_risk' | OrderStatus>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortValue>('date_desc')
  const [detail, setDetail] = useState<OrderWithProduct | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [deliveryConnected, setDeliveryConnected] = useState(false)
  const [connectedProviders, setConnectedProviders] = useState<DeliveryProvider[]>([])
  // Shared "ship this order" state — used by both the row action and the
  // detail modal's shipping section, keyed by order id so they never fight.
  const [rowShippingId, setRowShippingId] = useState<string | null>(null)
  const [providerPickerId, setProviderPickerId] = useState<string | null>(null)
  const [rowShipError, setRowShipError] = useState<{ orderId: string; message: string } | null>(null)

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Active / archived view + AI fake-orders detector (paid Fraud Shield feature).
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [canScan, setCanScan] = useState(false)
  const [aiState, setAiState] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [aiResults, setAiResults] = useState<AiScanResult[] | null>(null)
  const [aiError, setAiError] = useState('')
  const [aiProgress, setAiProgress] = useState(0)
  const [aiBusy, setAiBusy] = useState(false)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)


  const queryKey = ['orders', storeId] as const
  const { data: orders = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchOrders(storeId!),
    enabled: !!storeId,
  })
  const setOrders = (updater: (prev: OrderWithProduct[]) => OrderWithProduct[]) =>
    queryClient.setQueryData<OrderWithProduct[]>(queryKey, prev => updater(prev ?? []))

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, name, settings, fraud_shield_enabled') as { id: string; name: string; settings: StoreSettings | null; fraud_shield_enabled: boolean } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      setStoreId(store.id)
      setStoreName(store.name ?? '')
      setStoreSettings((store.settings ?? null) as StoreSettings | null)
      setFraudShieldEnabled(!!store.fraud_shield_enabled)
      getFraudShieldStatus(supabase, store.id).then(s => setCanScan(s.canScan)).catch(() => {})
      fetch('/api/integrations/delivery')
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!d) return
          setDeliveryConnected(!!d.connected)
          setConnectedProviders((d.connections ?? []).map((c: { provider: DeliveryProvider }) => c.provider))
        })
        .catch(() => {})
    })
  }, [router])

  const sendWhatsApp = (order: OrderWithProduct, status: OrderStatus) => {
    const template = messageForStatus(status, storeSettings?.orderMessages)
    if (!template) return
    const vars = orderMessageVars(order, { storeName, productName: order.product?.name ?? null })
    const link = buildWaLink(order.customer_phone, renderTemplate(template, vars))
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  // Ship straight from the list row (no need to open the detail modal). If the
  // store has more than one courier connected, `provider` picks which one —
  // the caller opens a small picker first; with exactly one connection there's
  // nothing to choose, so the row button ships immediately.
  const shipOrderFromRow = async (orderId: string, provider?: DeliveryProvider) => {
    setRowShippingId(orderId); setProviderPickerId(null); setRowShipError(null)
    try {
      const res = await fetch('/api/integrations/delivery/ship', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, provider }),
      })
      const d = await res.json()
      if (!res.ok) { setRowShipError({ orderId, message: d.error ?? t('orders.creationFailed') }); return }
      const patch = { tracking_number: d.tracking ?? null, delivery_provider: d.provider ?? provider ?? 'yalidine', delivery_label_url: d.labelUrl ?? null }
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...patch } : o))
      setDetail(dd => (dd && dd.id === orderId ? { ...dd, ...patch } : dd))
      if (storeSettings?.autoPrintLabel && d.labelUrl) {
        window.open(d.labelUrl, '_blank', 'noopener,noreferrer')
      }
    } finally { setRowShippingId(null) }
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

    // Adjust the general product stock AND the specific colour/size variant
    // pools by the same signed delta. A "Bleu / S" order only touches the Bleu
    // pool and the S pool (plus the general total), never other variants.
    const adjustProductStock = async (productId: string) => {
      const { data: product } = await supabase
        .from('products').select('stock, variant_stock').eq('id', productId).single()
      if (!product) return
      const nextVariant = applyVariantDelta(
        product.variant_stock as VariantStock | null,
        order!.color ?? null,
        order!.size ?? null,
        delta,
      )
      await supabase.from('products').update({
        stock: Math.max(0, product.stock + delta),
        variant_stock: nextVariant,
      }).eq('id', productId).eq('store_id', storeId)
    }

    if (order && delta !== 0) {
      if (order.product_id) {
        await adjustProductStock(order.product_id)
      } else if (order.landing_page_id) {
        const { data: lp } = await supabase
          .from('landing_pages').select('stock, product_id').eq('id', order.landing_page_id).single()
        if (lp?.product_id) {
          await adjustProductStock(lp.product_id)
        } else if (lp && lp.stock !== null) {
          await supabase.from('landing_pages').update({ stock: Math.max(0, lp.stock + delta) }).eq('id', order.landing_page_id).eq('store_id', storeId)
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

  const RISK_THRESHOLD = 60
  const isAtRisk = (o: OrderWithProduct) => (o.fraud_risk_score ?? 0) >= RISK_THRESHOLD

  // Archived orders are hidden from the live list; the archive view shows them.
  const viewOrders = view === 'archived'
    ? orders.filter(o => o.is_archived)
    : orders.filter(o => !o.is_archived)
  const archivedCount = orders.filter(o => o.is_archived).length

  const filtered = applySort(
    viewOrders.filter(o => {
      const matchFilter = filter === 'all' || (filter === 'at_risk' ? isAtRisk(o) : o.status === filter)
      const matchSearch = !search || o.customer_name.toLowerCase().includes(search.toLowerCase()) ||
        o.order_number.toLowerCase().includes(search.toLowerCase()) ||
        o.wilaya.toLowerCase().includes(search.toLowerCase())
      return matchFilter && matchSearch
    }),
    sort, o => o.customer_name, o => o.created_at,
  )

  const countOf = (s: string) => viewOrders.filter(o => o.status === s).length
  const riskyCount = viewOrders.filter(isAtRisk).length

  // ── AI fake-orders detector ──────────────────────────────────
  const startAiScan = async () => {
    if (selectedIds.length === 0) { alert(t('orders.aiDetectNoSelection')); return }
    if (!canScan) { alert(t('orders.aiDetectLocked')); return }
    setAiState('scanning'); setAiError(''); setAiResults(null); setAiProgress(0)
    progressTimer.current = setInterval(() => {
      setAiProgress(p => (p >= 90 ? p : Math.min(90, p + 8 + Math.random() * 12)))
    }, 700)
    try {
      const res = await fetch('/api/orders/ai-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? t('orders.aiScanError'))
      setAiResults(d.results as AiScanResult[])
      setAiState('done')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('orders.aiScanError'))
      setAiState('idle')
    } finally {
      if (progressTimer.current) clearInterval(progressTimer.current)
      setAiProgress(100)
    }
  }

  const closeAiModal = () => {
    if (progressTimer.current) clearInterval(progressTimer.current)
    setAiState('idle'); setAiResults(null); setAiError('')
  }

  const archiveOrders = async (ids: string[], archived: boolean) => {
    if (ids.length === 0) return
    setAiBusy(true)
    try {
      const res = await fetch('/api/orders/archive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, archived }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? t('orders.deleteFailedGeneric')); return }
      setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, is_archived: archived } : o))
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
    } finally { setAiBusy(false) }
  }

  const deleteOrders = async (ids: string[]) => {
    if (ids.length === 0) return
    if (!window.confirm(t('orders.confirmDelete', { count: ids.length }))) return
    setAiBusy(true)
    try {
      const res = await fetch('/api/orders/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error(t('orders.deleteFailed'))
      setOrders(prev => prev.filter(o => !ids.includes(o.id)))
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
    } catch {
      alert(t('orders.deleteFailedGeneric'))
    } finally { setAiBusy(false) }
  }



  const confirmFraudLabel = async (orderId: string, label: 'confirmed_real' | 'confirmed_fake') => {
    if (!storeId) return
    const supabase = createClient()
    await supabase.from('orders').update({ fraud_label: label }).eq('id', orderId).eq('store_id', storeId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, fraud_label: label } : o))
    setDetail(d => d && d.id === orderId ? { ...d, fraud_label: label } : d)
  }

  // Selection is cleared directly in the filter/search handlers below (not
  // via a useEffect keyed on [filter, search]) — react-hooks/set-state-in-effect
  // flags that pattern, and clearing at the point of change is simpler anyway.
  const changeFilter = (f: 'all' | 'at_risk' | OrderStatus) => { setFilter(f); setSelectedIds([]) }
  const changeView = (v: 'active' | 'archived') => { setView(v); setSelectedIds([]) }
  const changeSearch = (v: string) => { setSearch(v); setSelectedIds([]) }

  const deleteSelected = async () => {
    await deleteOrders(selectedIds)
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
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">{t('orders.kicker')}</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('orders.title')}</h1>
        </div>
        <div className="flex gap-2 items-center">
          <div className="relative sm:w-[260px]">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-dash-ink-faint" />
            <input
              value={search}
              onChange={e => changeSearch(e.target.value)}
              placeholder={t('orders.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 rounded-[11px] bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm dash-font-sans"
            />
          </div>
          <SortSelect value={sort} onChange={setSort} />
          <button
            onClick={startAiScan}
            disabled={aiState === 'scanning' || selectedIds.length === 0 || !canScan}
            title={!canScan ? t('orders.aiDetectLocked') : selectedIds.length === 0 ? t('orders.aiDetectNoSelection') : t('orders.aiDetectHint')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[11px] font-semibold text-sm transition-all whitespace-nowrap ${
              canScan
                ? 'bg-dash-accent text-white hover:opacity-90'
                : 'bg-dash-surface-2 text-dash-ink-faint'
            } disabled:opacity-60 disabled:cursor-not-allowed`}
          >
            {aiState === 'scanning' ? <Loader2 size={15} className="animate-spin" /> : canScan ? <Bot size={15} /> : <Lock size={15} />}
            {t('orders.aiDetect')}
          </button>
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
            {t('orders.filterAll')} <span className="opacity-70">{viewOrders.length}</span>
          </button>
          <div className="flex items-center gap-1 px-1.5 py-1 bg-dash-surface-2 rounded-full">
            <button
              onClick={() => changeView('active')}
              className={`px-3 py-1 rounded-full text-[13px] font-bold dash-font-sans transition-all ${
                view === 'active' ? 'bg-dash-surface text-dash-ink shadow-sm' : 'text-dash-ink-soft hover:text-dash-ink'
              }`}
            >
              {t('orders.filterActive')}
            </button>
            <button
              onClick={() => changeView('archived')}
              className={`px-3 py-1 rounded-full text-[13px] font-bold dash-font-sans transition-all ${
                view === 'archived' ? 'bg-dash-surface text-dash-ink shadow-sm' : 'text-dash-ink-soft hover:text-dash-ink'
              }`}
            >
              {t('orders.filterArchived')} <span className="opacity-70">{archivedCount}</span>
            </button>
          </div>
          {fraudShieldEnabled && riskyCount > 0 && (
            <button
              onClick={() => changeFilter('at_risk')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-bold dash-font-sans transition-all ${
                filter === 'at_risk' ? 'bg-dash-danger text-white' : 'text-dash-danger bg-dash-danger-soft hover:opacity-80'
              }`}
            >
              <ShieldAlert size={13} /> {t('orders.fraudFilterRisky')} <span className="opacity-70">{riskyCount}</span>
            </button>
          )}
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
                {orderStatusLabel(s, locale)} <span className="opacity-70">{countOf(s)}</span>
              </button>
            )
          })}
        </div>

        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center gap-3 bg-dash-surface border border-dash-border px-3 py-1.5 rounded-xl text-sm"
            >
              <span className="font-semibold text-dash-ink">{t('orders.selectedCount', { count: selectedIds.length })}</span>
              <button
                onClick={startAiScan}
                disabled={aiState === 'scanning' || !canScan || aiBusy}
                title={!canScan ? t('orders.aiDetectLocked') : t('orders.aiDetectHint')}
                className="flex items-center gap-1.5 bg-dash-accent hover:opacity-90 text-white px-2.5 py-1 rounded-lg font-medium transition-opacity disabled:opacity-50"
              >
                {aiState === 'scanning' ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />} {t('orders.aiDetect')}
              </button>
              <button
                onClick={() => archiveOrders(selectedIds, true)}
                disabled={aiBusy || view === 'archived'}
                title={view === 'archived' ? t('orders.archiveEmpty') : t('orders.aiScanArchive')}
                className="flex items-center gap-1.5 border border-dash-border text-dash-ink-soft hover:text-dash-ink px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                <Archive size={14} /> {t('orders.aiScanArchive')}
              </button>
              {view === 'archived' && (
                <button
                  onClick={() => archiveOrders(selectedIds, false)}
                  disabled={aiBusy}
                  className="flex items-center gap-1.5 border border-dash-border text-dash-ink-soft hover:text-dash-ink px-2.5 py-1 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  <ArchiveRestore size={14} /> {t('orders.restore')}
                </button>
              )}
              <button
                onClick={deleteSelected}
                disabled={aiBusy}
                className="flex items-center gap-1.5 bg-dash-danger hover:opacity-90 text-white px-2.5 py-1 rounded-lg font-medium transition-opacity disabled:opacity-50"
              >
                {aiBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} {t('orders.delete')}
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
          <p className="text-dash-ink-soft font-medium">
            {search || filter !== 'all' ? t('orders.noResults') : view === 'archived' ? t('orders.archiveEmpty') : t('orders.noOrders')}
          </p>
          <p className="text-dash-ink-faint text-xs text-center max-w-xs">
            {search || filter !== 'all' ? t('orders.tryOtherFilters') : view === 'archived' ? t('orders.archiveEmpty') : t('orders.shareStore')}
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
                  {[t('orders.colCommande'), t('orders.colClient'), t('orders.colWilaya'), t('orders.colArticles'), t('orders.colNote'), t('orders.colFraudAlert'), t('orders.colMontant'), t('orders.colStatut'), ''].map((h, i) => (
                    <th key={`${h}-${i}`} className="px-5 py-3.5 text-left text-[11px] font-bold text-dash-ink-soft uppercase tracking-wider whitespace-nowrap dash-font-sans">{h}</th>
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
                    <td className="px-5 py-4 text-dash-ink font-bold whitespace-nowrap">
                      #{order.order_number}
                      {order.is_archived && (
                        <span className="ml-2 rtl:ml-0 rtl:mr-2 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-dash-neutral-soft text-dash-neutral">
                          <Archive size={10} /> {t('orders.archivedBadge')}
                        </span>
                      )}
                      {fraudShieldEnabled && order.fraud_risk_score !== null && (
                        <span
                          title={t('orders.fraudBadgeTitle', { score: order.fraud_risk_score })}
                          className={`ml-2 rtl:ml-0 rtl:mr-2 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            order.fraud_risk_score >= 60 ? 'bg-dash-danger-soft text-dash-danger'
                              : order.fraud_risk_score >= 30 ? 'bg-dash-warning-soft text-dash-warning-dark'
                              : 'bg-dash-surface-2 text-dash-ink-faint'
                          }`}
                        >
                          <ShieldAlert size={10} /> {order.fraud_risk_score}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-dash-ink font-semibold">{order.customer_name}</p>
                      <p className="text-dash-ink-faint text-xs">{order.customer_phone}</p>
                    </td>
                    <td className="px-5 py-4 text-dash-ink-soft">
                      {order.wilaya}
                      <span className={`block mt-1 w-fit text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        order.delivery_type === 'desk' ? 'bg-dash-info-soft text-dash-info' : 'bg-dash-neutral-soft text-dash-neutral'
                      }`}>
                        {order.delivery_type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-dash-ink-soft max-w-[160px]">
                      <p className="truncate text-xs text-dash-ink font-semibold mb-0.5" title={order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}>
                        {order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-xs">{order.color && order.color !== '—' ? order.color : (order.size && order.size !== '—' ? order.size : t('orders.standardVariant'))}</p>
                        <p className="text-dash-ink-faint text-xs">×{order.quantity}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-dash-ink-soft max-w-[150px]">
                      {order.notes ? (
                        <p className="text-xs truncate" title={order.notes}>{order.notes}</p>
                      ) : (
                        <span className="text-dash-ink-faint text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                      {order.fraud_risk_score !== null ? (
                        <div className="flex flex-col gap-1.5">
                          {/* Score + label */}
                          <div className="flex items-center gap-1.5">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              order.fraud_risk_score >= 60 ? 'bg-dash-danger-soft text-dash-danger'
                                : order.fraud_risk_score >= 30 ? 'bg-dash-warning-soft text-dash-warning-dark'
                                : 'bg-dash-surface-2 text-dash-ink-faint'
                            }`}>
                              <ShieldAlert size={11} /> {order.fraud_risk_score}
                            </span>
                            {order.fraud_label === 'confirmed_fake' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-dash-danger text-white">{t('orders.fraudLabelFake')}</span>
                            )}
                            {order.fraud_label === 'confirmed_real' && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-dash-success text-white">{t('orders.fraudLabelReal')}</span>
                            )}
                          </div>
                          {/* Quick action buttons for pending review */}
                          {order.fraud_label === 'pending' && order.fraud_risk_score >= 60 && (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => confirmFraudLabel(order.id, 'confirmed_real')}
                                title={t('orders.fraudMarkReal')}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-dash-success-soft text-dash-success hover:bg-dash-success hover:text-white transition-all"
                              >
                                <Check size={11} /> {t('orders.fraudLabelReal')}
                              </button>
                              <button
                                onClick={() => confirmFraudLabel(order.id, 'confirmed_fake')}
                                title={t('orders.fraudMarkFake')}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold bg-dash-danger-soft text-dash-danger hover:bg-dash-danger hover:text-white transition-all"
                              >
                                <X size={11} /> {t('orders.fraudLabelFake')}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-dash-ink-faint">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-dash-ink font-bold whitespace-nowrap tabular-nums">
                      {Number(order.total_price).toLocaleString('fr-DZ')} DA
                    </td>
                    <td className="px-5 py-4"><StatusBadge status={order.status} /></td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 relative" onClick={e => e.stopPropagation()}>
                        {view === 'archived' && (
                          <button
                            onClick={() => archiveOrders([order.id], false)}
                            disabled={aiBusy}
                            title={t('orders.restore')}
                            className="p-1.5 text-dash-ink-faint hover:text-dash-success hover:bg-dash-success-soft rounded-lg transition-colors disabled:opacity-50"
                          >
                            <ArchiveRestore size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => setDetail(order)}
                          className="p-1.5 text-dash-ink-faint hover:text-dash-accent hover:bg-dash-accent-soft rounded-lg transition-colors"
                        >
                          <Eye size={14} />
                        </button>

                        {connectedProviders.length > 0 && (
                          order.tracking_number ? (
                            <span title={t('orders.shippedVia', { provider: COURIERS[order.delivery_provider as DeliveryProvider]?.label ?? order.delivery_provider })}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-dash-success-soft text-dash-success whitespace-nowrap">
                              <Truck size={11} /> {t('orders.shipped')}
                            </span>
                          ) : (
                            <div className="relative">
                              <button
                                onClick={() => {
                                  const preferred = order.product?.preferred_delivery_provider
                                  if (connectedProviders.length === 1) {
                                    shipOrderFromRow(order.id, connectedProviders[0])
                                  } else if (preferred && connectedProviders.includes(preferred)) {
                                    shipOrderFromRow(order.id, preferred)
                                  } else {
                                    setProviderPickerId(id => id === order.id ? null : order.id)
                                  }
                                }}
                                disabled={rowShippingId === order.id}
                                className="flex items-center gap-1 px-2 py-1.5 text-dash-ink-faint hover:text-dash-accent hover:bg-dash-accent-soft rounded-lg transition-colors disabled:opacity-50"
                                title={t('orders.createShipment')}
                              >
                                {rowShippingId === order.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <Truck size={14} />}
                                {connectedProviders.length > 1 && <ChevronDown size={11} />}
                              </button>

                              {providerPickerId === order.id && (
                                <div className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-1 z-20 bg-dash-surface border border-dash-border rounded-xl shadow-lg py-1.5 min-w-[160px]">
                                  <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-dash-ink-faint font-bold">{t('orders.shipVia')}</p>
                                  {connectedProviders.map(p => (
                                    <button
                                      key={p}
                                      onClick={() => shipOrderFromRow(order.id, p)}
                                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-dash-ink hover:bg-dash-surface-2 transition-colors text-left"
                                    >
                                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COURIERS[p]?.color ?? '#999' }} />
                                      {COURIERS[p]?.label ?? p}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {rowShipError?.orderId === order.id && (
                                <p className="absolute right-0 rtl:right-auto rtl:left-0 top-full mt-1 z-20 text-[10px] text-dash-danger bg-dash-danger-soft border border-dash-danger/20 rounded-lg px-2 py-1 whitespace-nowrap max-w-[220px] whitespace-normal">
                                  {rowShipError.message}
                                </p>
                              )}
                            </div>
                          )
                        )}
                      </div>
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
              className="bg-dash-surface border border-dash-border rounded-2xl w-full max-w-md shadow-2xl max-h-[85vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dash-border sticky top-0 z-10 bg-dash-surface">
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
                  <p className="text-xs text-dash-ink-soft uppercase tracking-wider dash-font-sans font-bold">{t('orders.orderFlow')}</p>
                  {!detailWa && <span className="text-[10px] text-dash-warning-dark">{t('orders.invalidWhatsapp')}</span>}
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
                            title={orderStatusLabel(step, locale)}
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
                              {orderStatusLabel(step, locale)}
                            </p>
                            {active && <p className="text-[11px] text-dash-ink-faint">{t('orders.currentStep')}</p>}
                          </div>
                          {hasMsg && (
                            <button
                              onClick={() => sendWhatsApp(detail, step)}
                              disabled={!detailWa}
                              title={detailWa ? t('orders.sendWhatsappUpdate') : t('orders.invalidWhatsapp')}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                              style={{ background: detailWa ? '#25D366' : '#9CA3AF' }}
                            >
                              <MessageCircle size={12} /> {t('orders.whatsapp')}
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
                        <Icon size={12} /> {orderStatusLabel(s, locale)}
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
                      <MessageCircle size={12} /> {t('orders.whatsapp')}
                    </button>
                  )}
                </div>

                {updating === detail.id && (
                  <div className="flex items-center gap-2 text-xs text-dash-ink-faint mt-3">
                    <Loader2 size={12} className="animate-spin" /> {t('orders.updating')}
                  </div>
                )}
              </div>

              {fraudShieldEnabled && detail.fraud_risk_score !== null && (
                <div className="px-6 py-4 border-b border-dash-border space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-dash-ink-soft uppercase tracking-wider dash-font-sans font-bold flex items-center gap-1.5">
                      <ShieldAlert size={13} /> {t('orders.fraudSectionTitle')}
                    </p>
                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-dash-surface-2 font-bold text-sm ${
                      detail.fraud_risk_score >= 60 ? 'text-dash-danger' : detail.fraud_risk_score >= 30 ? 'text-dash-warning-dark' : 'text-dash-ink-soft'
                    }`}>
                      {detail.fraud_risk_score}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {Object.entries(detail.fraud_signals ?? {}).map(([key, sig]) => (
                      <div key={key} className="flex items-center justify-between text-xs gap-3">
                        <span className="text-dash-ink-soft">{sig.detail}</span>
                        <span className="text-dash-ink font-semibold flex-shrink-0">+{sig.points}</span>
                      </div>
                    ))}
                    {Object.keys(detail.fraud_signals ?? {}).length === 0 && (
                      <p className="text-dash-ink-faint text-xs">{t('fraudShieldPage.noSignalDetected')}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => confirmFraudLabel(detail.id, 'confirmed_real')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        detail.fraud_label === 'confirmed_real' ? 'bg-dash-success text-white' : 'bg-dash-success-soft text-dash-success hover:opacity-80'
                      }`}
                    >
                      <Check size={12} /> {t('fraudShieldPage.confirmReal')}
                    </button>
                    <button
                      onClick={() => confirmFraudLabel(detail.id, 'confirmed_fake')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        detail.fraud_label === 'confirmed_fake' ? 'bg-dash-danger text-white' : 'bg-dash-danger-soft text-dash-danger hover:opacity-80'
                      }`}
                    >
                      <X size={12} /> {t('fraudShieldPage.confirmFake')}
                    </button>
                  </div>
                </div>
              )}

              {(deliveryConnected || detail.tracking_number) && (
                <div className="px-6 py-4 border-b border-dash-border">
                  <p className="text-xs text-dash-ink-soft uppercase tracking-wider mb-2 dash-font-sans font-bold">{t('orders.delivery')}</p>
                  {detail.tracking_number ? (
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-dash-ink">{t('orders.parcelCreated', { provider: COURIERS[detail.delivery_provider as DeliveryProvider]?.label ?? detail.delivery_provider })}</p>
                        <p className="text-xs text-dash-ink-faint font-mono truncate">{detail.tracking_number}</p>
                      </div>
                      {detail.delivery_label_url && (
                        <a href={detail.delivery_label_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink transition-all flex-shrink-0">
                          {t('orders.label')}
                        </a>
                      )}
                    </div>
                  ) : (
                    <>
                      {rowShipError?.orderId === detail.id && (
                        <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg mb-2">{rowShipError.message}</div>
                      )}
                      <div className="space-y-1.5">
                        {[...connectedProviders].sort((a, b) => {
                          const preferred = detail.product?.preferred_delivery_provider
                          return (b === preferred ? 1 : 0) - (a === preferred ? 1 : 0)
                        }).map(p => (
                          <button
                            key={p}
                            onClick={() => shipOrderFromRow(detail.id, p)}
                            disabled={rowShippingId === detail.id}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                            style={{ background: COURIERS[p]?.color ?? '#999' }}
                          >
                            {rowShippingId === detail.id
                              ? <><Loader2 size={15} className="animate-spin" /> {t('orders.creatingParcel')}</>
                              : <><Truck size={15} /> {t('orders.createShipmentFor', { provider: COURIERS[p]?.label ?? p })}{p === detail.product?.preferred_delivery_provider ? t('orders.preferred') : ''}</>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              <div className="px-6 py-4 space-y-2.5 text-sm max-h-60 overflow-y-auto">
                {[
                  [t('orders.detailClient'), detail.customer_name],
                  [t('orders.detailPhone'), detail.customer_phone],
                  [t('orders.detailWilaya'), detail.wilaya],
                  [t('orders.detailCommune'), detail.commune],
                  [t('orders.detailProduct'), detail.product?.name ?? detail.landing_page?.title ?? '—'],
                  [t('orders.detailColor'), detail.color ?? '—'],
                  [t('orders.detailSize'), detail.size ?? '—'],
                  [t('orders.detailQuantity'), String(detail.quantity)],
                  [t('orders.detailDeliveryType'), detail.delivery_type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')],
                  [t('orders.detailDelivery'), `${Number(detail.delivery_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailTotal'), `${Number(detail.total_price).toLocaleString('fr-DZ')} DA`],
                  [t('orders.detailSource'), orderSourceLabel(detail.source, locale) ?? detail.source],
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
                  {t('orders.close')}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI fake-orders detector modal ───────────────────────── */}
      <AnimatePresence>
        {(aiState === 'scanning' || aiResults || aiError) && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={closeAiModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-dash-surface border border-dash-border rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dash-border sticky top-0 z-10 bg-dash-surface">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-dash-accent-soft text-dash-accent flex items-center justify-center">
                    <Bot size={18} />
                  </div>
                  <div>
                    <p className="text-dash-ink font-bold">{t('orders.aiDetect')}</p>
                    <p className="text-dash-ink-faint text-xs">{t('orders.aiScanResultTitle')}</p>
                  </div>
                </div>
                <button onClick={closeAiModal} className="text-dash-ink-faint hover:text-dash-ink transition-colors">
                  <X size={20} />
                </button>
              </div>

              {aiError && (
                <div className="px-6 py-3 bg-dash-danger-soft border-b border-dash-danger/20 text-dash-danger text-sm">
                  {aiError}
                </div>
              )}

              {aiState === 'scanning' && (
                <div className="px-6 py-10 space-y-4">
                  <div className="h-2.5 bg-dash-surface-2 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-dash-accent rounded-full"
                      initial={{ width: '0%' }}
                      animate={{ width: `${Math.min(aiProgress, 100)}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  <p className="text-center text-dash-ink-soft text-sm">
                    {t('orders.aiScanProgress', {
                      done: Math.min(selectedIds.length, Math.round((aiProgress / 100) * selectedIds.length)),
                      total: selectedIds.length,
                    })}
                  </p>
                </div>
              )}

              {aiResults && (
                <div className="px-6 py-5 space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => archiveOrders(aiResults.map(r => r.id), true)}
                      disabled={aiBusy}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all text-xs font-semibold disabled:opacity-50"
                    >
                      {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Archive size={13} />} {t('orders.aiScanArchiveSelected')}
                    </button>
                    <button
                      onClick={() => deleteOrders(aiResults.map(r => r.id))}
                      disabled={aiBusy}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-dash-danger-soft border border-dash-danger/20 text-dash-danger hover:bg-dash-danger/15 transition-all text-xs font-semibold disabled:opacity-50"
                    >
                      {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} {t('orders.aiScanDeleteSelected')}
                    </button>
                  </div>

                  <div className="space-y-3">
                    {aiResults.map(r => {
                      const order = orders.find(o => o.id === r.id)
                      return (
                        <div key={r.id} className="bg-dash-surface-2 rounded-xl p-4 space-y-2.5">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <p className="text-dash-ink text-sm font-semibold truncate">
                                {order?.customer_name ?? '—'} <span className="text-dash-ink-faint font-normal">· #{order?.order_number ?? r.id.slice(0, 8)}</span>
                              </p>
                              <p className="text-dash-ink-faint text-[11px] truncate">
                                {order?.product?.name ?? order?.landing_page?.title ?? ''} · {order?.wilaya ?? ''} · {order?.customer_phone ?? ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-dash-surface text-dash-ink-soft">
                                {t('orders.aiScanRiskScore')} {r.riskScore}
                              </span>
                              {r.cached && (
                                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-dash-surface text-dash-ink-faint" title={r.scannedAt}>
                                  {t('orders.aiScanCached')}
                                </span>
                              )}
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                r.verdict === 'fake' ? 'bg-dash-danger-soft text-dash-danger'
                                  : r.verdict === 'real' ? 'bg-dash-success-soft text-dash-success'
                                  : 'bg-dash-warning-soft text-dash-warning-dark'
                              }`}>
                                {r.verdict === 'fake' ? t('orders.aiScanVerdictFake')
                                  : r.verdict === 'real' ? t('orders.aiScanVerdictReal')
                                  : t('orders.aiScanVerdictSuspicious')}
                              </span>
                            </div>
                          </div>

                          {r.summary && <p className="text-dash-ink-soft text-xs">{r.summary}</p>}

                          {r.reasons.length > 0 && (
                            <ul className="space-y-1">
                              {r.reasons.map((reason, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-dash-ink-soft">
                                  <span className="w-1 h-1 rounded-full bg-dash-accent mt-1.5 flex-shrink-0" />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          )}

                          <div className="flex items-center gap-2 pt-1">
                            <button
                              onClick={() => archiveOrders([r.id], true)}
                              disabled={aiBusy}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-dash-surface border border-dash-border text-dash-ink-soft hover:text-dash-ink transition-all disabled:opacity-50"
                            >
                              <Archive size={12} /> {t('orders.aiScanArchive')}
                            </button>
                            <button
                              onClick={() => deleteOrders([r.id])}
                              disabled={aiBusy}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-dash-danger-soft text-dash-danger hover:bg-dash-danger/15 transition-all disabled:opacity-50"
                            >
                              <Trash2 size={12} /> {t('orders.aiScanDelete')}
                            </button>
                            <button
                              onClick={() => {}}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-dash-surface-2 text-dash-ink-soft hover:text-dash-ink transition-all"
                            >
                              {t('orders.aiScanLeave')}
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <button onClick={closeAiModal} className="w-full py-2.5 rounded-xl bg-dash-ink text-dash-surface font-semibold text-sm hover:opacity-90 transition-all">
                    {t('orders.aiScanDone')}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
