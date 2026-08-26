'use client'

import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Order, OrderEdit, OrderShipment, OrderStatus, StoreSettings } from '@/types/database'
import { ORDER_STATUS_DASH_COLORS, orderStatusLabel, orderSourceLabel } from '@/types/database'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import { buildWaLink, messageForStatus, orderMessageVars, orderUpdatedMessage, renderTemplate, toWaNumber } from '@/lib/whatsapp'
import { getStoreLocale } from '@/lib/i18n/store'
import { applyVariantDelta, type VariantStock } from '@/lib/variants'
import { COURIERS } from '@/lib/couriers'
import type { DeliveryProvider } from '@/types/database'
import { getFraudShieldStatus } from '@/lib/fraud-shield/status'
import type { AiScanResult } from '@/lib/fraud-shield/ai-scan'
import { type SortValue } from '@/lib/sort'
import { STOCK_DEDUCTED_STATUSES } from '@/lib/orders'
import { WILAYAS } from '@/lib/wilayas'
import SortSelect from '@/components/dashboard/ui/SortSelect'
import {
  ShoppingCart, X, Search, Eye,
  Clock, ClipboardCheck, Package, Truck, CheckCircle2, XCircle, RotateCcw,
  Loader2, MessageCircle, Trash2, ChevronDown, ShieldAlert, Check,
  Bot, Lock, Archive, ArchiveRestore, ToggleLeft, ToggleRight,
  Pencil, Plus, AlertTriangle,
} from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import StatusBadge from '@/components/dashboard/ui/StatusBadge'
import { rowHover } from '@/lib/dashboard-motion'

const STATUS_ICON: Record<OrderStatus, React.ElementType> = {
  pending: Clock, confirmed: ClipboardCheck, chez_livreur: Package,
  en_livraison: Truck, livree: CheckCircle2, annulee: XCircle, retournee: RotateCcw,
}

const STATUS_ORDER: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree', 'annulee', 'retournee']
const RISK_THRESHOLD = 60
const PAGE_SIZE = 50

// Order joined with its product name + preferred courier, used to personalize
// WhatsApp messages and to pre-select the ship button's provider.
type OrderWithProduct = Order & {
  product?: { name: string; preferred_delivery_provider: DeliveryProvider | null; images: string[] | null } | null
  landing_page?: { title: string; generated_images: string[] | null } | null
}

// ── Order editing (see api/orders/[id]/route.ts) ──────────────────────────
type EditItemDraft = { product_id: string; color: string | null; size: string | null; quantity: number }
type EditFormState = {
  customer_name: string
  customer_phone: string
  wilaya: string
  commune: string
  address: string
  delivery_type: 'home' | 'desk'
  delivery_price: number
  items: EditItemDraft[]
}
type StoreProductOption = { id: string; name: string; price: number; colors: string[]; sizes: string[] }

const EDIT_INPUT_CLASS = 'bg-dash-surface-2 border border-dash-border rounded-lg px-3 py-2 text-sm text-dash-ink outline-none focus:border-dash-accent/50 transition-all'

const EDIT_FIELD_LABELS: Record<string, string> = {
  customer_name: 'Client', customer_phone: 'Téléphone', wilaya: 'Wilaya', commune: 'Commune',
  address: 'Adresse', delivery_type: 'Livraison', delivery_price: 'Prix livraison',
  quantity: 'Quantité', total_price: 'Total', items: 'Produits',
}
const EDIT_MONEY_FIELDS = new Set(['delivery_price', 'total_price'])

function formatEditValue(field: string, v: unknown): string {
  if (field === 'items') return Array.isArray(v) ? v.join(', ') : String(v ?? '—')
  if (field === 'delivery_type') return v === 'desk' ? 'Stop-desk' : 'Domicile'
  if (EDIT_MONEY_FIELDS.has(field)) return `${Number(v).toLocaleString('fr-DZ')} DA`
  return String(v ?? '—')
}

// Human-readable one-liner for an order_edits row, e.g.
// "Quantité : 2 → 3 · Total : 4 000 DA → 5 000 DA"
function editSummary(edit: OrderEdit): string {
  return Object.entries(edit.changes)
    .map(([field, { from, to }]) => `${EDIT_FIELD_LABELS[field] ?? field} : ${formatEditValue(field, from)} → ${formatEditValue(field, to)}`)
    .join(' · ')
}

type OrdersFilterState = { view: 'active' | 'archived'; filter: 'all' | 'at_risk' | OrderStatus; search: string; sort: SortValue }
type OrdersPageResult = { rows: OrderWithProduct[]; nextPage: number | null }

// PostgREST's .or() filter string treats comma/parens as structural separators —
// wrapping the value in double quotes (with any embedded quote/backslash escaped)
// is its documented way to pass arbitrary user text safely inside one.
function escapeOrFilterValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

