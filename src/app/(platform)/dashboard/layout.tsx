'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Store } from '@/types/database'
import {
  LayoutDashboard, Package, ShoppingCart, Settings, LogOut,
  Menu, X, CreditCard, FileText, Sparkles, ChevronRight, TrendingUp,
  Palette, BarChart2, Puzzle, Users, MessageCircle, UserPlus
} from 'lucide-react'
import NovaluxLogo from '@/components/ui/NovaluxLogo'

const NAV_ALWAYS = [
  { href: '/dashboard',          icon: LayoutDashboard, label: "Vue d'ensemble" },
  { href: '/dashboard/products', icon: Package,          label: 'Produits'       },
  { href: '/dashboard/orders',   icon: ShoppingCart,     label: 'Commandes'      },
  { href: '/dashboard/leads',    icon: Users,            label: 'Leads'          },
  { href: '/dashboard/pages',    icon: FileText,         label: 'Landing Pages'  },
  { href: '/dashboard/settings/chatbot', icon: MessageCircle, label: 'Chatbot'    },
  { href: '/dashboard/finance',  icon: TrendingUp,       label: 'Finances'       },
  { href: '/dashboard/themes',   icon: Palette,          label: 'Thèmes'         },
]

const NAV_PRO = [
  { href: '/dashboard/analytics',    icon: BarChart2, label: 'Analytiques'  },
  { href: '/dashboard/integrations', icon: Puzzle,    label: 'Intégrations' },
]

const NAV_BOTTOM = [
  { href: '/dashboard/settings/team', icon: UserPlus,   label: 'Équipe'     },
  { href: '/dashboard/settings',      icon: Settings,   label: 'Paramètres' },
  { href: '/dashboard/billing',       icon: CreditCard, label: 'Abonnement' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      supabase
        .from('stores')
        .select('*')
        .eq('owner_id', user.id)
        .single()
        .then(({ data }) => {
          if (!data) { router.push('/onboarding/step-1'); return }
          setStore(data as Store)
        })

      // Count pending orders
      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then(({ count }) => setPendingOrders(count ?? 0))
    })
  }, [router])

  const handleLogout = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }, [router])

  const PLAN_BADGE: Record<string, string> = {
    basic:      'bg-gray-500/20 text-gray-400',
    pro:        'bg-blue-500/20 text-blue-400',
    ultimate:   'bg-amber-500/20 text-amber-400',
    growth:     'bg-emerald-500/20 text-emerald-400',
    business:   'bg-purple-500/20 text-purple-400',
    agency:     'bg-red-500/20 text-red-400',
    enterprise: 'bg-yellow-500/20 text-yellow-400',
    sur_mesure: 'bg-purple-500/20 text-purple-400',
  }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <aside className={`${
      mobile
        ? 'fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ' + (sideOpen ? 'translate-x-0' : '-translate-x-full')
        : 'hidden lg:flex w-64 flex-col flex-shrink-0'
    } bg-[#111118] border-r border-white/5 flex flex-col`}>

      {/* Header */}
      <div className="h-16 flex items-center px-5 border-b border-white/5 gap-3">
        <NovaluxLogo compact height={22} color="#3B82F6" className="flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-white font-bold text-sm truncate">{store?.name || 'Novalux'}</p>
          {store && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${PLAN_BADGE[store.plan] ?? PLAN_BADGE.basic}`}>
              {store.plan}
            </span>
          )}
        </div>
        {mobile && (
          <button onClick={() => setSideOpen(false)} className="text-gray-500 hover:text-white">
            <X size={18} />
          </button>
        )}
      </div>

      {/* Credits bar */}
      {store && (
        <div className="px-4 py-3 border-b border-white/5">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#3B82F6]" />
              <span className="text-xs text-gray-400">Crédits IA</span>
            </div>
            <span className="text-xs font-bold text-white">{store.ai_credits}</span>
          </div>
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#3B82F6] to-[#2563EB] rounded-full transition-all"
              style={{ width: `${Math.min(100, (store.ai_credits / (store.plan === 'ultimate' ? 100 : store.plan === 'pro' ? 20 : 5)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {(() => {
        const navItems = [
          ...NAV_ALWAYS,
          ...NAV_PRO.map(item => ({
            ...item,
            locked: false,
          })),
          ...NAV_BOTTOM,
        ]
        // Highlight only the most specific match (longest matching href), so a
        // parent like /dashboard/settings doesn't light up on a child route.
        const activeHref = navItems
          .filter(n => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href + '/')))
          .sort((a, b) => b.href.length - a.href.length)[0]?.href
        return navItems.map(({ href, icon: Icon, label, locked }: { href: string; icon: React.ElementType; label: string; locked?: boolean }) => {
          const active = href === activeHref
          const isOrders = href === '/dashboard/orders'
          const count = isOrders ? pendingOrders : 0
          return (
            <Link
              key={href}
              href={locked ? '/dashboard/billing/upgrade' : href}
              onClick={() => setSideOpen(false)}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-[#3B82F6]/10 text-[#3B82F6] border border-[#3B82F6]/20'
                  : locked
                    ? 'text-gray-600 hover:bg-white/3'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={16} />
                <span>{label}</span>
              </div>
              {count > 0 && (
                <span className="flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-bold text-black bg-[#3B82F6] rounded-full">
                  {count}
                </span>
              )}
              {locked && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-semibold">Pro</span>
              )}
            </Link>
          )
        })
        })()}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/5 space-y-1">
        {store?.slug && (
          <a
            href={
              process.env.NODE_ENV === 'production'
                ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'novalux.com'}`
                : `/store?store=${store.slug}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-gray-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <ChevronRight size={14} />
            Voir ma boutique
          </a>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <LogOut size={16} />
          Déconnexion
        </button>
      </div>
    </aside>
  )

  return (
    <div className="flex h-screen bg-[#0A0A0F] overflow-hidden">
      <Sidebar />
      {sideOpen && (
        <>
          <Sidebar mobile />
          <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setSideOpen(false)} />
        </>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 flex items-center px-6 border-b border-white/5 bg-[#111118] flex-shrink-0 gap-4">
          <button className="lg:hidden text-gray-400 hover:text-white" onClick={() => setSideOpen(true)}>
            <Menu size={22} />
          </button>
          <h1 className="text-white font-semibold text-sm flex-1">
            {[...NAV_ALWAYS, ...NAV_PRO, ...NAV_BOTTOM].find(n => n.href === pathname)?.label ??
             [...NAV_ALWAYS, ...NAV_PRO, ...NAV_BOTTOM].find(n => n.href !== '/dashboard' && pathname.startsWith(n.href))?.label ??
             'Tableau de bord'}
          </h1>
          {store && (() => {
            const MAX: Record<string, number> = {
              basic: 5, pro: 20, ultimate: 100, growth: 200,
              business: 400, agency: 800, enterprise: 1500, sur_mesure: 999,
            }
            const max = MAX[store.plan] ?? 5
            const pct = store.ai_credits / max
            const color = store.ai_credits < 5 ? '#EF4444' : pct < 0.3 ? '#F59E0B' : '#10B981'
            return (
              <a href="/dashboard/billing"
                className="hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-white/5"
                style={{ color }}>
                <Sparkles size={12} style={{ color }} />
                <span>
                  <span className="font-bold" style={{ color }}>{store.ai_credits}</span>
                  <span className="text-gray-500"> crédits restants</span>
                </span>
              </a>
            )
          })()}
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 text-white">
          {children}
        </main>
      </div>
    </div>
  )
}
