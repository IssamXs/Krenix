'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Store, Order } from '@/types/database'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS } from '@/types/database'
import {
  ShoppingCart, Package, TrendingUp, Sparkles,
  ArrowRight, Plus, Clock, Eye
} from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [stats, setStats] = useState({ orders: 0, products: 0, revenue: 0, pending: 0 })
  const [recentOrders, setRecentOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }

      const { data: storeData } = await supabase
        .from('stores')
        .select('*')
        .eq('owner_id', user.id)
        .single()

      if (!storeData) { router.push('/onboarding/step-1'); return }
      setStore(storeData as Store)

      const storeId = storeData.id

      const [
        { count: ordersCount },
        { count: productsCount },
        { count: pendingCount },
        { data: ordersData },
        { data: revenueData },
      ] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('products').select('id', { count: 'exact', head: true }).eq('store_id', storeId),
        supabase.from('orders').select('id', { count: 'exact', head: true }).eq('store_id', storeId).eq('status', 'pending'),
        supabase.from('orders').select('*').eq('store_id', storeId).order('created_at', { ascending: false }).limit(5),
        supabase.from('orders').select('total_price').eq('store_id', storeId).not('status', 'in', '("annulee","retournee")'),
      ])

      const revenue = (revenueData ?? []).reduce((sum, o) => sum + (o.total_price ?? 0), 0)

      setStats({
        orders: ordersCount ?? 0,
        products: productsCount ?? 0,
        revenue,
        pending: pendingCount ?? 0,
      })
      setRecentOrders((ordersData ?? []) as Order[])
      setLoading(false)
    })
  }, [router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-[#3B82F6] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const STAT_CARDS = [
    { icon: ShoppingCart, label: 'Commandes', value: stats.orders, sub: `${stats.pending} en attente`, color: 'text-blue-400', bg: 'bg-blue-500/10', href: '/dashboard/orders' },
    { icon: TrendingUp, label: 'Chiffre d\'affaires', value: `${stats.revenue.toLocaleString('fr-DZ')} DA`, sub: 'Hors annulées', color: 'text-[#3B82F6]', bg: 'bg-[#3B82F6]/10', href: null },
    { icon: Package, label: 'Produits', value: stats.products, sub: 'Actifs', color: 'text-green-400', bg: 'bg-green-500/10', href: '/dashboard/products' },
    { icon: Sparkles, label: 'Crédits IA', value: store?.ai_credits ?? 0, sub: `Plan ${store?.plan ?? '—'}`, color: 'text-purple-400', bg: 'bg-purple-500/10', href: '/dashboard/billing' },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-white">
          Bonjour, <span className="text-[#3B82F6]">{store?.name}</span> 👋
        </h2>
        <p className="text-gray-500 text-sm mt-1">Voici un résumé de votre boutique.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STAT_CARDS.map(({ icon: Icon, label, value, sub, color, bg, href }) => (
          <div
            key={label}
            className={`bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-3 hover:border-white/10 transition-all ${href ? 'cursor-pointer' : ''}`}
            onClick={() => href && router.push(href)}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} ${color}`}>
              <Icon size={20} />
            </div>
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider">{label}</p>
              <p className="text-xl font-bold text-white mt-1">{value}</p>
              <p className="text-gray-600 text-xs mt-0.5">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent orders + quick actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-white/5 flex items-center justify-between">
            <h3 className="font-semibold text-white">Dernières commandes</h3>
            <Link href="/dashboard/orders" className="text-xs text-[#3B82F6] hover:text-[#93C5FD] transition-colors flex items-center gap-1">
              Voir tout <ArrowRight size={12} />
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-3 text-center px-6">
              <ShoppingCart size={32} className="text-gray-600" />
              <p className="text-gray-500 text-sm">Aucune commande pour l'instant</p>
              <p className="text-gray-600 text-xs">Partagez votre boutique pour recevoir vos premières commandes</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentOrders.map((order) => (
                <div key={order.id} className="px-5 py-4 flex items-center gap-4 hover:bg-white/2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{order.customer_name}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{order.wilaya} · {order.order_number}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[#3B82F6] text-sm font-semibold">{order.total_price?.toLocaleString('fr-DZ')} DA</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="space-y-3">
          <h3 className="font-semibold text-white text-sm">Actions rapides</h3>
          {[
            { icon: Plus, label: 'Ajouter un produit', href: '/dashboard/products/new', color: 'text-green-400', bg: 'bg-green-500/10' },
            { icon: Eye, label: 'Voir ma boutique', href: `/?store=${store?.slug}`, external: true, color: 'text-blue-400', bg: 'bg-blue-500/10' },
            { icon: Sparkles, label: 'Générer une landing page', href: '/dashboard/pages/new', color: 'text-purple-400', bg: 'bg-purple-500/10' },
            { icon: Clock, label: 'Commandes en attente', href: '/dashboard/orders', color: 'text-[#3B82F6]', bg: 'bg-[#3B82F6]/10', badge: stats.pending > 0 ? stats.pending : undefined },
          ].map(({ icon: Icon, label, href, external, color, bg, badge }) => (
            <Link
              key={href}
              href={href}
              target={external ? '_blank' : undefined}
              className="flex items-center gap-3 p-4 bg-[#111118] border border-white/5 rounded-xl hover:border-white/10 transition-all group"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${bg} ${color}`}>
                <Icon size={16} />
              </div>
              <span className="text-gray-300 text-sm group-hover:text-white transition-colors flex-1">{label}</span>
              {badge !== undefined && badge > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#3B82F6] text-black text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {badge}
                </span>
              )}
              <ArrowRight size={14} className="text-gray-600 group-hover:text-gray-400 transition-colors flex-shrink-0" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