// Fetches one page of orders, fully filtered/sorted server-side — the table only
// ever holds what's actually rendered instead of the store's entire history.
async function fetchOrdersPage(storeId: string, { view, filter, search, sort }: OrdersFilterState, pageParam: number): Promise<OrdersPageResult> {
  const supabase = createClient()
  let q = supabase
    .from('orders')
    .select('*, product:products(name, preferred_delivery_provider, images), landing_page:landing_pages(title, generated_images), order_items(id, product_id, product_name, color, size, quantity, unit_price, subtotal)', { count: 'exact' })
    .eq('store_id', storeId)
    .eq('is_archived', view === 'archived')

  if (filter === 'at_risk') q = q.gte('fraud_risk_score', RISK_THRESHOLD)
  else if (filter !== 'all') q = q.eq('status', filter)

  const term = search.trim()
  if (term) {
    const esc = escapeOrFilterValue(term)
    q = q.or(`customer_name.ilike."%${esc}%",order_number.ilike."%${esc}%",wilaya.ilike."%${esc}%"`)
  }

  if (sort === 'date_asc') q = q.order('created_at', { ascending: true })
  else if (sort === 'name_asc') q = q.order('customer_name', { ascending: true })
  else if (sort === 'name_desc') q = q.order('customer_name', { ascending: false })
  else q = q.order('created_at', { ascending: false })

  const from = pageParam * PAGE_SIZE
  const { data, count } = await q.range(from, from + PAGE_SIZE - 1)
  const rows = (data ?? []) as OrderWithProduct[]
  const loadedSoFar = from + rows.length
  return { rows, nextPage: count !== null && loadedSoFar < count ? pageParam + 1 : null }
}

// Lightweight, column-pruned, unfiltered/unpaginated — only feeds the filter-tab
// badge counts, which must reflect the whole store regardless of what page/filter
// is currently loaded. No joins, no product/note/address columns.
async function fetchOrderCounts(storeId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('orders')
    .select('status, is_archived, fraud_risk_score')
    .eq('store_id', storeId)
  return data ?? []
}

// Edit log for the currently open order detail modal — same on-demand
// pattern as fetchOrderShipments below.
async function fetchOrderEdits(orderId: string): Promise<OrderEdit[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('order_edits')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  return (data ?? []) as OrderEdit[]
}

// Store's active product catalog, for the edit form's product picker. Fetched
// only once the merchant actually opens edit mode (not on every modal open).
async function fetchStoreProducts(storeId: string): Promise<StoreProductOption[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('products')
    .select('id, name, price, colors, sizes')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as StoreProductOption[]
}

