'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store, Product } from '@/types/database'
import {
  TrendingUp, Package,
  Loader2, Save, RotateCcw, ShoppingBag, Percent,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

interface FinancialSettings {
  returnFee: number
  purchasePrices: Record<string, number>
  adsBudgets: Record<string, number>
  globalAdsBudget: number
}

interface ProductSoldStats {
  product_id: string
  delivered_orders: number
  units_sold: number
  delivered_revenue: number
}

interface OrderStatsRow {
  total_orders: number
  returned_orders: number
  delivered_orders: number
  delivered_revenue: number
  delivered_margin_revenue: number
  active_revenue: number
}

const DEFAULT_FS: FinancialSettings = {
  returnFee: 400,
  purchasePrices: {},
  adsBudgets: {},
  globalAdsBudget: 0,
}

// Section reveal-on-appear animation (shared).
import { inViewReveal as reveal } from '@/lib/dashboard-motion'
import { useI18n } from '@/lib/i18n/LocaleProvider'

export default function FinancePage() {
  const { t } = useI18n()
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orderStats, setOrderStats] = useState<OrderStatsRow | null>(null)
  const [productStatsRows, setProductStatsRows] = useState<ProductSoldStats[]>([])
  const [fs, setFs] = useState<FinancialSettings>(DEFAULT_FS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showSettings, setShowSettings] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const storeData = await resolveActiveStore(supabase, user.id) as Store | null
      if (!storeData) { router.push('/onboarding/step-1'); return }

      const [{ data: productsData }, { data: orderStatsData }, { data: productStats }] = await Promise.all([
        supabase.from('products').select('*').eq('store_id', storeData.id),
        supabase.from('store_order_stats').select('*').eq('store_id', storeData.id).maybeSingle(),
        supabase.from('store_product_stats').select('*').eq('store_id', storeData.id),
      ])

      setStore(storeData as Store)
      setProducts((productsData ?? []) as Product[])
      setOrderStats((orderStatsData ?? null) as OrderStatsRow | null)
      setProductStatsRows((productStats ?? []) as ProductSoldStats[])

      const existingFs = storeData.settings?.financialSettings
      if (existingFs) setFs({ ...DEFAULT_FS, ...existingFs })

      setLoading(false)
    })
  }, [router])

  // ── KPI Calculations (server-side aggregates from 054 views) ─────────────
  const deliveredCount = orderStats?.delivered_orders ?? 0
  const returnedCount  = orderStats?.returned_orders ?? 0

  // delivered_revenue counts only delivered orders (matches the old client math).
  const deliveredRevenue = Number(orderStats?.delivered_margin_revenue ?? 0)

  // COGS = purchase price × delivered units, aggregated per product.
  const cogs = productStatsRows.reduce((s, r) => s + (fs.purchasePrices[r.product_id] ?? 0) * r.units_sold, 0)

  const totalAds    = Object.values(fs.adsBudgets).reduce((s, v) => s + (v || 0), 0) + (fs.globalAdsBudget || 0)
  const returnsCost = returnedCount * fs.returnFee
  const netProfit   = deliveredRevenue - cogs - totalAds - returnsCost
  const marginRate  = deliveredRevenue > 0 ? (netProfit / deliveredRevenue) * 100 : 0

  // Per-product stats: catalog (for the settings table) joined with the
  // delivered-sales aggregates so no full orders download is needed.
  const soldMap = new Map(productStatsRows.map(r => [r.product_id, r]))
  const productStats = products.map(p => {
    const sold       = soldMap.get(p.id)
    const unitsSold  = sold?.units_sold ?? 0
    const revenue    = Number(sold?.delivered_revenue ?? 0)
    const costTotal  = (fs.purchasePrices[p.id] ?? 0) * unitsSold
    const ads        = fs.adsBudgets[p.id] ?? 0
    const profit     = revenue - costTotal - ads
    const margin     = revenue > 0 ? (profit / revenue) * 100 : 0
    return { product: p, unitsSold, revenue, costTotal, ads, profit, margin }
  }).sort((a, b) => b.revenue - a.revenue)

  const handleSave = async () => {
    if (!store) return
    setSaving(true)
    const supabase = createClient()
    await supabase.from('stores').update({
      settings: { ...store.settings, financialSettings: fs },
    }).eq('id', store.id)
    setStore(s => s ? { ...s, settings: { ...s.settings, financialSettings: fs } } : s)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const setPurchasePrice = (productId: string, val: string) =>
    setFs(f => ({ ...f, purchasePrices: { ...f.purchasePrices, [productId]: Number(val) || 0 } }))

  const setAdsBudget = (productId: string, val: string) =>
    setFs(f => ({ ...f, adsBudgets: { ...f.adsBudgets, [productId]: Number(val) || 0 } }))

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-dash-accent border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const inputCls = "w-full px-3 py-2 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink text-sm placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all"

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">{t('finance.title')}</h1>
        <p className="text-dash-ink-soft text-sm mt-1">{t('finance.subtitle')}</p>
      </div>

      {saved && (
        <div className="bg-dash-success-soft border border-dash-success/20 text-dash-success text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <Save size={14} /> {t('finance.savedNotice')}
        </div>
      )}

      {/* KPI cards */}
      <motion.div {...reveal} className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: t('finance.kpiRevenue'), value: deliveredRevenue, icon: ShoppingBag,  color: 'text-dash-success',      bg: 'bg-dash-success-soft', prefix: '+' },
          { label: t('finance.kpiCogs'),    value: cogs,             icon: Package,       color: 'text-dash-danger',       bg: 'bg-dash-danger-soft',  prefix: '-' },
          { label: t('finance.kpiAds'),     value: totalAds,         icon: TrendingUp,    color: 'text-dash-warning-dark', bg: 'bg-dash-warning-soft', prefix: '-' },
          { label: t('finance.kpiReturns'), value: returnsCost,      icon: RotateCcw,     color: 'text-dash-danger',       bg: 'bg-dash-danger-soft',  prefix: '-' },
        ].map(({ label, value, icon: Icon, color, bg, prefix }) => (
          <div key={label} className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3 hover:border-dash-ink-faint/30 transition-all">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg} ${color}`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-dash-ink-soft text-xs uppercase tracking-wider">{label}</p>
              <p className={`text-lg font-bold mt-1 ${value > 0 ? color : 'text-dash-ink-faint'}`}>
                {prefix} {value.toLocaleString('fr-DZ')} DA
              </p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Net profit hero */}
      <motion.div {...reveal} className={`rounded-[20px] p-6 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${netProfit >= 0 ? 'bg-dash-success-soft border-dash-success/20' : 'bg-dash-danger-soft border-dash-danger/20'}`}>
        <div>
          <p className="text-dash-ink-soft text-xs uppercase tracking-wider mb-1">{t('finance.netProfit')}</p>
          <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-dash-success' : 'text-dash-danger'}`}>
            {netProfit.toLocaleString('fr-DZ')} DA
          </p>
          <p className="text-dash-ink-soft text-xs mt-1">
            {t('finance.netProfitDetail', {
              count: deliveredCount,
              plural: deliveredCount !== 1 ? 's' : '',
              returnCount: returnedCount,
              returnPlural: returnedCount !== 1 ? 's' : '',
            })}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <Percent size={14} className="text-dash-ink-soft" />
            <p className="text-dash-ink-soft text-sm">{t('finance.marginRate')}</p>
          </div>
          <span className={`text-2xl font-bold px-4 py-1.5 rounded-xl ${marginRate >= 0 ? 'text-dash-success bg-dash-success-soft' : 'text-dash-danger bg-dash-danger-soft'}`}>
            {marginRate.toFixed(1)}%
          </span>
        </div>
      </motion.div>

      {/* Breakdown: formula */}
      <motion.div {...reveal} className="bg-dash-surface border border-dash-border rounded-[20px] p-5 space-y-3">
        <h3 className="text-dash-ink font-semibold text-sm">{t('finance.detailedCalc')}</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: t('finance.breakdownRevenue'), value: deliveredRevenue, sign: '+', color: 'text-dash-success' },
            { label: t('finance.breakdownCogs'),     value: cogs,             sign: '−', color: 'text-dash-danger' },
            { label: t('finance.breakdownAds'),      value: totalAds,         sign: '−', color: 'text-dash-danger' },
            { label: t('finance.breakdownReturns', { count: returnedCount, fee: fs.returnFee.toLocaleString('fr-DZ') }), value: returnsCost, sign: '−', color: 'text-dash-danger' },
          ].map(({ label, value, sign, color }) => (
            <div key={label} className="flex justify-between items-center border-b border-dash-border pb-2 last:border-b-0 last:pb-0">
              <span className="text-dash-ink-soft">{label}</span>
              <span className={`font-semibold ${color}`}>{sign} {value.toLocaleString('fr-DZ')} DA</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2 border-t border-dash-border">
            <span className="text-dash-ink font-semibold">{t('finance.netProfitLabel')}</span>
            <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-dash-success' : 'text-dash-danger'}`}>
              = {netProfit.toLocaleString('fr-DZ')} DA
            </span>
          </div>
        </div>
      </motion.div>

      {/* Per-product performance */}
      {productStats.some(p => p.unitsSold > 0) && (
        <motion.div {...reveal} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
          <div className="px-5 py-4 border-b border-dash-border">
            <h3 className="text-dash-ink font-semibold">{t('finance.productPerformance')}</h3>
            <p className="text-dash-ink-soft text-xs mt-0.5">{t('finance.deliveredOnly')}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dash-border">
                  {[t('finance.colProduct'), t('finance.colSold'), t('finance.colRevenue'), t('finance.colCogs'), t('finance.colAds'), t('finance.colProfit'), t('finance.colMargin')].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-dash-ink-soft uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-dash-border">
                {productStats.filter(p => p.unitsSold > 0).map(({ product, unitsSold, revenue, costTotal, ads, profit, margin }) => (
                  <tr key={product.id} className="hover:bg-dash-surface-2 transition-colors">
                    <td className="px-5 py-3 text-dash-ink font-medium max-w-[160px]">
                      <p className="truncate">{product.name}</p>
                      <p className="text-dash-ink-soft text-xs">{Number(product.price).toLocaleString('fr-DZ')} DA</p>
                    </td>
                    <td className="px-5 py-3 text-dash-ink-soft">{unitsSold}</td>
                    <td className="px-5 py-3 text-dash-success font-semibold whitespace-nowrap">{revenue.toLocaleString('fr-DZ')} DA</td>
                    <td className="px-5 py-3 text-dash-danger whitespace-nowrap">{costTotal.toLocaleString('fr-DZ')} DA</td>
                    <td className="px-5 py-3 text-dash-warning-dark whitespace-nowrap">{ads.toLocaleString('fr-DZ')} DA</td>
                    <td className={`px-5 py-3 font-semibold whitespace-nowrap ${profit >= 0 ? 'text-dash-success' : 'text-dash-danger'}`}>
                      {profit.toLocaleString('fr-DZ')} DA
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${margin >= 30 ? 'text-dash-success bg-dash-success-soft' : margin >= 15 ? 'text-dash-gold-dark bg-dash-gold-soft' : 'text-dash-danger bg-dash-danger-soft'}`}>
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Settings panel */}
      <motion.div {...reveal} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
        <button
          onClick={() => setShowSettings(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-dash-border hover:bg-dash-surface-2 transition-colors"
        >
          <div>
            <h3 className="text-dash-ink font-semibold text-left">{t('finance.financialSettings')}</h3>
            <p className="text-dash-ink-soft text-xs mt-0.5 text-left">{t('finance.financialSettingsHint')}</p>
          </div>
          {showSettings ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
        </button>

        {showSettings && (
          <div className="p-5 space-y-6">
            {/* Global settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('finance.returnFeeLabel')}</label>
                <input
                  type="number"
                  value={fs.returnFee}
                  onChange={e => setFs(f => ({ ...f, returnFee: Number(e.target.value) || 0 }))}
                  placeholder="400"
                  className={inputCls}
                />
                <p className="text-dash-ink-faint text-xs mt-1">{t('finance.returnFeeHint')}</p>
              </div>
              <div>
                <label className="block text-xs text-dash-ink-soft mb-2 uppercase tracking-wider">{t('finance.globalAdsLabel')}</label>
                <input
                  type="number"
                  value={fs.globalAdsBudget}
                  onChange={e => setFs(f => ({ ...f, globalAdsBudget: Number(e.target.value) || 0 }))}
                  placeholder="0"
                  className={inputCls}
                />
                <p className="text-dash-ink-faint text-xs mt-1">{t('finance.globalAdsHint')}</p>
              </div>
            </div>

            {/* Per-product settings */}
            {products.length > 0 && (
              <div>
                <h4 className="text-dash-ink-soft text-xs uppercase tracking-wider mb-3">{t('finance.perProductCosts')}</h4>
                <div className="space-y-3">
                  {products.map(p => (
                    <div key={p.id} className="bg-dash-surface-2 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        {p.images?.[0] && (
                          <img src={p.images[0]} alt={p.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-dash-ink text-sm font-medium truncate">{p.name}</p>
                          <p className="text-dash-ink-soft text-xs">{t('finance.salePrice', { price: Number(p.price).toLocaleString('fr-DZ'), stock: p.stock })}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-dash-ink-soft mb-1.5">{t('finance.purchasePriceLabel')}</label>
                          <input
                            type="number"
                            value={fs.purchasePrices[p.id] ?? ''}
                            onChange={e => setPurchasePrice(p.id, e.target.value)}
                            placeholder="0"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-dash-ink-soft mb-1.5">{t('finance.productAdsBudgetLabel')}</label>
                          <input
                            type="number"
                            value={fs.adsBudgets[p.id] ?? ''}
                            onChange={e => setAdsBudget(p.id, e.target.value)}
                            placeholder="0"
                            className={inputCls}
                          />
                        </div>
                      </div>
                      {/* Live margin preview */}
                      {fs.purchasePrices[p.id] > 0 && (
                        <div className="mt-2.5 flex items-center gap-2 text-xs">
                          <span className="text-dash-ink-soft">{t('finance.grossMarginPerUnitLabel')}</span>
                          <span className={`font-semibold ${(p.price - fs.purchasePrices[p.id]) > 0 ? 'text-dash-success' : 'text-dash-danger'}`}>
                            {t('finance.grossMarginPerUnit', {
                              value: (p.price - fs.purchasePrices[p.id]).toLocaleString('fr-DZ'),
                              percent: ((1 - fs.purchasePrices[p.id] / p.price) * 100).toFixed(0),
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {products.length === 0 && (
              <div className="flex items-center gap-2 text-dash-ink-soft text-sm">
                <AlertCircle size={14} />
                {t('finance.noProductsHint')}
              </div>
            )}
          </div>
        )}
      </motion.div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-dash-accent hover:bg-dash-accent-dark text-white transition-all hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} /> {t('finance.saveSettings')}</>}
      </button>
    </div>
  )
}
