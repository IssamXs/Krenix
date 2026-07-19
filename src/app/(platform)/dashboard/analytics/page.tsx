'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Order, OrderStatus, OrderSource, Plan } from '@/types/database'
import { ORDER_SOURCE_LABELS, ORDER_STATUS_LABELS, ORDER_STATUS_DASH_COLORS, GROWTH_PLANS } from '@/types/database'
import { BarChart2, TrendingUp, Eye, ShoppingCart, Banknote, Loader2, Lock, FileDown, MapPin, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import StatTile from '@/components/dashboard/ui/StatTile'
import DonutChart from '@/components/dashboard/ui/DonutChart'

type OrderRow = Pick<Order, 'status' | 'source' | 'total_price' | 'created_at' | 'wilaya'>
interface LandingRow { id: string; title: string; slug: string; views: number; orders_count: number }

const DELIVERED: OrderStatus = 'livree'
import { formatDA as DA } from '@/lib/format'
const ALL_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'chez_livreur', 'en_livraison', 'livree', 'annulee', 'retournee']

// Colour palette for the traffic-source donut — sourced from the dash tokens.
const SOURCE_COLORS = [
  'var(--color-dash-accent)', 'var(--color-dash-info)', 'var(--color-dash-ink)',
  'var(--color-dash-gold)', 'var(--color-dash-success)', 'var(--color-dash-purple)',
]