// Full shipment history for the currently open order detail modal — fetched
// on demand (not joined into the main list query) since only one order's
// history is ever visible at a time.
async function fetchOrderShipments(orderId: string): Promise<OrderShipment[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('order_shipments')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  return (data ?? []) as OrderShipment[]
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
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortValue>('date_desc')
  const [detail, setDetail] = useState<OrderWithProduct | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [connectedProviders, setConnectedProviders] = useState<DeliveryProvider[]>([])
  // Shared "ship this order" state — used by both the row action and the
  // detail modal's shipping section, keyed by order id so they never fight.
  const [rowShippingId, setRowShippingId] = useState<string | null>(null)
  const [providerPickerId, setProviderPickerId] = useState<string | null>(null)
  const [rowShipError, setRowShipError] = useState<{ orderId: string; message: string } | null>(null)
  // The detail modal's courier picker stays collapsed behind a "Nouvelle
  // expédition" button once an order already has a shipment, so reshipping
  // is always a deliberate second click, never the default view.
  const [reshipPickerOpen, setReshipPickerOpen] = useState(false)
  const [deletingShipmentId, setDeletingShipmentId] = useState<string | null>(null)

  // Order editing (products/prices/customer info) — see api/orders/[id]/route.ts.
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState<EditFormState | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')
  const [showEditHistory, setShowEditHistory] = useState(false)

  const [selectedIds, setSelectedIds] = useState<string[]>([])

  // Active / archived view + AI fake-orders detector (paid Fraud Shield feature).
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [canScan, setCanScan] = useState(false)
  const [aiState, setAiState] = useState<'idle' | 'scanning' | 'done'>('idle')
  const [aiResults, setAiResults] = useState<AiScanResult[] | null>(null)
  const [aiError, setAiError] = useState('')
  const [aiProgress, setAiProgress] = useState(0)
  const [aiBusy, setAiBusy] = useState(false)


  // Search re-queries the server (it's no longer a client-side filter over an
  // already-downloaded list), so it's debounced to avoid firing on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setSelectedIds([]) }, 300)
    return () => clearTimeout(id)
  }, [searchInput])

  const filterState: OrdersFilterState = { view, filter, search, sort }
  const queryKey = ['orders', storeId, view, filter, search, sort] as const
  const {
    data, isLoading: loading, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchOrdersPage(storeId!, filterState, pageParam),
    initialPageParam: 0,
    getNextPageParam: last => last.nextPage,
    enabled: !!storeId,
  })
  const orders = useMemo(() => data?.pages.flatMap(p => p.rows) ?? [], [data])

  const { data: shipments = [] } = useQuery({
    queryKey: ['orderShipments', detail?.id],
    queryFn: () => fetchOrderShipments(detail!.id),
    enabled: !!detail,
  })

  const { data: orderEdits = [] } = useQuery({
    queryKey: ['orderEdits', detail?.id],
    queryFn: () => fetchOrderEdits(detail!.id),
    enabled: !!detail,
  })

  // Only fetched once edit mode is actually entered — most modal opens never touch it.
  const { data: storeProducts = [] } = useQuery({
    queryKey: ['storeProductsForEdit', storeId],
    queryFn: () => fetchStoreProducts(storeId!),
    enabled: editing && !!storeId,
  })

  const { data: counts = [] } = useQuery({
    queryKey: ['orderCounts', storeId],
    queryFn: () => fetchOrderCounts(storeId!),
    enabled: !!storeId,
  })

  // Whether an order (after a local patch) still belongs in the currently
  // loaded view/filter — used to drop rows that no longer match instead of
  // leaving stale entries in the list (e.g. archiving a row while filtered
  // to "active").
  const matchesCurrentView = (o: { status: OrderStatus; is_archived: boolean; fraud_risk_score: number | null }) => {
    const matchArchived = view === 'archived' ? o.is_archived : !o.is_archived
    const matchFilter = filter === 'all' || (filter === 'at_risk' ? (o.fraud_risk_score ?? 0) >= RISK_THRESHOLD : o.status === filter)
    return matchArchived && matchFilter
  }

  const patchOrders = (ids: string[], patch: Partial<OrderWithProduct>) => {
    queryClient.setQueryData<InfiniteData<OrdersPageResult>>(queryKey, old => old && {
      ...old,
      pages: old.pages.map(page => ({
        ...page,
        rows: page.rows
          .map(o => ids.includes(o.id) ? { ...o, ...patch } : o)
          .filter(matchesCurrentView),
      })),
    })
  }

  const removeOrdersFromList = (ids: string[]) => {
    queryClient.setQueryData<InfiniteData<OrdersPageResult>>(queryKey, old => old && {
      ...old,
      pages: old.pages.map(page => ({ ...page, rows: page.rows.filter(o => !ids.includes(o.id)) })),
    })
  }

  const refreshCounts = () => queryClient.invalidateQueries({ queryKey: ['orderCounts', storeId] })

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
          setConnectedProviders((d.connections ?? []).map((c: { provider: DeliveryProvider }) => c.provider))
        })
        .catch(() => {})
    })
  }, [router])

  // Opens the detail modal for an order, always starting with the reship
  // picker collapsed (a stale "open" state from a previously viewed order
  // would otherwise leak through).
  const openDetail = (order: OrderWithProduct) => {
    setDetail(order); setReshipPickerOpen(false)
    setEditing(false); setEditForm(null); setEditError(''); setShowEditHistory(false)
  }

  const sendWhatsApp = (order: OrderWithProduct, status: OrderStatus) => {
    const locale = getStoreLocale({ settings: storeSettings })
    const template = messageForStatus(status, storeSettings?.orderMessages, locale)
    if (!template) return
    const vars = orderMessageVars(order, { storeName, productName: order.product?.name ?? null }, locale)
    const link = buildWaLink(order.customer_phone, renderTemplate(template, vars))
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  // Ship straight from the list row (no need to open the detail modal). If the
  // store has more than one courier connected, `provider` picks which one —
  // the caller opens a small picker first; with exactly one connection there's
  // nothing to choose, so the row button ships immediately.
  // `reship: true` creates an ADDITIONAL parcel for an order that already has
  // one (see the detail modal's "Nouvelle expédition" action) — the API
  // otherwise refuses to double-ship an order to guard against accidental
  // double-clicks.
  const shipOrderFromRow = async (orderId: string, provider?: DeliveryProvider, reship = false) => {
    setRowShippingId(orderId); setProviderPickerId(null); setRowShipError(null)
    try {
      const res = await fetch('/api/integrations/delivery/ship', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId, provider, reship }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setRowShipError({ orderId, message: d?.error ?? t('orders.creationFailed') }); return }
      const patch = { tracking_number: d.tracking ?? null, delivery_provider: d.provider ?? provider ?? 'yalidine', delivery_label_url: d.labelUrl ?? null }
      patchOrders([orderId], patch)
      setDetail(dd => (dd && dd.id === orderId ? { ...dd, ...patch } : dd))
      queryClient.invalidateQueries({ queryKey: ['orderShipments', orderId] })
      if (storeSettings?.autoPrintLabel && d.labelUrl) {
        window.open(d.labelUrl, '_blank', 'noopener,noreferrer')
      }
    } finally { setRowShippingId(null) }
  }

  // Cancels a parcel at the courier and drops it from the order's history.
  // If the courier refuses (already collected, or unreachable) the merchant is
  // asked whether to remove only our record — the parcel would still exist on
  // the courier's side and has to be cancelled in their dashboard.
  const deleteShipment = async (orderId: string, shipmentId: string) => {
    if (!window.confirm(t('orders.confirmDeleteShipment'))) return
    setDeletingShipmentId(shipmentId); setRowShipError(null)
    try {
      const send = (force: boolean) => fetch('/api/integrations/delivery/shipment', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipmentId, force }),
      })

      let res = await send(false)
      let d = await res.json().catch(() => null)

      if (res.status === 409 && d?.courierRefused) {
        if (!window.confirm(t('orders.shipmentCourierRefused', { error: d.error ?? '' }))) return
        res = await send(true)
        d = await res.json().catch(() => null)
      }

      if (!res.ok) { setRowShipError({ orderId, message: d?.error ?? t('orders.deleteFailedGeneric') }); return }

      const patch = {
        tracking_number: d.latest?.tracking ?? null,
        delivery_provider: d.latest?.provider ?? null,
        delivery_label_url: d.latest?.labelUrl ?? null,
      }
      patchOrders([orderId], patch)
      setDetail(dd => (dd && dd.id === orderId ? { ...dd, ...patch } : dd))
      queryClient.invalidateQueries({ queryKey: ['orderShipments', orderId] })
      if (d.warning) setRowShipError({ orderId, message: d.warning })
    } finally { setDeletingShipmentId(null) }
  }

  const updateStatus = async (id: string, newStatus: OrderStatus) => {
    if (!storeId) return
    setUpdating(id)
    const supabase = createClient()

    const order = orders.find(o => o.id === id)
    const prevStatus = order?.status

    await supabase.from('orders').update({ status: newStatus }).eq('id', id).eq('store_id', storeId)

    const wasDeducted = prevStatus ? STOCK_DEDUCTED_STATUSES.has(prevStatus) : false
    const isDeducted = STOCK_DEDUCTED_STATUSES.has(newStatus)
    const delta = !wasDeducted && isDeducted ? -order!.quantity
      : wasDeducted && !isDeducted ? order!.quantity
      : 0

    // Adjust the general product stock AND the specific colour/size variant
    // pools by the same signed delta. A "Bleu / S" order only touches the Bleu
    // pool and the S pool (plus the general total), never other variants.
    // Takes color/size/quantityDelta explicitly (rather than reading them off
    // the outer `order`/`delta` closure) so it can be called once per cart line
    // item below, each with its own variant + quantity.
    const adjustProductStock = async (productId: string, color: string | null, size: string | null, quantityDelta: number) => {
      const { data: product } = await supabase
        .from('products').select('stock, variant_stock').eq('id', productId).single()
      if (!product) return
      const nextVariant = applyVariantDelta(
        product.variant_stock as VariantStock | null,
        color,
        size,
        quantityDelta,
      )
      await supabase.from('products').update({
        stock: Math.max(0, product.stock + quantityDelta),
        variant_stock: nextVariant,
      }).eq('id', productId).eq('store_id', storeId)
    }

    if (order && delta !== 0) {
      if (order.order_items && order.order_items.length > 0) {
        // Cart order: each line item has its own product/variant/quantity, so the
        // single aggregate `delta` can't be applied as-is — only its SIGN (which
        // direction this status transition moved: deduct vs restock) is uniform
        // across items; each item supplies its own quantity as the magnitude.
        // Items whose product was deleted since the order was placed
        // (order_items.product_id is ON DELETE SET NULL) have nothing to adjust.
        const sign = delta > 0 ? 1 : -1
        for (const item of order.order_items) {
          if (!item.product_id) continue
          await adjustProductStock(item.product_id, item.color ?? null, item.size ?? null, sign * item.quantity)
        }
      } else if (order.product_id) {
        await adjustProductStock(order.product_id, order.color ?? null, order.size ?? null, delta)
      } else if (order.landing_page_id) {
        const { data: lp } = await supabase
          .from('landing_pages').select('stock, product_id').eq('id', order.landing_page_id).single()
        if (lp?.product_id) {
          await adjustProductStock(lp.product_id, order.color ?? null, order.size ?? null, delta)
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

    patchOrders([id], { status: newStatus })
    setDetail(d => d?.id === id ? { ...d, status: newStatus } : d)
    setUpdating(null)
    refreshCounts()
  }

  // Tab badge counts come from the lightweight, unpaginated counts query (not
  // from `orders`, which only holds the currently loaded page(s)) so they always
  // reflect the whole store regardless of how many pages have been fetched.
  const viewCounts = counts.filter(o => (view === 'archived' ? o.is_archived : !o.is_archived))
  const archivedCount = counts.filter(o => o.is_archived).length
  const countOf = (s: string) => viewCounts.filter(o => o.status === s).length
  const riskyCount = viewCounts.filter(o => (o.fraud_risk_score ?? 0) >= RISK_THRESHOLD).length

  // ── AI fake-orders detector ──────────────────────────────────
  const startAiScan = async (refresh = false) => {
    if (selectedIds.length === 0) { alert(t('orders.aiDetectNoSelection')); return }
    if (!canScan) { alert(t('orders.aiDetectLocked')); return }
    setAiState('scanning'); setAiError(''); setAiResults(null); setAiProgress(0)
    const total = selectedIds.length
    try {
      const res = await fetch('/api/orders/ai-scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: selectedIds, refresh }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        throw new Error(d?.error ?? t('orders.aiScanError'))
      }
      if (!res.body) throw new Error(t('orders.aiScanError'))
      // The route streams real progress as each Claude batch completes, so the
      // bar reflects the true analysed count instead of stalling on a fake 90%.
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let scanResults: AiScanResult[] | null = null
      let scanErrorMessage = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const msg = JSON.parse(trimmed) as { type: string; done?: number; results?: AiScanResult[]; message?: string }
          if (msg.type === 'progress' && typeof msg.done === 'number') {
            setAiProgress(Math.min(100, Math.round((msg.done / total) * 100)))
          } else if (msg.type === 'result' && Array.isArray(msg.results)) {
            scanResults = msg.results
          } else if (msg.type === 'error' && msg.message) {
            scanErrorMessage = msg.message
          }
        }
      }
      if (scanErrorMessage) throw new Error(scanErrorMessage)
      if (!scanResults) throw new Error(t('orders.aiScanError'))
      setAiResults(scanResults)
      setAiState('done')
    } catch (err) {
      setAiError(err instanceof Error ? err.message : t('orders.aiScanError'))
      setAiState('idle')
    } finally {
      setAiProgress(100)
    }
  }

  const closeAiModal = () => {
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
      patchOrders(ids, { is_archived: archived })
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
      refreshCounts()
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
      removeOrdersFromList(ids)
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)))
      refreshCounts()
    } catch {
      alert(t('orders.deleteFailedGeneric'))
    } finally { setAiBusy(false) }
  }



  const confirmFraudLabel = async (orderId: string, label: 'confirmed_real' | 'confirmed_fake') => {
    if (!storeId) return
    const supabase = createClient()
    await supabase.from('orders').update({ fraud_label: label }).eq('id', orderId).eq('store_id', storeId)
    patchOrders([orderId], { fraud_label: label })
    setDetail(d => d && d.id === orderId ? { ...d, fraud_label: label } : d)
  }

  // Per-order override — a normally-light product ordered in bulk (several
  // units bagged into one parcel) can be flagged over 5kg for THIS order
  // without touching the product itself.
  const toggleOrderHeavy = async (orderId: string, isHeavy: boolean) => {
    if (!storeId) return
    const supabase = createClient()
    await supabase.from('orders').update({ is_heavy: isHeavy }).eq('id', orderId).eq('store_id', storeId)
    patchOrders([orderId], { is_heavy: isHeavy })
    setDetail(d => d && d.id === orderId ? { ...d, is_heavy: isHeavy } : d)
  }

  // Some remote communes only support one of home/desk delivery at a given
  // courier — shipping detects the mismatch and tells the merchant which
  // type to switch to (see deliveryTypeMismatch in the ship route). This
  // lets them act on that error and re-ship without touching the customer's
  // original checkout answer for other orders.
  const toggleOrderDeliveryType = async (orderId: string, deliveryType: 'home' | 'desk') => {
    if (!storeId) return
    const supabase = createClient()
    await supabase.from('orders').update({ delivery_type: deliveryType }).eq('id', orderId).eq('store_id', storeId)
    patchOrders([orderId], { delivery_type: deliveryType })
    setDetail(d => d && d.id === orderId ? { ...d, delivery_type: deliveryType } : d)
  }

  // ── Order editing ──────────────────────────────────────────────────────
  const startEdit = () => {
    if (!detail) return
    const items: EditItemDraft[] = detail.order_items && detail.order_items.length > 0
      ? detail.order_items.map(i => ({ product_id: i.product_id ?? '', color: i.color, size: i.size, quantity: i.quantity }))
      : detail.product_id
        ? [{ product_id: detail.product_id, color: detail.color, size: detail.size, quantity: detail.quantity }]
        : []
    setEditForm({
      customer_name: detail.customer_name,
      customer_phone: detail.customer_phone,
      wilaya: detail.wilaya,
      commune: detail.commune,
      address: detail.address ?? '',
      delivery_type: detail.delivery_type,
      delivery_price: detail.delivery_price,
      items: items.length > 0 ? items : [{ product_id: '', color: null, size: null, quantity: 1 }],
    })
    setEditError('')
    setEditing(true)
  }

  const cancelEdit = () => { setEditing(false); setEditForm(null); setEditError('') }

  const updateEditItem = (idx: number, patch: Partial<EditItemDraft>) => {
    setEditForm(f => f && { ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })
  }
  const addEditItem = () => setEditForm(f => f && { ...f, items: [...f.items, { product_id: '', color: null, size: null, quantity: 1 }] })
  const removeEditItem = (idx: number) => setEditForm(f => f && { ...f, items: f.items.filter((_, i) => i !== idx) })

  // Client-side estimate only — ignores active offers, which the server
  // recomputes authoritatively via update_order(). Good enough to sanity-check
  // the edit before saving.
  const estimatedTotal = useMemo(() => {
    if (!editForm) return 0
    const itemsTotal = editForm.items.reduce((sum, it) => {
      const product = storeProducts.find(p => p.id === it.product_id)
      return sum + (product ? product.price * it.quantity : 0)
    }, 0)
    return itemsTotal + (Number(editForm.delivery_price) || 0)
  }, [editForm, storeProducts])

  const saveEdit = async () => {
    if (!editForm || !detail) return
    if (editForm.items.length === 0 || editForm.items.some(it => !it.product_id)) {
      setEditError(t('orders.editSelectProduct'))
      return
    }
    setSavingEdit(true); setEditError('')
    try {
      const res = await fetch(`/api/orders/${detail.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: editForm.customer_name,
          customer_phone: editForm.customer_phone,
          wilaya: editForm.wilaya,
          commune: editForm.commune,
          address: editForm.address || null,
          delivery_type: editForm.delivery_type,
          delivery_price: editForm.delivery_price,
          items: editForm.items,
        }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok) { setEditError(d?.error ?? t('orders.editFailed')); return }
      const updatedOrder = d.order as OrderWithProduct
      patchOrders([updatedOrder.id], updatedOrder)
      setDetail(updatedOrder)
      setEditing(false); setEditForm(null)
      queryClient.invalidateQueries({ queryKey: ['orderEdits', updatedOrder.id] })
      refreshCounts()
    } catch {
      setEditError(t('orders.editFailed'))
    } finally {
      setSavingEdit(false)
    }
  }

  const sendUpdatedConfirmation = (order: OrderWithProduct) => {
    const localeForMsg = getStoreLocale({ settings: storeSettings })
    const productName = order.order_items && order.order_items.length > 0
      ? order.order_items.map(i => `${i.product_name} x${i.quantity}`).join(', ')
      : order.product?.name
    const vars = orderMessageVars(order, { storeName, productName }, localeForMsg)
    const link = buildWaLink(order.customer_phone, orderUpdatedMessage(vars, localeForMsg))
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  // Selection is cleared directly in the filter/search handlers below (not
  // via a useEffect keyed on [filter, search]) — react-hooks/set-state-in-effect
  // flags that pattern, and clearing at the point of change is simpler anyway.
  const changeFilter = (f: 'all' | 'at_risk' | OrderStatus) => { setFilter(f); setSelectedIds([]) }
  const changeView = (v: 'active' | 'archived') => { setView(v); setSelectedIds([]) }
  const changeSearch = (v: string) => { setSearchInput(v) }

  const deleteSelected = async () => {
    await deleteOrders(selectedIds)
  }

  // Selects every currently loaded row — if more pages exist below, "select
  // all" only covers what's been paged in so far, not the entire filtered set.
  const toggleAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) setSelectedIds(orders.map(o => o.id))
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
              value={searchInput}
              onChange={e => changeSearch(e.target.value)}
              placeholder={t('orders.searchPlaceholder')}
              className="w-full pl-9 pr-4 py-2.5 rounded-[11px] bg-dash-surface border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm dash-font-sans"
            />
          </div>
          <SortSelect value={sort} onChange={setSort} />
          <button
            onClick={() => startAiScan()}
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
            {t('orders.filterAll')} <span className="opacity-70">{viewCounts.length}</span>
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
                onClick={() => startAiScan()}
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
      ) : orders.length === 0 ? (
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
                      checked={orders.length > 0 && selectedIds.length === orders.length}
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
                {orders.map((order, i) => (
                  <motion.tr
                    key={order.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    {...rowHover}
                    className="border-t border-dash-border cursor-pointer"
                    onClick={() => openDetail(order)}
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
                      {order.order_items && order.order_items.length > 0 ? (
                        <>
                          <p className="truncate text-xs text-dash-ink font-semibold mb-0.5">
                            {t('orders.multiItemSummary', { count: order.order_items.length })}
                          </p>
                          <p className="truncate text-xs text-dash-ink-faint" title={order.order_items.map(i => i.product_name).join(', ')}>
                            {order.order_items.map(i => i.product_name).join(', ')}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="truncate text-xs text-dash-ink font-semibold mb-0.5" title={order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}>
                            {order.product?.name ?? order.landing_page?.title ?? t('orders.unknownProduct')}
                          </p>
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs">{order.color && order.color !== '—' ? order.color : (order.size && order.size !== '—' ? order.size : t('orders.standardVariant'))}</p>
                            <p className="text-dash-ink-faint text-xs">×{order.quantity}</p>
                          </div>
                        </>
                      )}
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
                          onClick={() => openDetail(order)}
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
          {hasNextPage && (
            <div className="flex justify-center py-4 border-t border-dash-border">
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-2 px-4 py-2 rounded-[11px] text-sm font-semibold text-dash-ink-soft hover:text-dash-ink bg-dash-surface-2 hover:bg-dash-border/40 transition-all disabled:opacity-60"
              >
                {isFetchingNextPage ? <Loader2 size={14} className="animate-spin" /> : null}
                {t('orders.loadMore')}
              </button>
            </div>
          )}
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
              className="bg-dash-surface border border-dash-border rounded-2xl w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-dash-border sticky top-0 z-10 bg-dash-surface">
                <div>
                  <p className="text-dash-ink font-bold text-lg">{detail.order_number}</p>
                  <p className="text-dash-ink-faint text-xs mt-0.5">
                    {new Date(detail.created_at).toLocaleString('fr-DZ', { dateStyle: 'long', timeStyle: 'short' })}
                  </p>
                </div>
                <button onClick={() => setDetail(null)} className="text-dash-ink-faint hover:text-dash-ink transition-colors">
                  <X size={20} />
                </button>
              </div>

              {detail.tracking_number && (
                <div className="mx-6 mt-4 flex items-start gap-2 bg-dash-warning-soft border border-dash-warning-dark/20 text-dash-warning-dark text-xs px-3 py-2.5 rounded-lg">
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                  <span>{t('orders.shippedEditWarning')}</span>
                </div>
              )}

              {(() => {
                const photo = detail.product?.images?.[0] ?? detail.landing_page?.generated_images?.[0] ?? null
                return photo ? (
                  <div className="px-6 pt-5">
                    <img
                      src={photo}
                      alt={detail.product?.name ?? detail.landing_page?.title ?? t('orders.detailProduct')}
                      className="w-full h-64 object-contain bg-dash-surface-2 rounded-xl border border-dash-border"
                    />
                  </div>
                ) : null
              })()}

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

              {(connectedProviders.length > 0 || shipments.length > 0) && (
                <div className="px-6 py-4 border-b border-dash-border space-y-3">
                  <p className="text-xs text-dash-ink-soft uppercase tracking-wider dash-font-sans font-bold">{t('orders.delivery')}</p>

                  <div>
                    <button
                      type="button"
                      onClick={() => toggleOrderHeavy(detail.id, !detail.is_heavy)}
                      className={`flex items-center gap-2 text-sm font-semibold transition-colors ${
                        detail.is_heavy ? 'text-dash-accent' : 'text-dash-ink-faint'
                      }`}
                    >
                      {detail.is_heavy ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                      {t('orders.heavyPackageLabel')}
                    </button>
                    <p className="text-xs text-dash-ink-faint mt-1.5">{t('orders.heavyPackageHint')}</p>
                  </div>

                  <div>
                    <p className="text-xs text-dash-ink-faint mb-1.5">{t('orders.deliveryTypeToggleHint')}</p>
                    <div className="inline-flex rounded-lg overflow-hidden border border-dash-border">
                      {(['home', 'desk'] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleOrderDeliveryType(detail.id, type)}
                          className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                            detail.delivery_type === type
                              ? 'bg-dash-accent text-white'
                              : 'bg-dash-surface text-dash-ink-faint hover:text-dash-ink'
                          }`}
                        >
                          {type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {shipments.length > 0 && (
                    <div className="space-y-2">
                      {shipments.map(s => (
                        <div key={s.id} className="flex items-center justify-between gap-3 bg-dash-surface-2 rounded-xl px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="text-sm text-dash-ink">{t('orders.parcelCreated', { provider: COURIERS[s.provider]?.label ?? s.provider })}</p>
                            <p className="text-xs text-dash-ink-faint font-mono truncate">{s.tracking_number ?? '—'}</p>
                            <p className="text-[10px] text-dash-ink-faint mt-0.5">
                              {new Date(s.created_at).toLocaleString('fr-DZ', { dateStyle: 'medium', timeStyle: 'short' })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {s.label_url && (
                              <a href={s.label_url} target="_blank" rel="noopener noreferrer"
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-surface text-dash-ink-soft hover:text-dash-ink transition-all">
                                {t('orders.label')}
                              </a>
                            )}
                            <button
                              onClick={() => deleteShipment(detail.id, s.id)}
                              disabled={deletingShipmentId === s.id}
                              title={t('orders.deleteShipment')}
                              className="p-1.5 rounded-lg text-dash-ink-faint hover:text-dash-danger hover:bg-dash-danger-soft transition-colors disabled:opacity-50"
                            >
                              {deletingShipmentId === s.id
                                ? <Loader2 size={14} className="animate-spin" />
                                : <Trash2 size={14} />}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {rowShipError?.orderId === detail.id && (
                    <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{rowShipError.message}</div>
                  )}

                  {connectedProviders.length > 0 && (
                    shipments.length > 0 && !reshipPickerOpen ? (
                      <button
                        onClick={() => setReshipPickerOpen(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint transition-all text-sm font-semibold"
                      >
                        <Truck size={15} /> {t('orders.newShipment')}
                      </button>
                    ) : (
                      <div className="space-y-1.5">
                        {[...connectedProviders].sort((a, b) => {
                          const preferred = detail.product?.preferred_delivery_provider
                          return (b === preferred ? 1 : 0) - (a === preferred ? 1 : 0)
                        }).map(p => (
                          <button
                            key={p}
                            onClick={() => shipOrderFromRow(detail.id, p, shipments.length > 0)}
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
                    )
                  )}
                </div>
              )}

              <div className="px-6 py-4 space-y-3 text-sm">
                {!editing && (
                  <div className="flex items-center justify-end">
                    <button onClick={startEdit} className="flex items-center gap-1.5 text-xs font-semibold text-dash-accent hover:text-dash-accent-dark transition-colors">
                      <Pencil size={13} /> {t('orders.editOrder')}
                    </button>
                  </div>
                )}

                {!editing ? (
                  <div className="space-y-2.5 max-h-60 overflow-y-auto">
                    {detail.order_items && detail.order_items.length > 0 && (
                      <div className="space-y-2 pb-2.5 border-b border-dash-border">
                        <p className="text-xs text-dash-ink-soft uppercase tracking-wider dash-font-sans font-bold">{t('orders.detailItems')}</p>
                        {detail.order_items.map(item => (
                          <div key={item.id} className="flex justify-between items-start gap-3">
                            <div className="min-w-0">
                              <p className="text-dash-ink font-semibold truncate text-xs">{item.product_name}</p>
                              <p className="text-dash-ink-faint truncate text-xs">
                                {[item.color, item.size].filter(v => v && v !== '—').join(' / ') || t('orders.standardVariant')} × {item.quantity}
                              </p>
                            </div>
                            <span className="text-dash-ink font-semibold flex-shrink-0 text-xs">
                              {Number(item.subtotal).toLocaleString('fr-DZ')} DA
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {[
                      [t('orders.detailClient'), detail.customer_name],
                      [t('orders.detailPhone'), detail.customer_phone],
                      [t('orders.detailWilaya'), detail.wilaya],
                      [t('orders.detailCommune'), detail.commune],
                      ...(detail.order_items && detail.order_items.length > 0 ? [] : [
                        [t('orders.detailProduct'), detail.product?.name ?? detail.landing_page?.title ?? '—'],
                        [t('orders.detailColor'), detail.color ?? '—'],
                        [t('orders.detailSize'), detail.size ?? '—'],
                      ]),
                      [t('orders.detailQuantity'), String(detail.quantity)],
                      // Editable above (with the courier-availability toggle) once a
                      // courier is connected — shown as plain text only until then.
                      ...(connectedProviders.length > 0 || shipments.length > 0 ? [] : [
                        [t('orders.detailDeliveryType'), detail.delivery_type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')],
                      ]),
                      // Multi-item orders (order_items present) store unit_price as a
                      // 0 sentinel on the order row itself — the real per-line prices
                      // live in order_items, so the products subtotal has to be summed
                      // from there instead of unit_price × quantity.
                      [t('orders.detailSubtotal'), `${Number(
                        detail.order_items && detail.order_items.length > 0
                          ? detail.order_items.reduce((sum, item) => sum + Number(item.subtotal), 0)
                          : detail.unit_price * detail.quantity
                      ).toLocaleString('fr-DZ')} DA`],
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
                ) : editForm && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2.5">
                      <input value={editForm.customer_name} onChange={e => setEditForm(f => f && { ...f, customer_name: e.target.value })}
                        placeholder={t('orders.detailClient')} className={EDIT_INPUT_CLASS} />
                      <input value={editForm.customer_phone} onChange={e => setEditForm(f => f && { ...f, customer_phone: e.target.value })}
                        placeholder={t('orders.detailPhone')} className={EDIT_INPUT_CLASS} />
                      <select value={editForm.wilaya} onChange={e => setEditForm(f => f && { ...f, wilaya: e.target.value })} className={EDIT_INPUT_CLASS}>
                        {WILAYAS.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                      <input value={editForm.commune} onChange={e => setEditForm(f => f && { ...f, commune: e.target.value })}
                        placeholder={t('orders.detailCommune')} className={EDIT_INPUT_CLASS} />
                      <input value={editForm.address} onChange={e => setEditForm(f => f && { ...f, address: e.target.value })}
                        placeholder={t('orders.editAddress')} className={`${EDIT_INPUT_CLASS} col-span-2`} />
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="inline-flex rounded-lg overflow-hidden border border-dash-border">
                        {(['home', 'desk'] as const).map(type => (
                          <button key={type} type="button"
                            onClick={() => setEditForm(f => f && { ...f, delivery_type: type })}
                            className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                              editForm.delivery_type === type ? 'bg-dash-accent text-white' : 'bg-dash-surface text-dash-ink-faint hover:text-dash-ink'
                            }`}
                          >
                            {type === 'desk' ? t('orders.deliveryTypeDesk') : t('orders.deliveryTypeHome')}
                          </button>
                        ))}
                      </div>
                      <input type="number" min={0} max={5000} value={editForm.delivery_price}
                        onChange={e => setEditForm(f => f && { ...f, delivery_price: Number(e.target.value) })}
                        className={`${EDIT_INPUT_CLASS} w-28`} placeholder={t('orders.detailDelivery')} />
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs text-dash-ink-soft uppercase tracking-wider dash-font-sans font-bold">{t('orders.detailItems')}</p>
                      {editForm.items.map((item, idx) => {
                        const product = storeProducts.find(p => p.id === item.product_id)
                        return (
                          <div key={idx} className="flex items-center gap-1.5 bg-dash-surface-2 rounded-xl p-2">
                            <select value={item.product_id}
                              onChange={e => updateEditItem(idx, { product_id: e.target.value, color: null, size: null })}
                              className="flex-1 min-w-0 bg-dash-surface border border-dash-border rounded-lg px-2 py-1.5 text-xs text-dash-ink outline-none"
                            >
                              <option value="">{t('orders.editSelectProduct')}</option>
                              {storeProducts.map(p => (
                                <option key={p.id} value={p.id}>{p.name} — {p.price.toLocaleString('fr-DZ')} DA</option>
                              ))}
                            </select>
                            {product && product.colors.length > 0 && (
                              <select value={item.color ?? ''} onChange={e => updateEditItem(idx, { color: e.target.value || null })}
                                className="bg-dash-surface border border-dash-border rounded-lg px-2 py-1.5 text-xs text-dash-ink outline-none">
                                <option value="">{t('orders.detailColor')}</option>
                                {product.colors.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            )}
                            {product && product.sizes.length > 0 && (
                              <select value={item.size ?? ''} onChange={e => updateEditItem(idx, { size: e.target.value || null })}
                                className="bg-dash-surface border border-dash-border rounded-lg px-2 py-1.5 text-xs text-dash-ink outline-none">
                                <option value="">{t('orders.detailSize')}</option>
                                {product.sizes.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            )}
                            <input type="number" min={1} max={100} value={item.quantity}
                              onChange={e => updateEditItem(idx, { quantity: Number(e.target.value) || 1 })}
                              className="w-14 bg-dash-surface border border-dash-border rounded-lg px-2 py-1.5 text-xs text-dash-ink outline-none" />
                            <button onClick={() => removeEditItem(idx)} disabled={editForm.items.length <= 1}
                              className="p-1.5 text-dash-ink-faint hover:text-dash-danger disabled:opacity-30 transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        )
                      })}
                      <button onClick={addEditItem} className="flex items-center gap-1.5 text-xs font-semibold text-dash-accent hover:text-dash-accent-dark transition-colors">
                        <Plus size={13} /> {t('orders.addProduct')}
                      </button>
                    </div>

                    <div className="flex justify-between items-center border-t border-dash-border pt-2.5">
                      <span className="text-dash-ink-soft text-xs">{t('orders.estimatedTotal')}</span>
                      <span className="text-dash-ink font-bold">{estimatedTotal.toLocaleString('fr-DZ')} DA</span>
                    </div>

                    {editError && (
                      <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{editError}</div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={cancelEdit} disabled={savingEdit}
                        className="flex-1 py-2.5 rounded-xl border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint transition-all text-sm disabled:opacity-50">
                        {t('orders.cancelEdit')}
                      </button>
                      <button onClick={saveEdit} disabled={savingEdit}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-dash-accent text-white font-semibold text-sm hover:bg-dash-accent-dark transition-all disabled:opacity-50">
                        {savingEdit && <Loader2 size={14} className="animate-spin" />} {t('orders.saveEdit')}
                      </button>
                    </div>
                  </div>
                )}

                {!editing && orderEdits.length > 0 && (
                  <div className="pt-1 space-y-2 border-t border-dash-border">
                    <button onClick={() => setShowEditHistory(v => !v)}
                      className="flex items-center gap-1 text-xs text-dash-ink-faint hover:text-dash-ink transition-colors pt-2">
                      {t('orders.editHistory', { count: orderEdits.length })}
                      <ChevronDown size={12} className={`transition-transform ${showEditHistory ? 'rotate-180' : ''}`} />
                    </button>
                    {showEditHistory && (
                      <div className="space-y-1.5 bg-dash-surface-2 rounded-xl p-3 max-h-32 overflow-y-auto">
                        {orderEdits.map(e => (
                          <p key={e.id} className="text-xs text-dash-ink-soft">
                            <span className="text-dash-ink-faint">
                              {new Date(e.created_at).toLocaleString('fr-DZ', { dateStyle: 'short', timeStyle: 'short' })} —{' '}
                            </span>
                            {editSummary(e)}
                          </p>
                        ))}
                      </div>
                    )}
                    <button
                      onClick={() => sendUpdatedConfirmation(detail)}
                      disabled={!detailWa}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-white transition-all hover:scale-[1.03] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                      style={{ background: detailWa ? '#25D366' : '#9CA3AF' }}
                    >
                      <MessageCircle size={12} /> {t('orders.sendUpdatedConfirmation')}
                    </button>
                  </div>
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
                    <button
                      onClick={() => startAiScan(true)}
                      disabled={aiBusy}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink-soft hover:text-dash-ink hover:border-dash-ink-faint/40 transition-all text-xs font-semibold disabled:opacity-50"
                    >
                      {aiBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} {t('orders.aiScanRefresh')}
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

