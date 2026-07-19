import { createClient } from '@/lib/supabase/server'
import { Store, CreditCard, ShoppingBag } from 'lucide-react'
import Link from 'next/link'
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
    { label: 'Boutiques actives', value: totalStores ?? 0, icon: Store, color: 'text-dash-info', bg: 'bg-dash-info-soft', href: '/super-admin/stores' },
    { label: 'Paiements en attente', value: pendingPayments ?? 0, icon: CreditCard, color: 'text-dash-gold-dark', bg: 'bg-dash-gold-soft', href: '/super-admin/payments' },
    { label: 'Commandes totales', value: totalOrders ?? 0, icon: ShoppingBag, color: 'text-dash-success', bg: 'bg-dash-success-soft' },
  ]

  const PLAN_COLORS: Record<string, string> = {
    basic: 'text-dash-ink-soft bg-dash-surface-2',
    pro: 'text-dash-info bg-dash-info-soft',
    ultimate: 'text-dash-gold-dark bg-dash-gold-soft',
    sur_mesure: 'text-dash-purple bg-dash-purple-soft',
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Vue d&apos;ensemble</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Tableau de bord Krenix — {new Date().toLocaleDateString('fr-DZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map(({ label, value, icon: Icon, color, bg, href }) => {
          const CardContent = (
            <>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${bg}`}>
                <Icon size={22} className={color} />
              </div>
              <div className="flex-1">
                <p className="dash-font-heading text-[26px] text-dash-ink">{value.toLocaleString()}</p>
                <p className="text-dash-ink-soft text-xs mt-0.5">{label}</p>
              </div>
              {href && <div className="text-dash-ink-faint group-hover:text-dash-ink transition-colors duration-200">→</div>}
            </>
          )

          const cardClasses = `bg-dash-surface border border-dash-border rounded-[20px] p-5 flex items-center gap-4 transition-all duration-200 ${href ? 'hover:border-dash-ink-faint/30 hover:-translate-y-0.5 group cursor-pointer' : ''}`

          if (href) {
            return (
              <Link key={label} href={href} className={cardClasses}>
                {CardContent}
              </Link>
            )
          }

          return (
            <div key={label} className={cardClasses}>
              {CardContent}
            </div>
          )
        })}
      </div>

      {/* Recent stores */}
      <div className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
        <div className="px-5 sm:px-6 py-4 border-b border-dash-border flex items-center justify-between">
          <h2 className="text-dash-ink font-semibold text-sm">Boutiques récentes</h2>
          <a href="/super-admin/stores" className="text-dash-accent text-xs hover:opacity-80 transition-opacity">Voir tout →</a>
        </div>
        <div className="divide-y divide-dash-border">
          {(recentStores ?? []).map(store => (
            <Link key={store.id} href={`/super-admin/stores?highlight=${store.id}`} className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-3 hover:bg-dash-surface-2 transition-all group block">
              <div className="min-w-0">
                <p className="text-dash-ink text-sm font-medium group-hover:text-dash-accent transition-colors truncate">{store.name}</p>
                <p className="text-dash-ink-soft text-xs truncate">{store.slug}.krenix.store</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[store.plan]}`}>
                  {PLAN_LABELS[store.plan as keyof typeof PLAN_LABELS]}
                </span>
                <p className="text-dash-ink-faint text-xs hidden sm:block">{new Date(store.created_at).toLocaleDateString('fr-DZ')}</p>
              </div>
            </Link>
          ))}
          {!recentStores?.length && (
            <div className="px-6 py-8 text-center text-dash-ink-soft text-sm">Aucune boutique pour le moment.</div>
          )}
        </div>
      </div>
    </div>
  )
}
