'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { OrderStatus, OrderSource, Plan } from '@/types/database'
import { ORDER_SOURCE_LABELS, orderSourceLabel, orderStatusLabel, ORDER_STATUS_DASH_COLORS, GROWTH_PLANS } from '@/types/database'
import { BarChart2, TrendingUp, Eye, ShoppingCart, Banknote, Loader2, Lock, FileDown, MapPin, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import StatTile from '@/components/dashboard/ui/StatTile'
import DonutChart from '@/components/dashboard/ui/DonutChart'
import { useI18n } from '@/lib/i18n/LocaleProvider'

interface LandingRow { id: string; title: string; slug: string; views: number; orders_count: number }
interface OrderStatsRow {
  total_orders: number
  pending_orders: number
  confirmed_orders: number
  chez_livreur_orders: number
  en_livraison_orders: number
  delivered_orders: number
  cancelled_orders: number
  returned_orders: number
  shipped_orders: number
  source_manual_orders: number
  source_chatbot_orders: number
  source_form_orders: number
  source_landing_orders: number
  source_messenger_orders: number
  source_instagram_orders: number
  delivered_revenue: number
  delivered_margin_revenue: number
  active_revenue: number
}
interface DailyRow { day: string; orders: number; delivered_orders: number; delivered_revenue: number }
interface WilayaRow { wilaya: string; orders: number }

import { formatDA as DA } from '@/lib/format'
const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree', 'annulee', 'retournee']

// Colour palette for the traffic-source donut — sourced from the dash tokens.
const SOURCE_COLORS = [
  'var(--color-dash-accent)', 'var(--color-dash-info)', 'var(--color-dash-ink)',
  'var(--color-dash-gold)', 'var(--color-dash-success)', 'var(--color-dash-purple)',
]

export default function AnalyticsPage() {
  const { t, locale } = useI18n()
  const router = useRouter()
  const [orders, setOrders] = useState<OrderStatsRow | null>(null)
  const [daily, setDaily] = useState<DailyRow[]>([])
  const [wilayaRows, setWilayaRows] = useState<WilayaRow[]>([])
  const [pages, setPages] = useState<LandingRow[]>([])
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, plan') as { id: string; plan: Plan } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      setPlan((store.plan ?? null) as Plan)
      const [statsRes, dailyRes, wilayaRes, pagesRes] = await Promise.all([
        supabase.from('store_order_stats').select('*').eq('store_id', store.id).maybeSingle(),
        supabase.from('store_daily_order_stats').select('day, orders, delivered_orders, delivered_revenue').eq('store_id', store.id).gte('day', new Date(Date.now() - 62 * 864e5).toISOString().slice(0, 10)),
        supabase.from('store_wilaya_stats').select('wilaya, orders').eq('store_id', store.id),
        supabase.from('landing_pages').select('id, title, slug, views, orders_count').eq('store_id', store.id),
      ])
      setOrders((statsRes.data ?? null) as OrderStatsRow | null)
      setDaily((dailyRes.data ?? []) as DailyRow[])
      setWilayaRows((wilayaRes.data ?? []) as WilayaRow[])
      setPages((pagesRes.data ?? []) as LandingRow[])
      setLoading(false)
    })
  }, [router])

  const m = useMemo(() => {
    const totalViews = pages.reduce((s, p) => s + (p.views ?? 0), 0)
    const totalOrders = orders?.total_orders ?? 0
    const delivered = orders?.delivered_orders ?? 0
    const revenue = Number(orders?.delivered_revenue ?? 0)
    const convRate = totalViews > 0 ? (totalOrders / totalViews) * 100 : 0

    const STATUS_KEY: Record<OrderStatus, keyof OrderStatsRow> = {
      pending: 'pending_orders', confirmed: 'confirmed_orders', chez_livreur: 'chez_livreur_orders',
      en_livraison: 'en_livraison_orders', livree: 'delivered_orders', annulee: 'cancelled_orders',
      retournee: 'returned_orders',
    }
    const byStatus = ALL_STATUSES.map(key => ({ key, count: orders?.[STATUS_KEY[key]] ?? 0 }))
    const maxStatus = Math.max(1, ...byStatus.map(s => s.count))

    const SOURCE_KEY: Record<OrderSource, keyof OrderStatsRow> = {
      manual: 'source_manual_orders', chatbot: 'source_chatbot_orders',
      form: 'source_form_orders', landing_page: 'source_landing_orders',
      messenger: 'source_messenger_orders', instagram: 'source_instagram_orders',
    }
    const bySourceRaw = (Object.keys(ORDER_SOURCE_LABELS) as OrderSource[])
      .map(src => ({ src, label: orderSourceLabel(src, locale), count: orders?.[SOURCE_KEY[src]] ?? 0 }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)
    const sourceTotal = bySourceRaw.reduce((s, x) => s + x.count, 0) || 1
    const donutSegments = bySourceRaw.map((s, i) => ({
      label: s.label, pct: Math.round((s.count / sourceTotal) * 100), color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }))

    // Conversion funnel: views → all orders → delivered (the mockup's funnel,
    // mapped onto Krenix's real acquisition path).
    const funnel = [
      { label: t('analytics.visitors'), value: totalViews },
      { label: t('analytics.ordersFunnel'), value: totalOrders },
      { label: t('analytics.delivered'), value: delivered },
    ]
    const funnelMax = Math.max(1, ...funnel.map(f => f.value))

    const topPages = [...pages].filter(p => p.views > 0 || p.orders_count > 0).sort((a, b) => b.orders_count - a.orders_count).slice(0, 5)

    // Daily aggregate rows are keyed by UTC date (matches the view definition).
    const byDay = new Map(daily.map(d => [d.day, d]))
    const dayKey = (d: Date) => d.toISOString().slice(0, 10)

    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (6 - i)); return d })
    const trend = days.map(d => ({
      label: d.toLocaleDateString('fr-DZ', { weekday: 'short' }),
      count: byDay.get(dayKey(d))?.orders ?? 0,
    }))
    const maxTrend = Math.max(1, ...trend.map(t => t.count))

    // Advanced
    const aov = delivered > 0 ? revenue / delivered : 0
    const returnedCount = orders?.returned_orders ?? 0
    const shippedCount = orders?.shipped_orders ?? 0
    const returnRate = shippedCount > 0 ? (returnedCount / shippedCount) * 100 : 0

    const days30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - (29 - i)); return d })
    const revTrend = days30.map(d => ({ d, rev: Number(byDay.get(dayKey(d))?.delivered_revenue ?? 0) }))
    const maxRev = Math.max(1, ...revTrend.map(r => r.rev))

    const topWilayas = [...wilayaRows].sort((a, b) => b.orders - a.orders).slice(0, 6)
    const maxWilaya = Math.max(1, ...topWilayas.map(w => w.orders))

    // Month-over-month from the daily aggregate rows (UTC month keys).
    const now = new Date()
    const monthKey = (d: Date) => d.toISOString().slice(0, 7)
    const thisMonthKey = monthKey(now)
    const last = new Date(now); last.setUTCMonth(last.getUTCMonth() - 1)
    const lastMonthKey = monthKey(last)
    const thisMonthOrders = daily.filter(d => d.day.startsWith(thisMonthKey)).reduce((s, d) => s + d.orders, 0)
    const lastMonthOrders = daily.filter(d => d.day.startsWith(lastMonthKey)).reduce((s, d) => s + d.orders, 0)
    const thisMonthRev = daily.filter(d => d.day.startsWith(thisMonthKey)).reduce((s, d) => s + Number(d.delivered_revenue), 0)
    const lastMonthRev = daily.filter(d => d.day.startsWith(lastMonthKey)).reduce((s, d) => s + Number(d.delivered_revenue), 0)
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0)

    return {
      totalViews, totalOrders, revenue, convRate, byStatus, maxStatus, donutSegments, bySourceTop: bySourceRaw[0],
      funnel, funnelMax, topPages, trend, maxTrend, aov, returnRate, revTrend, maxRev, topWilayas, maxWilaya,
      thisMonthOrders, thisMonthRev, momOrders: pct(thisMonthOrders, lastMonthOrders), momRev: pct(thisMonthRev, lastMonthRev),
      now,
    }
  }, [orders, daily, wilayaRows, pages, t, locale])

  if (loading) return (
    <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={28} /></div>
  )

  const isGrowth = plan != null && GROWTH_PLANS.includes(plan)
  const hasData = m.totalOrders > 0 || m.totalViews > 0

  const downloadReport = () => {
    const monthLabel = m.now.toLocaleDateString('fr-DZ', { month: 'long', year: 'numeric' })
    const lines = [
      t('analytics.reportTitle', { month: monthLabel }), '========================================', '',
      t('analytics.reportOrdersThisMonth', { count: m.thisMonthOrders }),
      t('analytics.reportRevenue', { value: DA(m.thisMonthRev) }),
      t('analytics.reportAvgCart', { value: DA(m.aov) }),
      t('analytics.reportReturnRate', { value: m.returnRate.toFixed(1) }),
      t('analytics.reportOrdersEvolution', { sign: m.momOrders >= 0 ? '+' : '', value: m.momOrders.toFixed(0), vsLastMonth: t('analytics.reportVsLastMonth') }),
      t('analytics.reportRevenueEvolution', { sign: m.momRev >= 0 ? '+' : '', value: m.momRev.toFixed(0), vsLastMonth: t('analytics.reportVsLastMonth') }),
      '', t('analytics.reportTopWilayas'), ...m.topWilayas.map(w => `  - ${w.wilaya} : ${w.orders} ${t('analytics.reportOrderUnit')}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rapport-${monthLabel.replace(/\s/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="max-w-[1100px] space-y-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">{t('analytics.kicker')}</div>
        <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">{t('analytics.title')}</h1>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[18px]">
        <StatTile icon={<Eye size={17} className="text-dash-info" />} iconBg="var(--color-dash-info-soft)" label={t('analytics.totalViews')} value={m.totalViews} />
        <StatTile icon={<ShoppingCart size={17} className="text-dash-success" />} iconBg="var(--color-dash-success-soft)" label={t('analytics.orders')} value={m.totalOrders} delayMs={50} />
        <StatTile icon={<TrendingUp size={17} className="text-dash-gold-dark" />} iconBg="var(--color-dash-gold-soft)" label={t('analytics.conversionRate')} value={m.convRate} format={n => `${n.toFixed(1).replace('.', ',')}%`} delayMs={100} />
        <StatTile icon={<Banknote size={17} className="text-dash-purple" />} iconBg="var(--color-dash-purple-soft)" label={t('analytics.revenue')} value={m.revenue} format={DA} delayMs={150} />
      </div>

      {!hasData ? (
        <Card className="flex flex-col items-center justify-center text-center gap-4" style={{ minHeight: 260 }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-dash-accent-soft">
            <BarChart2 size={28} className="text-dash-accent" />
          </div>
          <div>
            <p className="text-dash-ink font-bold text-lg">{t('analytics.noDataTitle')}</p>
            <p className="text-dash-ink-soft text-sm mt-2 max-w-md">{t('analytics.noDataSubtitle')}</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-[18px] items-start">
            {/* Conversion funnel — mockup feature */}
            <Card delayMs={180}>
              <div className="text-[15px] font-bold text-dash-ink mb-5">{t('analytics.conversionFunnel')}</div>
              <div className="flex flex-col gap-3.5">
                {m.funnel.map((f, i) => {
                  const prev = i > 0 ? m.funnel[i - 1].value : f.value
                  const conv = i > 0 && prev > 0 ? Math.round((f.value / prev) * 100) : 100
                  return (
                    <div key={f.label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-dash-ink">{f.label}</span>
                        <div className="flex items-center gap-2.5">
                          {i > 0 && <span className="text-[11.5px] text-dash-ink-faint">{t('analytics.previousPct', { pct: conv })}</span>}
                          <span className="text-[13px] font-bold tabular-nums text-dash-ink">{f.value.toLocaleString('fr-DZ')}</span>
                        </div>
                      </div>
                      <div className="w-full h-3.5 rounded-lg bg-dash-surface-2 overflow-hidden">
                        <motion.div
                          className="h-full rounded-lg"
                          style={{ background: 'linear-gradient(90deg, var(--color-dash-accent-dark), var(--color-dash-accent))' }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(f.value / m.funnelMax) * 100}%` }}
                          transition={{ duration: 1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {/* Traffic sources donut — mockup feature */}
            <Card delayMs={220}>
              <div className="text-[15px] font-bold text-dash-ink mb-[18px]">{t('analytics.trafficSources')}</div>
              {m.donutSegments.length > 0 ? (
                <DonutChart segments={m.donutSegments} centerLabel={`${m.donutSegments[0]?.pct ?? 0}%`} centerSub={m.bySourceTop?.label ?? '—'} />
              ) : (
                <p className="text-dash-ink-faint text-sm py-6 text-center">{t('analytics.noOrdersToBreakdown')}</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] items-start">
            {/* 7-day trend */}
            <Card delayMs={260}>
              <p className="text-dash-ink font-bold text-sm mb-4">{t('analytics.orders7d')}</p>
              <div className="flex items-end justify-between gap-2 h-32">
                {m.trend.map((day, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <motion.div
                      className={`w-full max-w-[36px] rounded-t-lg ${day.count > 0 ? 'bg-dash-accent' : 'bg-dash-surface-2'}`}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max((day.count / m.maxTrend) * 100, day.count > 0 ? 6 : 2)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      title={`${day.count} ${t('analytics.reportOrderUnit')}`}
                    />
                    <span className="text-[10px] text-dash-ink-faint">{day.label}</span>
                    <span className="text-[11px] font-bold text-dash-ink -mt-1">{day.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Orders by status */}
            <Card delayMs={300}>
              <p className="text-dash-ink font-bold text-sm mb-4">{t('analytics.ordersByStatus')}</p>
              <div className="space-y-2.5">
                {m.byStatus.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-xs text-dash-ink-soft w-32 flex-shrink-0">{orderStatusLabel(s.key, locale)}</span>
                    <div className="flex-1 h-2 rounded-full bg-dash-surface-2 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${ORDER_STATUS_DASH_COLORS[s.key].dot}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${(s.count / m.maxStatus) * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                    <span className="text-xs font-bold text-dash-ink w-8 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {m.topPages.length > 0 && (
            <Card delayMs={340}>
              <p className="text-dash-ink font-bold text-sm mb-4">{t('analytics.topLandingPages')}</p>
              <div className="space-y-2">
                {m.topPages.map(p => {
                  const conv = p.views > 0 ? (p.orders_count / p.views) * 100 : 0
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-dash-border last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-dash-ink text-sm truncate">{p.title}</p>
                        <p className="text-dash-ink-faint text-[11px] font-mono truncate">{p.slug}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div><p className="text-dash-ink text-sm font-bold">{p.views.toLocaleString('fr-DZ')}</p><p className="text-dash-ink-faint text-[10px]">{t('analytics.views')}</p></div>
                        <div><p className="text-dash-ink text-sm font-bold">{p.orders_count}</p><p className="text-dash-ink-faint text-[10px]">{t('analytics.ordersShort')}</p></div>
                        <div className="w-12"><p className="text-dash-gold-dark text-sm font-bold">{conv.toFixed(1)}%</p><p className="text-dash-ink-faint text-[10px]">{t('analytics.convShort')}</p></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
        </>
      )}

      <div className="pt-2">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-dash-ink font-bold text-sm">{t('analytics.advancedStats')}</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dash-success-soft text-dash-success">GROWTH+</span>
        </div>

        {!isGrowth ? (
          <Card className="flex items-center gap-4">
            <Lock size={20} className="text-dash-ink-faint flex-shrink-0" />
            <div>
              <p className="text-dash-ink text-sm font-semibold">{t('analytics.advancedLocked')}</p>
              <p className="text-dash-ink-soft text-xs">{t('analytics.advancedLockedHint')}</p>
            </div>
            <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 bg-dash-success-soft text-dash-success">
              {t('analytics.upgradeToGrowth')}
            </a>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: t('analytics.avgCart'), value: DA(m.aov) },
                { label: t('analytics.returnRate'), value: `${m.returnRate.toFixed(1)}%` },
                { label: t('analytics.ordersPerMonth'), value: `${m.momOrders >= 0 ? '+' : ''}${m.momOrders.toFixed(0)}%`, up: m.momOrders >= 0 },
                { label: t('analytics.revenuePerMonth'), value: `${m.momRev >= 0 ? '+' : ''}${m.momRev.toFixed(0)}%`, up: m.momRev >= 0 },
              ].map((x, i) => (
                <Card key={i} delayMs={i * 40} padding="md">
                  <p className="dash-font-heading text-[22px] text-dash-ink truncate flex items-center gap-1">
                    {x.value}
                    {'up' in x && (x.up ? <ArrowUpRight size={16} className="text-dash-success" /> : <ArrowDownRight size={16} className="text-dash-danger" />)}
                  </p>
                  <p className="text-dash-ink-soft text-xs mt-1">{x.label}</p>
                </Card>
              ))}
            </div>

            <Card>
              <p className="text-dash-ink font-bold text-sm mb-4">{t('analytics.revenue30d')}</p>
              <div className="flex items-end gap-0.5 h-28">
                {m.revTrend.map((r, i) => (
                  <motion.div
                    key={i}
                    className={`flex-1 rounded-t ${r.rev > 0 ? 'bg-dash-purple' : 'bg-dash-surface-2'}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max((r.rev / m.maxRev) * 100, r.rev > 0 ? 4 : 2)}%` }}
                    transition={{ duration: 0.5, delay: i * 0.01 }}
                    title={`${r.d.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' })} · ${DA(r.rev)}`}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-dash-ink-faint mt-2">
                <span>{m.revTrend[0]?.d.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' })}</span>
                <span>{t('analytics.today')}</span>
              </div>
            </Card>

            {m.topWilayas.length > 0 && (
              <Card>
                <p className="text-dash-ink font-bold text-sm mb-4 flex items-center gap-2"><MapPin size={14} className="text-dash-accent" /> {t('analytics.topWilayas')}</p>
                <div className="space-y-2.5">
                  {m.topWilayas.map((w, i) => (
                    <div key={w.wilaya} className="flex items-center gap-3">
                      <span className="text-xs text-dash-ink-soft w-28 flex-shrink-0 truncate">{w.wilaya}</span>
                      <div className="flex-1 h-2 rounded-full bg-dash-surface-2 overflow-hidden">
                        <motion.div className="h-full rounded-full bg-dash-accent" initial={{ width: 0 }} animate={{ width: `${(w.orders / m.maxWilaya) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.04 }} />
                      </div>
                      <span className="text-xs font-bold text-dash-ink w-8 text-right">{w.orders}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-dash-ink font-bold text-sm">{t('analytics.monthlyReport')}</p>
                <p className="text-dash-ink-soft text-xs mt-0.5">{t('analytics.monthlyReportHint')}</p>
              </div>
              <button onClick={downloadReport}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-dash-surface transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--color-dash-success), oklch(0.48 0.12 144))' }}>
                <FileDown size={15} /> {t('analytics.download')}
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
