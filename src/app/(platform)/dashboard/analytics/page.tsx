'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Order, OrderStatus, OrderSource, Plan } from '@/types/database'
import { ORDER_SOURCE_LABELS, GROWTH_PLANS } from '@/types/database'
import { BarChart2, TrendingUp, Eye, ShoppingCart, Banknote, Loader2, Lock, FileDown, MapPin, ArrowUpRight, ArrowDownRight } from 'lucide-react'

type OrderRow = Pick<Order, 'status' | 'source' | 'total_price' | 'created_at' | 'wilaya'>
interface LandingRow { id: string; title: string; slug: string; views: number; orders_count: number }

// Statuses that count as realised revenue (order delivered).
const DELIVERED: OrderStatus = 'livree'

const STATUS_META: { key: OrderStatus; label: string; color: string }[] = [
  { key: 'pending',      label: 'En attente',      color: '#F59E0B' },
  { key: 'confirmed',    label: 'Confirmée',       color: '#3B82F6' },
  { key: 'chez_livreur', label: 'Chez le livreur', color: '#6366F1' },
  { key: 'en_livraison', label: 'En livraison',    color: '#8B5CF6' },
  { key: 'livree',       label: 'Livrée',          color: '#10B981' },
  { key: 'annulee',      label: 'Annulée',         color: '#EF4444' },
  { key: 'retournee',    label: 'Retournée',       color: '#9CA3AF' },
]

