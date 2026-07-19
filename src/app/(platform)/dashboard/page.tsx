'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store, Order, OrderStatus } from '@/types/database'
import { ORDER_STATUS_LABELS, ORDER_STATUS_DASH_COLORS } from '@/types/database'
import {
  ShoppingCart, Package, TrendingUp, Sparkles,
  ArrowRight, Plus, Clock, Eye, ArrowUpRight,
} from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import StatTile from '@/components/dashboard/ui/StatTile'
import PeriodToggle, { type Period } from '@/components/dashboard/ui/PeriodToggle'
import AreaLineChart from '@/components/dashboard/ui/AreaLineChart'
import { fadeUp } from '@/lib/dashboard-motion'

interface OrderRow {
  id: string; created_at: string; status: OrderStatus; total_price: number | null
  product_id: string | null; customer_name: string; wilaya: string; order_number: string
}
interface ProductLite { id: string; name: string; images: string[] | null }

const PERIOD_DAYS: Record<Period, number> = { today: 1, week: 7, month: 30 }
const PERIOD_CAPTION: Record<Period, string> = { today: "Aujourd'hui", week: '7 derniers jours', month: '30 derniers jours' }
const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree', 'annulee', 'retournee']

function inWindow(iso: string, from: Date, to: Date): boolean {
  const t = new Date(iso).getTime()
  return t >= from.getTime() && t < to.getTime()
}

// Buckets a period's orders into a revenue time-series: hourly for "today",
// daily for "week", ~5-day segments for "month" — mirroring the mockup's
// bucket granularity but driven off real order timestamps, not fake data.
function bucketRevenue(orders: OrderRow[], period: Period, now: Date): { series: number[]; labels: string[] } {
  const revenueOf = (o: OrderRow) => (o.status === 'annulee' || o.status === 'retournee') ? 0 : (o.total_price ?? 0)

  if (period === 'today') {
    const buckets = Array(8).fill(0)
    const labels = ['0h', '3h', '6h', '9h', '12h', '15h', '18h', '21h']
    for (const o of orders) {
      const h = new Date(o.created_at).getHours()
      buckets[Math.min(7, Math.floor(h / 3))] += revenueOf(o)
    }
    return { series: buckets, labels }
  }

  if (period === 'week') {
    const buckets = Array(7).fill(0)
    const labels: string[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      labels.push(d.toLocaleDateString('fr-FR', { weekday: 'short' }))
    }
    for (const o of orders) {
      const daysAgo = Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 86400000)
      const idx = 6 - daysAgo
      if (idx >= 0 && idx < 7) buckets[idx] += revenueOf(o)
    }
    return { series: buckets, labels }
  }

  const buckets = Array(6).fill(0)
  const labels = ['J-30', 'J-25', 'J-20', 'J-15', 'J-10', 'J-5']
  for (const o of orders) {
    const daysAgo = Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 86400000)
    const idx = Math.min(5, Math.floor((29 - Math.min(29, daysAgo)) / 5))
    buckets[idx] += revenueOf(o)
  }
  return { series: buckets, labels }
}

