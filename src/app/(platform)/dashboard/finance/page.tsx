'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { Store, Product, Order } from '@/types/database'
import {
  TrendingUp, TrendingDown, DollarSign, Package,
  Loader2, Save, RotateCcw, ShoppingBag, Percent,
  AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react'

interface FinancialSettings {
  returnFee: number
  purchasePrices: Record<string, number>
  adsBudgets: Record<string, number>
  globalAdsBudget: number
}

const DEFAULT_FS: FinancialSettings = {
  returnFee: 400,
  purchasePrices: {},
  adsBudgets: {},
  globalAdsBudget: 0,
}

export default function FinancePage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
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

      const [{ data: productsData }, { data: ordersData }] = await Promise.all([
        supabase.from('products').select('*').eq('store_id', storeData.id),
        supabase.from('orders').select('*').eq('store_id', storeData.id),
      ])

      setStore(storeData as Store)
      setProducts((productsData ?? []) as Product[])
      setOrders((ordersData ?? []) as Order[])

      const existingFs = storeData.settings?.financialSettings
      if (existingFs) setFs({ ...DEFAULT_FS, ...existingFs })

      setLoading(false)
    })
  }, [router])

  // ── KPI Calculations ──────────────────────────────────────────
  const deliveredOrders = orders.filter(o => o.status === 'livree')
  const returnedOrders  = orders.filter(o => o.status === 'retournee')
  const allActiveOrders = orders.filter(o => !['annulee', 'retournee'].includes(o.status))

  const deliveredRevenue = deliveredOrders.reduce((s, o) => s + (o.total_price - o.delivery_price), 0)
  const totalRevenue     = allActiveOrders.reduce((s, o) => s + o.total_price, 0)

  const cogs = deliveredOrders.reduce((s, o) => {
    if (!o.product_id) return s
    return s + (fs.purchasePrices[o.product_id] ?? 0) * o.quantity
  }, 0)

  const totalAds    = Object.values(fs.adsBudgets).reduce((s, v) => s + (v || 0), 0) + (fs.globalAdsBudget || 0)
  const returnsCost = returnedOrders.length * fs.returnFee
  const netProfit   = deliveredRevenue - cogs - totalAds - returnsCost
  const marginRate  = deliveredRevenue > 0 ? (netProfit / deliveredRevenue) * 100 : 0

  // Per-product stats
  const productStats = products.map(p => {
    const pOrders  = deliveredOrders.filter(o => o.product_id === p.id)
    const unitsSold = pOrders.reduce((s, o) => s + o.quantity, 0)
    const revenue   = pOrders.reduce((s, o) => s + (o.total_price - o.delivery_price), 0)
    const costTotal = (fs.purchasePrices[p.id] ?? 0) * unitsSold
    const ads       = fs.adsBudgets[p.id] ?? 0
    const profit    = revenue - costTotal - ads
    const margin    = revenue > 0 ? (profit / revenue) * 100 : 0
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
      <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const inputCls = "w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-sm placeholder-gray-600 outline-none focus:border-[#3B82F6]/50 transition-all"

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Finances & Marges</h2>
        <p className="text-gray-500 text-sm mt-1">Calcul de rentabilité basé sur vos commandes livrées.</p>
      </div>

      {saved && (
        <div className="bg-green-500/10 border border-green-500/20 text-green-400 text-sm px-4 py-3 rounded-xl flex items-center gap-2">
          <Save size={14} /> Paramètres enregistrés !
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'CA Produit (livré)', value: deliveredRevenue, icon: ShoppingBag,  color: 'text-green-400',  bg: 'bg-green-500/10',  prefix: '+' },
          { label: 'Coût d\'achat',      value: cogs,             icon: Package,       color: 'text-red-400',    bg: 'bg-red-500/10',    prefix: '-' },
          { label: 'Budget publicité',   value: totalAds,         icon: TrendingUp,    color: 'text-orange-400', bg: 'bg-orange-500/10', prefix: '-' },
          { label: 'Coût des retours',   value: returnsCost,      icon: RotateCcw,     color: 'text-red-400',    bg: 'bg-red-500/10',    prefix: '-' },
        ].map(({ label, value, icon: Icon, color, bg, prefix }) => (
          <div key={label} className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3 hover:border-white/10 transition-all">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${bg} ${color}`}>
              <Icon size={16} />
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase tracking-wider">{label}</p>
              <p className={`text-lg font-bold mt-1 ${value > 0 ? color : 'text-gray-600'}`}>
                {prefix} {value.toLocaleString('fr-DZ')} DA
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Net profit hero */}
      <div
        className="rounded-2xl p-6 border flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        style={{
          background: netProfit >= 0 ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
          borderColor: netProfit >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
        }}
      >
        <div>
          <p className="text-gray-500 text-xs uppercase tracking-wider mb-1">Bénéfice net estimé</p>
          <p className={`text-3xl font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {netProfit.toLocaleString('fr-DZ')} DA
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Sur {deliveredOrders.length} commande{deliveredOrders.length !== 1 ? 's' : ''} livrée{deliveredOrders.length !== 1 ? 's' : ''}{' '}
            · {returnedOrders.length} retour{returnedOrders.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex flex-col sm:items-end gap-2">
          <div className="flex items-center gap-2">
            <Percent size={14} className="text-gray-500" />
            <p className="text-gray-400 text-sm">Taux de marge</p>
          </div>
          <span
            className="text-2xl font-bold px-4 py-1.5 rounded-xl"
            style={{
              color: marginRate >= 0 ? '#22C55E' : '#EF4444',
              background: marginRate >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
            }}
          >
            {marginRate.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Breakdown: formula */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3">
        <h3 className="text-white font-medium text-sm">Calcul détaillé</h3>
        <div className="space-y-2 text-sm">
          {[
            { label: 'CA Produit (hors livraison)', value: deliveredRevenue, sign: '+', color: 'text-green-400' },
            { label: `Coût d'achat (COGS)`,          value: cogs,             sign: '−', color: 'text-red-400' },
            { label: 'Budget publicité',              value: totalAds,         sign: '−', color: 'text-red-400' },
            { label: `Coût retours (${returnedOrders.length} × ${fs.returnFee.toLocaleString('fr-DZ')} DA)`, value: returnsCost, sign: '−', color: 'text-red-400' },
          ].map(({ label, value, sign, color }) => (
            <div key={label} className="flex justify-between items-center border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
              <span className="text-gray-400">{label}</span>
              <span className={`font-semibold ${color}`}>{sign} {value.toLocaleString('fr-DZ')} DA</span>
            </div>
          ))}
          <div className="flex justify-between items-center pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <span className="text-white font-semibold">Bénéfice Net</span>
            <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              = {netProfit.toLocaleString('fr-DZ')} DA
            </span>
          </div>
        </div>
      </div>

      {/* Per-product performance */}
      {productStats.some(p => p.unitsSold > 0) && (
        <div className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <h3 className="text-white font-medium">Performance par produit</h3>
            <p className="text-gray-500 text-xs mt-0.5">Commandes livrées uniquement</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {['Produit', 'Vendus', 'CA', 'COGS', 'Pubs', 'Profit', 'Marge'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {productStats.filter(p => p.unitsSold > 0).map(({ product, unitsSold, revenue, costTotal, ads, profit, margin }) => (
                  <tr key={product.id} className="hover:bg-white/2 transition-colors">
                    <td className="px-5 py-3 text-white font-medium max-w-[160px]">
                      <p className="truncate">{product.name}</p>
                      <p className="text-gray-500 text-xs">{Number(product.price).toLocaleString('fr-DZ')} DA</p>
                    </td>
                    <td className="px-5 py-3 text-gray-300">{unitsSold}</td>
                    <td className="px-5 py-3 text-green-400 font-semibold whitespace-nowrap">{revenue.toLocaleString('fr-DZ')} DA</td>
                    <td className="px-5 py-3 text-red-400 whitespace-nowrap">{costTotal.toLocaleString('fr-DZ')} DA</td>
                    <td className="px-5 py-3 text-orange-400 whitespace-nowrap">{ads.toLocaleString('fr-DZ')} DA</td>
                    <td className={`px-5 py-3 font-semibold whitespace-nowrap ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {profit.toLocaleString('fr-DZ')} DA
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className="text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{
                          color: margin >= 30 ? '#22C55E' : margin >= 15 ? '#F59E0B' : '#EF4444',
                          background: margin >= 30 ? 'rgba(34,197,94,0.1)' : margin >= 15 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                        }}
                      >
                        {margin.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings panel */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowSettings(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 border-b border-white/5 hover:bg-white/2 transition-colors"
        >
          <div>
            <h3 className="text-white font-medium text-left">Paramètres financiers</h3>
            <p className="text-gray-500 text-xs mt-0.5 text-left">Renseignez vos coûts pour des calculs précis</p>
          </div>
          {showSettings ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
        </button>

        {showSettings && (
          <div className="p-5 space-y-6">
            {/* Global settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Frais de retour par colis (DZD)</label>
                <input
                  type="number"
                  value={fs.returnFee}
                  onChange={e => setFs(f => ({ ...f, returnFee: Number(e.target.value) || 0 }))}
                  placeholder="400"
                  className={inputCls}
                />
                <p className="text-gray-600 text-xs mt-1">Généralement 400–600 DA selon la société de livraison</p>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-2 uppercase tracking-wider">Autres pubs / budget global (DZD)</label>
                <input
                  type="number"
                  value={fs.globalAdsBudget}
                  onChange={e => setFs(f => ({ ...f, globalAdsBudget: Number(e.target.value) || 0 }))}
                  placeholder="0"
                  className={inputCls}
                />
                <p className="text-gray-600 text-xs mt-1">Pubs non liées à un produit spécifique</p>
              </div>
            </div>

            {/* Per-product settings */}
            {products.length > 0 && (
              <div>
                <h4 className="text-gray-400 text-xs uppercase tracking-wider mb-3">Coûts par produit</h4>
                <div className="space-y-3">
                  {products.map(p => (
                    <div key={p.id} className="bg-white/3 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        {p.images?.[0] && (
                          <img src={p.images[0]} alt={p.name} className="w-9 h-9 rounded-lg object-cover flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-white text-sm font-medium truncate">{p.name}</p>
                          <p className="text-gray-500 text-xs">Prix vente: {Number(p.price).toLocaleString('fr-DZ')} DA · Stock: {p.stock}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Prix d'achat / unité (DZD)</label>
                          <input
                            type="number"
                            value={fs.purchasePrices[p.id] ?? ''}
                            onChange={e => setPurchasePrice(p.id, e.target.value)}
                            placeholder="0"
                            className={inputCls}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1.5">Budget pubs total (DZD)</label>
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
                          <span className="text-gray-500">Marge brute / unité:</span>
                          <span
                            className="font-semibold"
                            style={{ color: (p.price - fs.purchasePrices[p.id]) > 0 ? '#22C55E' : '#EF4444' }}
                          >
                            {(p.price - fs.purchasePrices[p.id]).toLocaleString('fr-DZ')} DA
                            {' '}({((1 - fs.purchasePrices[p.id] / p.price) * 100).toFixed(0)}%)
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {products.length === 0 && (
              <div className="flex items-center gap-2 text-gray-500 text-sm">
                <AlertCircle size={14} />
                Ajoutez des produits pour configurer leurs coûts.
              </div>
            )}
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm bg-gradient-to-r from-[#3B82F6] to-[#2563EB] text-black transition-all hover:opacity-90 disabled:opacity-50"
      >
        {saving ? <Loader2 size={18} className="animate-spin" /> : <><Save size={16} /> Enregistrer les paramètres</>}
      </button>
    </div>
  )
}