const DA = (n: number) => `${Math.round(n).toLocaleString('fr-DZ')} DA`

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="animate-spin text-[#3B82F6]" size={28} />
      </div>
    )
  }

  // ---- Derived metrics ----
  const totalViews = pages.reduce((s, p) => s + (p.views ?? 0), 0)
  const totalOrders = orders.length
  const revenue = orders.filter(o => o.status === DELIVERED).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const convRate = totalViews > 0 ? (totalOrders / totalViews) * 100 : 0

  const byStatus = STATUS_META.map(m => ({ ...m, count: orders.filter(o => o.status === m.key).length }))
  const maxStatus = Math.max(1, ...byStatus.map(s => s.count))

  const bySource = (Object.keys(ORDER_SOURCE_LABELS) as OrderSource[])
    .map(src => ({ src, label: ORDER_SOURCE_LABELS[src], count: orders.filter(o => o.source === src).length }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
  const maxSource = Math.max(1, ...bySource.map(s => s.count))

  const topPages = [...pages]
    .filter(p => p.views > 0 || p.orders_count > 0)
    .sort((a, b) => b.orders_count - a.orders_count)
    .slice(0, 5)

  // Last 7 days order counts (oldest → newest).
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - (6 - i))
    return d
  })
  const trend = days.map(d => {
    const next = new Date(d); next.setDate(d.getDate() + 1)
    const count = orders.filter(o => {
      const t = new Date(o.created_at).getTime()
      return t >= d.getTime() && t < next.getTime()
    }).length
    return { label: d.toLocaleDateString('fr-DZ', { weekday: 'short' }), count }
  })
  const maxTrend = Math.max(1, ...trend.map(t => t.count))

  // ---- Advanced (Growth+) ----
  const isGrowth = plan != null && GROWTH_PLANS.includes(plan)
  const deliveredOrders = orders.filter(o => o.status === DELIVERED)
  const aov = deliveredOrders.length > 0 ? revenue / deliveredOrders.length : 0
  const returnedCount = orders.filter(o => o.status === 'retournee').length
  const shippedCount = orders.filter(o => ['chez_livreur', 'en_livraison', 'livree', 'retournee'].includes(o.status)).length
  const returnRate = shippedCount > 0 ? (returnedCount / shippedCount) * 100 : 0

  // 30-day delivered-revenue trend
  const days30 = Array.from({ length: 30 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (29 - i)); return d })
  const revTrend = days30.map(d => {
    const next = new Date(d); next.setDate(d.getDate() + 1)
    const rev = deliveredOrders.filter(o => { const t = new Date(o.created_at).getTime(); return t >= d.getTime() && t < next.getTime() }).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
    return { d, rev }
  })
  const maxRev = Math.max(1, ...revTrend.map(r => r.rev))

  // Best wilayas by order count
  const wilayaMap = new Map<string, number>()
  orders.forEach(o => { if (o.wilaya) wilayaMap.set(o.wilaya, (wilayaMap.get(o.wilaya) ?? 0) + 1) })
  const topWilayas = [...wilayaMap.entries()].map(([wilaya, count]) => ({ wilaya, count })).sort((a, b) => b.count - a.count).slice(0, 6)
  const maxWilaya = Math.max(1, ...topWilayas.map(w => w.count))

  // Month-over-month
  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime()
  const inRange = (o: OrderRow, start: number, end: number) => { const t = new Date(o.created_at).getTime(); return t >= start && t < end }
  const thisMonthOrders = orders.filter(o => inRange(o, thisMonthStart, now.getTime() + 1))
  const lastMonthOrders = orders.filter(o => inRange(o, lastMonthStart, thisMonthStart))
  const thisMonthRev = thisMonthOrders.filter(o => o.status === DELIVERED).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const lastMonthRev = lastMonthOrders.filter(o => o.status === DELIVERED).reduce((s, o) => s + Number(o.total_price ?? 0), 0)
  const pct = (cur: number, prev: number) => prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0)
  const momOrders = pct(thisMonthOrders.length, lastMonthOrders.length)
  const momRev = pct(thisMonthRev, lastMonthRev)

  const downloadReport = () => {
    const monthLabel = now.toLocaleDateString('fr-DZ', { month: 'long', year: 'numeric' })
    const lines = [
      `RAPPORT MENSUEL — ${monthLabel}`,
      '========================================',
      '',
      `Commandes ce mois       : ${thisMonthOrders.length}`,
      `Chiffre d'affaires livré : ${DA(thisMonthRev)}`,
      `Panier moyen            : ${DA(aov)}`,
      `Taux de retour          : ${returnRate.toFixed(1)}%`,
      `Évolution commandes     : ${momOrders >= 0 ? '+' : ''}${momOrders.toFixed(0)}% vs mois dernier`,
      `Évolution CA            : ${momRev >= 0 ? '+' : ''}${momRev.toFixed(0)}% vs mois dernier`,
      '',
      'Top wilayas :',
      ...topWilayas.map(w => `  - ${w.wilaya} : ${w.count} commande(s)`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rapport-${monthLabel.replace(/\s/g, '-')}.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const metrics = [
    { label: 'Vues totales',       value: totalViews.toLocaleString('fr-DZ'), icon: Eye,          color: '#3B82F6' },
    { label: 'Commandes',          value: totalOrders.toLocaleString('fr-DZ'), icon: ShoppingCart, color: '#10B981' },
    { label: 'Taux de conversion', value: `${convRate.toFixed(1)}%`,           icon: TrendingUp,   color: '#F59E0B' },
    { label: "Chiffre d'affaires", value: DA(revenue),                         icon: Banknote,     color: '#8B5CF6' },
  ]

  const hasData = totalOrders > 0 || totalViews > 0

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Analytiques</h2>
        <p className="text-gray-500 text-sm mt-1">Performances de vos landing pages et de vos commandes</p>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metrics.map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#111118] border border-white/5 rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: `${color}15` }}>
              <Icon size={18} style={{ color }} />
            </div>
            <p className="text-2xl font-black text-white truncate">{value}</p>
            <p className="text-gray-500 text-xs mt-1">{label}</p>
          </div>
        ))}
      </div>

      {!hasData ? (
        <div className="bg-[#111118] border border-white/5 rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4" style={{ minHeight: 260 }}>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.1)' }}>
            <BarChart2 size={28} className="text-[#3B82F6]" />
          </div>
          <div>
            <p className="text-white font-bold text-lg">Pas encore de données</p>
            <p className="text-gray-500 text-sm mt-2 max-w-md">
              Dès que vos landing pages reçoivent des visites et des commandes, vos statistiques s&apos;affichent ici.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* 7-day order trend */}
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
            <p className="text-white font-semibold text-sm mb-4">Commandes — 7 derniers jours</p>
            <div className="flex items-end justify-between gap-2 h-32">
              {trend.map((t, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end justify-center" style={{ height: '100%' }}>
                    <div
                      className="w-full max-w-[36px] rounded-t-lg transition-all"
                      style={{ height: `${(t.count / maxTrend) * 100}%`, minHeight: t.count > 0 ? 6 : 2, background: t.count > 0 ? '#3B82F6' : 'rgba(255,255,255,0.06)' }}
                      title={`${t.count} commande${t.count !== 1 ? 's' : ''}`}
                    />
                  </div>
                  <span className="text-[10px] text-gray-500">{t.label}</span>
                  <span className="text-[11px] font-semibold text-white -mt-1">{t.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Orders by status */}
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
            <p className="text-white font-semibold text-sm mb-4">Commandes par statut</p>
            <div className="space-y-2.5">
              {byStatus.map(s => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-32 flex-shrink-0">{s.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(s.count / maxStatus) * 100}%`, background: s.color, minWidth: s.count > 0 ? 4 : 0 }} />
                  </div>
                  <span className="text-xs font-semibold text-white w-8 text-right">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Orders by source */}
          {bySource.length > 0 && (
            <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
              <p className="text-white font-semibold text-sm mb-4">Commandes par canal</p>
              <div className="space-y-2.5">
                {bySource.map(s => (
                  <div key={s.src} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-32 flex-shrink-0">{s.label}</span>
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${(s.count / maxSource) * 100}%`, minWidth: 4 }} />
                    </div>
                    <span className="text-xs font-semibold text-white w-8 text-right">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top landing pages */}
          {topPages.length > 0 && (
            <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
              <p className="text-white font-semibold text-sm mb-4">Meilleures landing pages</p>
              <div className="space-y-2">
                {topPages.map(p => {
                  const conv = p.views > 0 ? (p.orders_count / p.views) * 100 : 0
                  return (
                    <div key={p.id} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{p.title}</p>
                        <p className="text-gray-600 text-[11px] font-mono truncate">{p.slug}</p>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0 text-right">
                        <div>
                          <p className="text-white text-sm font-semibold">{p.views.toLocaleString('fr-DZ')}</p>
                          <p className="text-gray-600 text-[10px]">vues</p>
                        </div>
                        <div>
                          <p className="text-white text-sm font-semibold">{p.orders_count}</p>
                          <p className="text-gray-600 text-[10px]">cmd.</p>
                        </div>
                        <div className="w-12">
                          <p className="text-[#F59E0B] text-sm font-semibold">{conv.toFixed(1)}%</p>
                          <p className="text-gray-600 text-[10px]">conv.</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* ---- Advanced analytics (Growth+) ---- */}
      <div className="pt-2">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-white font-bold text-sm">Statistiques avancées</h3>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">GROWTH+</span>
        </div>

        {!isGrowth ? (
          <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-80">
            <Lock size={20} className="text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-white text-sm font-semibold">Panier moyen, taux de retour, tendance 30 j, meilleures wilayas, comparaison mensuelle & rapport</p>
              <p className="text-gray-500 text-xs">Disponible à partir du plan Growth</p>
            </div>
            <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981' }}>
              Passer à Growth
            </a>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Advanced metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Panier moyen', value: DA(aov) },
                { label: 'Taux de retour', value: `${returnRate.toFixed(1)}%` },
                { label: 'Commandes / mois', value: `${momOrders >= 0 ? '+' : ''}${momOrders.toFixed(0)}%`, up: momOrders >= 0 },
                { label: 'CA / mois', value: `${momRev >= 0 ? '+' : ''}${momRev.toFixed(0)}%`, up: momRev >= 0 },
              ].map((m, i) => (
                <div key={i} className="bg-[#111118] border border-white/5 rounded-2xl p-5">
                  <p className="text-2xl font-black text-white truncate flex items-center gap-1">
                    {m.value}
                    {'up' in m && (m.up ? <ArrowUpRight size={16} className="text-green-400" /> : <ArrowDownRight size={16} className="text-red-400" />)}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">{m.label}</p>
                </div>
              ))}
            </div>

            {/* 30-day revenue trend */}
            <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
              <p className="text-white font-semibold text-sm mb-4">Chiffre d&apos;affaires — 30 derniers jours</p>
              <div className="flex items-end gap-0.5 h-28">
                {revTrend.map((r, i) => (
                  <div key={i} className="flex-1 rounded-t transition-all" title={`${r.d.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' })} · ${DA(r.rev)}`}
                    style={{ height: `${(r.rev / maxRev) * 100}%`, minHeight: r.rev > 0 ? 4 : 2, background: r.rev > 0 ? '#8B5CF6' : 'rgba(255,255,255,0.06)' }} />
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-gray-600 mt-2">
                <span>{revTrend[0]?.d.toLocaleDateString('fr-DZ', { day: '2-digit', month: 'short' })}</span>
                <span>Aujourd&apos;hui</span>
              </div>
            </div>

            {/* Best wilayas */}
            {topWilayas.length > 0 && (
              <div className="bg-[#111118] border border-white/5 rounded-2xl p-5">
                <p className="text-white font-semibold text-sm mb-4 flex items-center gap-2"><MapPin size={14} className="text-[#3B82F6]" /> Meilleures wilayas</p>
                <div className="space-y-2.5">
                  {topWilayas.map(w => (
                    <div key={w.wilaya} className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-28 flex-shrink-0 truncate">{w.wilaya}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                        <div className="h-full rounded-full bg-[#3B82F6]" style={{ width: `${(w.count / maxWilaya) * 100}%`, minWidth: 4 }} />
                      </div>
                      <span className="text-xs font-semibold text-white w-8 text-right">{w.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly report */}
            <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Rapport mensuel</p>
                <p className="text-gray-500 text-xs mt-0.5">Résumé des performances du mois en cours (commandes, CA, retours, top wilayas).</p>
              </div>
              <button onClick={downloadReport}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}>
                <FileDown size={15} /> Télécharger
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