export default function DashboardPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [orders60d, setOrders60d] = useState<OrderRow[]>([])
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [productsMap, setProductsMap] = useState<Record<string, ProductLite>>({})
  const [convRate, setConvRate] = useState(0)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('week')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) { router.push('/onboarding/step-1'); return }
      setStore(storeData)
      const storeId = storeData.id

      const since60d = new Date(Date.now() - 60 * 86400000).toISOString()
      const [
        { data: ordersData },
        { data: productsData },
        { data: recentData },
        { data: landingPages },
      ] = await Promise.all([
        supabase.from('orders').select('id, created_at, status, total_price, product_id, customer_name, wilaya, order_number').eq('store_id', storeId).gte('created_at', since60d),
        supabase.from('products').select('id, name, images').eq('store_id', storeId),
        supabase.from('orders').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(5),
        supabase.from('landing_pages').select('views, orders_count').eq('store_id', storeId),
      ])

      setOrders60d((ordersData ?? []) as OrderRow[])
      setProductsMap(Object.fromEntries(((productsData ?? []) as ProductLite[]).map(p => [p.id, p])))
      setRecentOrders((recentData ?? []) as Order[])

      const totalViews = (landingPages ?? []).reduce((s, p) => s + (p.views ?? 0), 0)
      const totalLpOrders = (landingPages ?? []).reduce((s, p) => s + (p.orders_count ?? 0), 0)
      setConvRate(totalViews > 0 ? (totalLpOrders / totalViews) * 100 : 0)

      setLoading(false)
    })
  }, [router])

  const now = useMemo(() => new Date(), [])

  const computed = useMemo(() => {
    const days = PERIOD_DAYS[period]
    const from = new Date(now.getTime() - days * 86400000)
    const prevFrom = new Date(now.getTime() - days * 2 * 86400000)

    const current = orders60d.filter(o => inWindow(o.created_at, from, now))
    const previous = orders60d.filter(o => inWindow(o.created_at, prevFrom, from))

    const revenueOf = (o: OrderRow) => (o.status === 'annulee' || o.status === 'retournee') ? 0 : (o.total_price ?? 0)
    const sumRevenue = (list: OrderRow[]) => list.reduce((s, o) => s + revenueOf(o), 0)

    const revenue = sumRevenue(current)
    const prevRevenue = sumRevenue(previous)
    const ordersCount = current.length
    const prevOrdersCount = previous.length
    const aov = ordersCount > 0 ? revenue / ordersCount : 0
    const prevAov = prevOrdersCount > 0 ? prevRevenue / prevOrdersCount : 0

    const pctDelta = (a: number, b: number) => b > 0 ? ((a - b) / b) * 100 : (a > 0 ? 100 : 0)

    const pending = current.filter(o => o.status === 'pending').length

    const pipeline = ALL_STATUSES.map(status => {
      const list = current.filter(o => o.status === status)
      return { status, count: list.length }
    }).filter(s => s.count > 0)
    const pipeTotal = pipeline.reduce((s, p) => s + p.count, 0) || 1

    const byProduct = new Map<string, { revenue: number; units: number }>()
    for (const o of current) {
      if (!o.product_id || o.status === 'annulee' || o.status === 'retournee') continue
      const cur = byProduct.get(o.product_id) ?? { revenue: 0, units: 0 }
      cur.revenue += o.total_price ?? 0
      cur.units += 1
      byProduct.set(o.product_id, cur)
    }
    const topProducts = [...byProduct.entries()]
      .map(([id, v]) => ({ id, ...v, product: productsMap[id] }))
      .filter(p => p.product)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
    const topMax = Math.max(...topProducts.map(p => p.units), 1)

    const chart = bucketRevenue(current, period, now)

    return {
      revenue, ordersCount, aov, pending,
      deltaRevenue: pctDelta(revenue, prevRevenue),
      deltaOrders: pctDelta(ordersCount, prevOrdersCount),
      deltaAov: pctDelta(aov, prevAov),
      pipeline, pipeTotal, topProducts, topMax, chart,
    }
  }, [orders60d, period, now, productsMap])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-[1360px]">
      <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex items-end justify-between gap-5 flex-wrap">
        <div>
          <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">Aperçu général</div>
          <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">
            Bonjour, {store?.name}
          </h1>
        </div>
        <PeriodToggle value={period} onChange={setPeriod} />
      </motion.div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-[18px]">
        <StatTile
          icon={<TrendingUp size={17} className="text-dash-accent" />} iconBg="var(--color-dash-accent-soft)"
          label="Revenu total" value={computed.revenue} format={n => `${Math.round(n).toLocaleString('fr-FR')} DA`}
          delta={computed.deltaRevenue}
        />
        <StatTile
          icon={<ShoppingCart size={17} className="text-dash-info" />} iconBg="var(--color-dash-info-soft)"
          label="Commandes" value={computed.ordersCount} delta={computed.deltaOrders} delayMs={50}
        />
        <StatTile
          icon={<Package size={17} className="text-dash-success" />} iconBg="var(--color-dash-success-soft)"
          label="Panier moyen" value={computed.aov} format={n => `${Math.round(n).toLocaleString('fr-FR')} DA`}
          delta={computed.deltaAov} delayMs={100}
        />
        <StatTile
          icon={<Sparkles size={17} className="text-dash-gold-dark" />} iconBg="var(--color-dash-gold-soft)"
          label="Taux de conversion (total)" value={convRate} format={n => `${n.toFixed(1).replace('.', ',')}%`}
          delayMs={150}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-[18px] items-start">
        <Card delayMs={180}>
          <div className="flex items-center justify-between mb-[18px]">
            <div>
              <div className="text-[15px] font-bold text-dash-ink">Évolution du revenu</div>
              <div className="text-[12.5px] text-dash-ink-soft mt-0.5">{PERIOD_CAPTION[period]}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-dash-accent inline-block" />
              <span className="text-xs text-dash-ink-soft">Revenu (DA)</span>
            </div>
          </div>
          <AreaLineChart series={computed.chart.series} labels={computed.chart.labels} />
        </Card>

        <Card delayMs={220}>
          <div className="text-[15px] font-bold text-dash-ink">Suivi des commandes</div>
          <div className="text-[12.5px] text-dash-ink-soft mt-0.5 mb-[18px]">{PERIOD_CAPTION[period]}</div>
          {computed.pipeline.length === 0 ? (
            <p className="text-dash-ink-faint text-sm py-6 text-center">Aucune commande sur cette période.</p>
          ) : (
            <>
              <div className="flex w-full h-3 rounded-full overflow-hidden bg-dash-surface-2 mb-[18px]">
                {computed.pipeline.map(p => (
                  <motion.div
                    key={p.status}
                    className={ORDER_STATUS_DASH_COLORS[p.status].dot}
                    initial={{ width: 0 }}
                    animate={{ width: `${(p.count / computed.pipeTotal) * 100}%` }}
                    transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  />
                ))}
              </div>
              <div className="flex flex-col gap-3">
                {computed.pipeline.map(p => (
                  <div key={p.status} className="flex items-center gap-2.5">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ORDER_STATUS_DASH_COLORS[p.status].dot}`} />
                    <span className="text-[13px] text-dash-ink flex-1">{ORDER_STATUS_LABELS[p.status]}</span>
                    <span className="text-[13px] font-bold tabular-nums text-dash-ink">{p.count}</span>
                    <span className="text-[11.5px] text-dash-ink-faint w-[38px] text-right">
                      {((p.count / computed.pipeTotal) * 100).toFixed(1).replace('.', ',')}%
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-[18px] items-start">
        <Card delayMs={260}>
          <div className="flex items-center justify-between mb-[18px]">
            <div className="text-[15px] font-bold text-dash-ink">Meilleures ventes</div>
            <div className="text-xs text-dash-ink-soft">{PERIOD_CAPTION[period]}</div>
          </div>
          {computed.topProducts.length === 0 ? (
            <p className="text-dash-ink-faint text-sm py-6 text-center">Aucune vente sur cette période.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {computed.topProducts.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.05 }} className="flex items-center gap-3.5">
                  {p.product?.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.product.images[0]} alt={p.product.name} loading="lazy" className="w-11 h-11 rounded-[10px] object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-[10px] bg-dash-surface-2 flex items-center justify-center flex-shrink-0">
                      <Package size={16} className="text-dash-ink-faint" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between gap-2">
                      <span className="text-[13.5px] font-semibold text-dash-ink truncate">{p.product?.name}</span>
                      <span className="text-[13px] font-bold text-dash-ink flex-shrink-0 tabular-nums">{p.revenue.toLocaleString('fr-FR')} DA</span>
                    </div>
                    <div className="flex justify-between gap-2 mt-0.5">
                      <span className="text-[11.5px] text-dash-ink-faint">{p.units} vente{p.units > 1 ? 's' : ''}</span>
                    </div>
                    <div className="w-full h-[5px] rounded-full bg-dash-surface-2 mt-[7px] overflow-hidden">
                      <motion.div
                        className="h-full bg-dash-accent rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(p.units / computed.topMax) * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.3 + i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-[18px]">
          <Card delayMs={300}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-dash-ink text-[14.5px]">Dernières commandes</h3>
              <Link href="/dashboard/orders" className="text-xs font-bold text-dash-accent hover:text-dash-accent-dark flex items-center gap-1">
                Voir tout <ArrowRight size={12} />
              </Link>
            </div>
            {recentOrders.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-center">
                <ShoppingCart size={26} className="text-dash-ink-faint" />
                <p className="text-dash-ink-soft text-xs">Aucune commande pour l&apos;instant</p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-dash-border -mx-2">
                {recentOrders.map(order => (
                  <div key={order.id} className="px-2 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-dash-ink text-[13px] font-semibold truncate">{order.customer_name}</p>
                      <p className="text-dash-ink-faint text-[11px] mt-0.5">{order.wilaya} · {order.order_number}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-dash-accent text-[13px] font-bold">{order.total_price?.toLocaleString('fr-DZ')} DA</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ORDER_STATUS_DASH_COLORS[order.status].bg} ${ORDER_STATUS_DASH_COLORS[order.status].fg}`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card delayMs={340}>
            <h3 className="font-bold text-dash-ink text-[14.5px] mb-3">Actions rapides</h3>
            <div className="flex flex-col gap-2">
              {[
                { icon: Plus, label: 'Ajouter un produit', href: '/dashboard/products/new' },
                { icon: Eye, label: 'Voir ma boutique', href: `/?store=${store?.slug}`, external: true },
                { icon: Sparkles, label: 'Générer une landing page', href: '/dashboard/pages/new' },
                { icon: Clock, label: 'Commandes en attente', href: '/dashboard/orders', badge: computed.pending > 0 ? computed.pending : undefined },
              ].map(({ icon: Icon, label, href, external, badge }) => (
                <Link
                  key={href}
                  href={href}
                  target={external ? '_blank' : undefined}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-dash-surface-2 transition-all group"
                >
                  <div className="w-8 h-8 rounded-lg bg-dash-accent-soft flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-dash-accent" />
                  </div>
                  <span className="text-dash-ink-soft text-[13px] group-hover:text-dash-ink transition-colors flex-1">{label}</span>
                  {badge !== undefined && (
                    <span className="w-5 h-5 rounded-full bg-dash-gold text-dash-ink text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                      {badge}
                    </span>
                  )}
                  <ArrowUpRight size={13} className="text-dash-ink-faint group-hover:text-dash-ink-soft transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