export default function AnalyticsPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderRow[]>([])
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
      const [ordersRes, pagesRes] = await Promise.all([
        supabase.from('orders').select('status, source, total_price, created_at, wilaya').eq('store_id', store.id),
        supabase.from('landing_pages').select('id, title, slug, views, orders_count').eq('store_id', store.id),
      ])
      setOrders((ordersRes.data ?? []) as OrderRow[])
      setPages((pagesRes.data ?? []) as LandingRow[])
      setLoading(false)
    })
  }, [router])

  const m = useMemo(() => {
    const totalViews = pages.reduce((s, p) => s + (p.views ?? 0), 0)
    const totalOrders = orders.length
    const delivered = orders.filter(o => o.status === DELIVERED)
    const revenue = delivered.reduce((s, o) => s + Number(o.total_price ?? 0), 0)
    const convRate = totalViews > 0 ? (totalOrders / totalViews) * 100 : 0

    const byStatus = ALL_STATUSES.map(key => ({ key, count: orders.filter(o => o.status === key).length }))
    const maxStatus = Math.max(1, ...byStatus.map(s => s.count))

    const bySourceRaw = (Object.keys(ORDER_SOURCE_LABELS) as OrderSource[])
      .map(src => ({ src, label: ORDER_SOURCE_LABELS[src], count: orders.filter(o => o.source === src).length }))
      .filter(s => s.count > 0)
      .sort((a, b) => b.count - a.count)
    const sourceTotal = bySourceRaw.reduce((s, x) => s + x.count, 0) || 1
    const donutSegments = bySourceRaw.map((s, i) => ({
      label: s.label, pct: Math.round((s.count / sourceTotal) * 100), color: SOURCE_COLORS[i % SOURCE_COLORS.length],
    }))

    // Conversion funnel: views → all orders → delivered (the mockup's funnel,
    // mapped onto Krenix's real acquisition path).
    const funnel = [
      { label: 'Visiteurs', value: totalViews },
      { label: 'Commandes', value: totalOrders },
      { label: 'Livrées', value: delivered.length },
    ]
    const funnelMax = Math.max(1, ...funnel.map(f => f.value))

    const topPages = [...pages].filter(p => p.views > 0 || p.orders_count > 0).sort((a, b) => b.orders_count - a.orders_count).slice(0, 5)

    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d })
    const trend = days.map(d => {
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const count = orders.filter(o => { const t = new Date(o.created_at).getTime(); return t >= d.getTime() && t < next.getTime() }).length
      return { label: d.toLocaleDateString('fr-DZ', { weekday: 'short' }), count }
    })
    const maxTrend = Math.max(1, ...trend.map(t => t.count))

    // Advanced
    const aov = delivered.length > 0 ? revenue / delivered.length : 0
    const returnedCount = orders.filter(o => o.status === 'retournee').length
    const shippedCount = orders.filter(o => ['chez_livreur', 'en_livraison', 'livree', 'retournee'].includes(o.status)).length
    const returnRate = shippedCount > 0 ? (returnedCount / shippedCount) * 100 : 0

    const days30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (29 - i)); return d })
    const revTrend = days30.map(d => {
      const next = new Date(d); next.setDate(d.getDate() + 1)
      const rev = delivered.filter(o => { const t = new Date(o.created_at).getTime(); return t >= d.getTime() && t < next.getTime() }).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
      return { d, rev }
    })
    const maxRev = Math.max(1, ...revTrend.map(r => r.rev))

    const wilayaMap = new Map<string, number>()
    orders.forEach(o => { if (o.wilaya) wilayaMap.set(o.wilaya, (wilayaMap.get(o.wilaya) ?? 0) + 1) })
    const topWilayas = [...wilayaMap.entries()].map(([wilaya, count]) => ({ wilaya, count })).sort((a, b) => b.count - a.count).slice(0, 6)
    const maxWilaya = Math.max(1, ...topWilayas.map(w => w.count))

    const now = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
    const inRange = (o: OrderRow, start: number, end: number) => { const t = new Date(o.created_at).getTime(); return t >= start && t < end }
    const thisMonthOrders = orders.filter(o => inRange(o, thisMonthStart, now.getTime() + 1))
    const lastMonthOrders = orders.filter(o => inRange(o, lastMonthStart, thisMonthStart))
    const thisMonthRev = thisMonthOrders.filter(o => o.status === DELIVERED).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
    const lastMonthRev = lastMonthOrders.filter(o => o.status === DELIVERED).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
    const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0)

    return {
      totalViews, totalOrders, revenue, convRate, byStatus, maxStatus, donutSegments, bySourceTop: bySourceRaw[0],
      funnel, funnelMax, topPages, trend, maxTrend, aov, returnRate, revTrend, maxRev, topWilayas, maxWilaya,
      thisMonthOrders, thisMonthRev, momOrders: pct(thisMonthOrders.length, lastMonthOrders.length), momRev: pct(thisMonthRev, lastMonthRev),
      now,
    }
  }, [orders, pages])

  if (loading) return (
    <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={28} /></div>
  )

  const isGrowth = plan != null && GROWTH_PLANS.includes(plan)
  const hasData = m.totalOrders > 0 || m.totalViews > 0

  const downloadReport = () => {
    const monthLabel = m.now.toLocaleDateString('fr-DZ', { month: 'long', year: 'numeric' })
    const lines = [
      `RAPPORT MENSUEL — ${monthLabel}`, '========================================', '',
      `Commandes ce mois       : ${m.thisMonthOrders.length}`,
      `Chiffre d'affaires livré : ${DA(m.thisMonthRev)}`,
      `Panier moyen            : ${DA(m.aov)}`,
      `Taux de retour          : ${m.returnRate.toFixed(1)}%`,
      `Évolution commandes     : ${m.momOrders >= 0 ? '+' : ''}${m.momOrders.toFixed(0)}% vs mois dernier`,
      `Évolution CA            : ${m.momRev >= 0 ? '+' : ''}${m.momRev.toFixed(0)}% vs mois dernier`,
      '', 'Top wilayas :', ...m.topWilayas.map(w => `  - ${w.wilaya} : ${w.count} commande(s)`),
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
        <div className="text-[11px] tracking-[0.09em] uppercase text-dash-accent font-bold">Performances</div>
        <h1 className="dash-font-heading font-medium text-[32px] mt-1 text-dash-ink">Analytiques</h1>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-[18px]">
        <StatTile icon={<Eye size={17} className="text-dash-info" />} iconBg="var(--color-dash-info-soft)" label="Vues totales" value={m.totalViews} />
        <StatTile icon={<ShoppingCart size={17} className="text-dash-success" />} iconBg="var(--color-dash-success-soft)" label="Commandes" value={m.totalOrders} delayMs={50} />
        <StatTile icon={<TrendingUp size={17} className="text-dash-gold-dark" />} iconBg="var(--color-dash-gold-soft)" label="Taux de conversion" value={m.convRate} format={n => `${n.toFixed(1).replace('.', ',')}%`} delayMs={100} />
        <StatTile icon={<Banknote size={17} className="text-dash-purple" />} iconBg="var(--color-dash-purple-soft)" label="Chiffre d'affaires" value={m.revenue} format={DA} delayMs={150} />
      </div>

      {!hasData ? (
        <Card className="flex flex-col items-center justify-center text-center gap-4" style={{ minHeight: 260 }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center bg-dash-accent-soft">
            <BarChart2 size={28} className="text-dash-accent" />
          </div>
          <div>
            <p className="text-dash-ink font-bold text-lg">Pas encore de données</p>
            <p className="text-dash-ink-soft text-sm mt-2 max-w-md">Dès que vos landing pages reçoivent des visites et des commandes, vos statistiques s&apos;affichent ici.</p>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-[18px] items-start">
            {/* Conversion funnel — mockup feature */}
            <Card delayMs={180}>
              <div className="text-[15px] font-bold text-dash-ink mb-5">Entonnoir de conversion</div>
              <div className="flex flex-col gap-3.5">
                {m.funnel.map((f, i) => {
                  const prev = i > 0 ? m.funnel[i - 1].value : f.value
                  const conv = i > 0 && prev > 0 ? Math.round((f.value / prev) * 100) : 100
                  return (
                    <div key={f.label}>
                      <div className="flex justify-between mb-1.5">
                        <span className="text-[13px] font-semibold text-dash-ink">{f.label}</span>
                        <div className="flex items-center gap-2.5">
                          {i > 0 && <span className="text-[11.5px] text-dash-ink-faint">{conv}% précédent</span>}
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
              <div className="text-[15px] font-bold text-dash-ink mb-[18px]">Sources de trafic</div>
              {m.donutSegments.length > 0 ? (
                <DonutChart segments={m.donutSegments} centerLabel={`${m.donutSegments[0]?.pct ?? 0}%`} centerSub={m.bySourceTop?.label ?? '—'} />
              ) : (
                <p className="text-dash-ink-faint text-sm py-6 text-center">Aucune commande à ventiler.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px] items-start">
            {/* 7-day trend */}
            <Card delayMs={260}>
              <p className="text-dash-ink font-bold text-sm mb-4">Commandes — 7 derniers jours</p>
              <div className="flex items-end justify-between gap-2 h-32">
                {m.trend.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <motion.div
                      className={`w-full max-w-[36px] rounded-t-lg ${t.count > 0 ? 'bg-dash-accent' : 'bg-dash-surface-2'}`}
                      initial={{ height: 0 }}
                      animate={{ height: `${Math.max((t.count / m.maxTrend) * 100, t.count > 0 ? 6 : 2)}%` }}
                      transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                      title={`${t.count} commande(s)`}
                    />
                    <span className="text-[10px] text-dash-ink-faint">{t.label}</span>
                    <span className="text-[11px] font-bold text-dash-ink -mt-1">{t.count}</span>
                  </div>
                ))}
              </div>
            </Card>

            {/* Orders by status */}
            <Card delayMs={300}>
              <p className="text-dash-ink font-bold text-sm mb-4">Commandes par statut</p>
              <div className="space-y-2.5">
                {m.byStatus.map((s, i) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <span className="text-xs text-dash-ink-soft w-32 flex-shrink-0">{ORDER_STATUS_LABELS[s.key]}</span>
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
              <p className="text-dash-ink font-bold text-sm mb-4">Meilleures landing pages</p>
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
                        <div><p className="text-dash-ink text-sm font-bold">{p.views.toLocaleString('fr-DZ')}</p><p className="text-dash-ink-faint text-[10px]">vues</p></div>
                        <div><p className="text-dash-ink text-sm font-bold">{p.orders_count}</p><p className="text-dash-ink-faint text-[10px]">cmd.</p></div>
                        <div className="w-12"><p className="text-dash-gold-dark text-sm font-bold">{conv.toFixed(1)}%</p><p className="text-dash-ink-faint text-[10px]">conv.</p></div>
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
          <h3 className="text-dash-ink font-bold text-sm">Statistiques avancées</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-dash-success-soft text-dash-success">GROWTH+</span>
        </div>

        {!isGrowth ? (
          <Card className="flex items-center gap-4">
            <Lock size={20} className="text-dash-ink-faint flex-shrink-0" />
            <div>
              <p className="text-dash-ink text-sm font-semibold">Panier moyen, taux de retour, tendance 30 j, meilleures wilayas, comparaison mensuelle &amp; rapport</p>
              <p className="text-dash-ink-soft text-xs">Disponible à partir du plan Growth</p>
            </div>
            <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 bg-dash-success-soft text-dash-success">
              Passer à Growth
            </a>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Panier moyen', value: DA(m.aov) },
                { label: 'Taux de retour', value: `${m.returnRate.toFixed(1)}%` },
                { label: 'Commandes / mois', value: `${m.momOrders >= 0 ? '+' : ''}${m.momOrders.toFixed(0)}%`, up: m.momOrders >= 0 },
                { label: 'CA / mois', value: `${m.momRev >= 0 ? '+' : ''}${m.momRev.toFixed(0)}%`, up: m.momRev >= 0 },
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
              <p className="text-dash-ink font-bold text-sm mb-4">Chiffre d&apos;affaires — 30 derniers jours</p>
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
                <span>Aujourd&apos;hui</span>
              </div>
            </Card>

            {m.topWilayas.length > 0 && (
              <Card>
                <p className="text-dash-ink font-bold text-sm mb-4 flex items-center gap-2"><MapPin size={14} className="text-dash-accent" /> Meilleures wilayas</p>
                <div className="space-y-2.5">
                  {m.topWilayas.map((w, i) => (
                    <div key={w.wilaya} className="flex items-center gap-3">
                      <span className="text-xs text-dash-ink-soft w-28 flex-shrink-0 truncate">{w.wilaya}</span>
                      <div className="flex-1 h-2 rounded-full bg-dash-surface-2 overflow-hidden">
                        <motion.div className="h-full rounded-full bg-dash-accent" initial={{ width: 0 }} animate={{ width: `${(w.count / m.maxWilaya) * 100}%` }} transition={{ duration: 0.7, delay: i * 0.04 }} />
                      </div>
                      <span className="text-xs font-bold text-dash-ink w-8 text-right">{w.count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-dash-ink font-bold text-sm">Rapport mensuel</p>
                <p className="text-dash-ink-soft text-xs mt-0.5">Résumé des performances du mois en cours (commandes, CA, retours, top wilayas).</p>
              </div>
              <button onClick={downloadReport}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-dash-surface transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, var(--color-dash-success), oklch(0.48 0.12 144))' }}>
                <FileDown size={15} /> Télécharger
              </button>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
