import { createClient } from '@/lib/supabase/server'
import { Store, CreditCard, ShoppingBag, Users } from 'lucide-react'
import { PLAN_LABELS } from '@/types/database'

export default async function SuperAdminOverview() {
  const supabase = await createClient()

  const [
    { count: totalStores },
    { count: pendingPayments },
    { count: totalOrders },
    { data: recentStores },
  ] = await Promise.all([
    supabase.from('stores').select('id', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('orders').select('id', { count: 'exact', head: true }),
    supabase.from('stores').select('id, name, slug, plan, subscription_status, created_at').order('created_at', { ascending: false }).limit(8),
  ])

  const stats = [
    { label: 'Boutiques actives', value: totalStores ?? 0, icon: Store, color: 'text-blue-400', bg: 'bg-blue-400/10' },
    { label: 'Paiements en attente', value: pendingPayments ?? 0, icon: CreditCard, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    { label: 'Commandes totales', value: totalOrders ?? 0, icon: ShoppingBag, color: 'text-green-400', bg: 'bg-green-400/10' },
  ]

  const PLAN_COLORS: Record<string, string> = {
    basic: 'text-gray-400 bg-gray-400/10',
    pro: 'text-blue-400 bg-blue-400/10',
    ultimate: 'text-amber-400 bg-amber-400/10',
    sur_mesure: 'text-purple-400 bg-purple-400/10',
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Vue d&apos;ensemble</h1>
        <p className="text-gray-500 text-sm mt-1">Tableau de bord Krenix — {new Date().toLocaleDateString('fr-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
              <Icon size={22} className={color} />
            </div>
            <div>
              <p className="text-2xl font-black text-white">{value.toLocaleString()}</p>
              <p className="text-gray-500 text-xs mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Recent stores */}
      <div className="bg-[#111118] border border-white/5 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-white font-semibold text-sm">Boutiques récentes</h2>
          <a href="/super-admin/stores" className="text-[#3B82F6] text-xs hover:text-[#93C5FD] transition-colors">Voir tout →</a>
        </div>
        <div className="divide-y divide-white/5">
          {(recentStores ?? []).map(store => (
            <div key={store.id} className="px-6 py-3.5 flex items-center justify-between hover:bg-white/2 transition-all">
              <div>
                <p className="text-white text-sm font-medium">{store.name}</p>
                <p className="text-gray-500 text-xs">{store.slug}.krenix.com</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[store.plan]}`}>
                  {PLAN_LABELS[store.plan as keyof typeof PLAN_LABELS]}
                </span>
                <p className="text-gray-600 text-xs">{new Date(store.created_at).toLocaleDateString('fr-DZ')}</p>
              </div>
            </div>
          ))}
          {!recentStores?.length && (
            <div className="px-6 py-8 text-center text-gray-500 text-sm">Aucune boutique pour le moment.</div>
          )}
        </div>
      </div>
    </div>
  )
}
