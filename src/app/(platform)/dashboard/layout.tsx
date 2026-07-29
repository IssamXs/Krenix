'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import { AGENCY_PLANS, ULTIMATE_PLANS, type Plan, type Store } from '@/types/database'
import {
  LayoutDashboard, Package, ShoppingCart, Settings, LogOut,
  Menu, X, CreditCard, FileText, Sparkles, ChevronRight, TrendingUp,
  Palette, BarChart2, Puzzle, Users, MessageCircle, UserPlus, Contact, Building2, Plus, PlayCircle
} from 'lucide-react'
import DashboardLogo from '@/components/dashboard/ui/DashboardLogo'
import NotificationBell from '@/components/dashboard/NotificationBell'
import LanguageSwitcher from '@/components/dashboard/ui/LanguageSwitcher'
import QueryProvider from '@/components/dashboard/QueryProvider'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import type { Dictionary } from '@/lib/i18n/dictionaries/types'

// Nav item labels are i18n keys (resolved via t() at render time), not raw
// strings — this list is otherwise static so it stays outside the component.
const NAV_ALWAYS = [
  { href: '/dashboard',          icon: LayoutDashboard, key: 'overview' as const },
  { href: '/dashboard/products', icon: Package,          key: 'products' as const },
  { href: '/dashboard/orders',   icon: ShoppingCart,     key: 'orders' as const },
  { href: '/dashboard/leads',    icon: Users,            key: 'leads' as const },
  { href: '/dashboard/crm',      icon: Contact,          key: 'crm' as const },
  { href: '/dashboard/pages',    icon: FileText,         key: 'landingPages' as const },
  { href: '/dashboard/settings/chatbot', icon: MessageCircle, key: 'chatbot' as const },
  { href: '/dashboard/finance',  icon: TrendingUp,       key: 'finance' as const },
  { href: '/dashboard/themes',   icon: Palette,          key: 'themes' as const },
]

const NAV_PRO = [
  { href: '/dashboard/analytics',    icon: BarChart2, key: 'analytics' as const },
  { href: '/dashboard/integrations', icon: Puzzle,    key: 'integrations' as const },
]

const NAV_BOTTOM = [
  { href: '/dashboard/settings/team', icon: UserPlus,   key: 'team' as const },
  { href: '/dashboard/tutorial',      icon: PlayCircle, key: 'tutorial' as const },
  { href: '/dashboard/settings',      icon: Settings,   key: 'settings' as const },
  { href: '/dashboard/billing',       icon: CreditCard, key: 'billing' as const },
]

type NavKey = keyof Dictionary['nav']
type NavItem = { href: string; icon: React.ElementType; key: NavKey }

interface SidebarProps {
  store: Store | null
  navItems: NavItem[]
  activeHref: string | undefined
  pendingOrders: number
  sideOpen: boolean
  setSideOpen: (v: boolean) => void
  handleLogout: () => void
  getDisplayPlan: (store: Store | null) => string
  planBadge: Record<string, string>
  mobile?: boolean
}

// Extracted to module scope (was a closure inside DashboardLayout that got
// re-created every render) — react-hooks/static-components correctly flags
// that as resetting internal state on every render; a real top-level
// component fed by props doesn't have that problem.
function DashboardSidebar({
  store, navItems, activeHref, pendingOrders, sideOpen, setSideOpen, handleLogout, getDisplayPlan, planBadge, mobile = false,
}: SidebarProps) {
  const { t } = useI18n()
  return (
    <aside className={`${
      mobile
        ? 'fixed inset-y-0 start-0 z-50 w-72 transform transition-transform duration-300 ' + (sideOpen ? 'translate-x-0' : '-translate-x-full rtl:translate-x-full')
        : 'hidden lg:flex w-64 flex-col flex-shrink-0'
    } bg-dash-sidebar ${mobile ? 'border-e border-dash-sidebar-border' : ''} flex flex-col`}>

      <div className="flex items-center px-5 py-3.5 border-b border-dash-sidebar-border gap-3">
        {store?.settings?.whiteLabel?.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.settings.whiteLabel.logoUrl} alt="Logo" className="h-6 w-auto max-w-[110px] object-contain flex-shrink-0" />
        ) : (
          <DashboardLogo size={76} initial={(store?.settings?.whiteLabel?.platformName ?? store?.name ?? 'K').charAt(0).toUpperCase()} />
        )}
        <div className="flex-1 min-w-0">
          <p className="dash-font-sans text-dash-sidebar-ink font-bold text-sm truncate">{store?.name || store?.settings?.whiteLabel?.platformName || 'Krenix'}</p>
          {store && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wider ${planBadge[getDisplayPlan(store)] ?? planBadge.basic}`}>
              {getDisplayPlan(store)}
            </span>
          )}
        </div>
        {mobile && (
          <button onClick={() => setSideOpen(false)} className="text-dash-sidebar-ink-soft hover:text-dash-sidebar-ink">
            <X size={18} />
          </button>
        )}
      </div>

      {store && (
        <div className="px-4 py-3 border-b border-dash-sidebar-border">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-dash-gold" />
              <span className="text-xs text-dash-sidebar-ink-soft dash-font-sans">{t('nav.aiCredits')}</span>
            </div>
            <span className="text-xs font-bold text-dash-sidebar-ink dash-font-sans">{store.ai_credits}</span>
          </div>
          <div className="h-1 bg-dash-sidebar-border rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, var(--color-dash-accent), var(--color-dash-gold))' }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, (store.ai_credits / (store.plan === 'ultimate' ? 100 : store.plan === 'pro' ? 20 : 5)) * 100)}%` }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto dash-scroll-dark">
        {navItems.map(({ href, icon: Icon, key }) => {
          const active = href === activeHref
          const isOrders = href === '/dashboard/orders'
          const count = isOrders ? pendingOrders : 0
          return (
            <Link
              key={href}
              href={href}
              onClick={() => setSideOpen(false)}
              className="relative flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium dash-font-sans transition-colors duration-200"
            >
              {active && (
                <motion.span
                  layoutId={mobile ? 'dash-sidebar-active-mobile' : 'dash-sidebar-active'}
                  className="absolute inset-0 rounded-xl bg-dash-sidebar-active"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <div className={`relative z-10 flex items-center gap-3 ${active ? 'text-dash-sidebar-ink' : 'text-dash-sidebar-ink-soft hover:text-dash-sidebar-ink'}`}>
                <Icon size={16} />
                <span>{t(`nav.${key}`)}</span>
              </div>
              {count > 0 && (
                <span className="relative z-10 flex items-center justify-center h-5 min-w-[20px] px-1.5 text-[10px] font-bold text-dash-ink bg-dash-gold rounded-full">
                  {count}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-dash-sidebar-border space-y-1">
        {store?.slug && (
          <a
            href={
              process.env.NODE_ENV === 'production'
                ? `https://${store.slug}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'krenix.store'}`
                : `/store?store=${store.slug}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-dash-sidebar-ink-soft hover:text-dash-sidebar-ink hover:bg-white/5 transition-all dash-font-sans"
          >
            <ChevronRight size={14} className="rtl:rotate-180" />
            {t('nav.viewStore')}
          </a>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium text-dash-danger hover:bg-dash-danger/10 transition-colors dash-font-sans"
        >
          <LogOut size={16} />
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const pathname = usePathname()
  const router = useRouter()
  const [store, setStore] = useState<Store | null>(null)
  const [sideOpen, setSideOpen] = useState(false)
  const [pendingOrders, setPendingOrders] = useState(0)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const active = await resolveActiveStore(supabase, user.id)

      const { data: superAdmin } = await supabase.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
      const isSuperAdmin = !!superAdmin

      if (!active) { router.push('/onboarding/step-1'); return }
      if (!isSuperAdmin && (active as unknown as Store).subscription_status !== 'active') { router.push('/activate'); return }

      const { data: primary } = await supabase
        .from('stores').select('ai_credits, purchased_credits')
        .eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
      const activeStore = active as unknown as Store
      const pooled = ((primary?.ai_credits as number | undefined) ?? activeStore.ai_credits ?? 0)
        + ((primary?.purchased_credits as number | undefined) ?? 0)
      setStore({ ...activeStore, ai_credits: pooled })

      supabase
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('store_id', active.id as string)
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
    basic:      'bg-dash-surface-2 text-dash-ink-soft',
    pro:        'bg-dash-info-soft text-dash-info',
    ultimate:   'bg-dash-gold-soft text-dash-gold-dark',
    growth:     'bg-dash-success-soft text-dash-success',
    business:   'bg-dash-purple-soft text-dash-purple',
    agency:     'bg-dash-danger-soft text-dash-danger',
    enterprise: 'bg-dash-gold-soft text-dash-gold-dark',
    sur_mesure: 'bg-dash-purple-soft text-dash-purple',
  }

  const getDisplayPlan = (store: Store | null) => {
    if (!store) return 'basic'
    if (store.plan !== 'sur_mesure') return store.plan
    const credits = store.ai_credits ?? 0
    if (credits >= 1500) return 'enterprise'
    if (credits >= 800) return 'agency'
    if (credits >= 400) return 'business'
    if (credits >= 200) return 'growth'
    return 'sur_mesure'
  }

  const navItems: NavItem[] = [
    ...NAV_ALWAYS,
    ...(store && AGENCY_PLANS.includes(store.plan as Plan)
      ? [{ href: '/dashboard/agency', icon: Building2, key: 'agency' as const }]
      : []),
    ...NAV_PRO,
    ...NAV_BOTTOM,
  ]
  const activeHref = navItems
    .filter(n => pathname === n.href || (n.href !== '/dashboard' && pathname.startsWith(n.href + '/')))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href

  const sidebarProps: SidebarProps = {
    store, navItems, activeHref, pendingOrders, sideOpen, setSideOpen, handleLogout, getDisplayPlan, planBadge: PLAN_BADGE,
  }

  return (
    <QueryProvider>
    <div className="flex h-screen bg-dash-page overflow-hidden dash-font-sans">
      <DashboardSidebar {...sidebarProps} />
      {/* Soft colour bridge between the dark sidebar and the light content pane,
          instead of a hard sidebar-black -> page-white cut. Flex sibling (not
          absolutely positioned) so it stays correctly placed in RTL, where the
          sidebar visually sits on the other side. Desktop only — the mobile
          sidebar is a floating overlay, not adjacent to content. */}
      <div aria-hidden="true" className="hidden lg:block w-8 flex-shrink-0 bg-gradient-to-r rtl:bg-gradient-to-l from-[var(--color-dash-sidebar)] to-[var(--color-dash-page)]" />
      <AnimatePresence>
        {sideOpen && (
          <>
            <DashboardSidebar {...sidebarProps} mobile />
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 lg:hidden"
              onClick={() => setSideOpen(false)}
            />
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 flex items-center px-6 border-b border-dash-border bg-dash-surface flex-shrink-0 gap-4">
          <button className="lg:hidden text-dash-ink-soft hover:text-dash-ink" onClick={() => setSideOpen(true)}>
            <Menu size={22} />
          </button>
          <h1 className="text-dash-ink font-semibold text-sm flex-1">
            {(() => {
              const all = [...NAV_ALWAYS, ...NAV_PRO, ...NAV_BOTTOM]
              const match = all.find(n => n.href === pathname) ?? all.find(n => n.href !== '/dashboard' && pathname.startsWith(n.href))
              return match ? t(`nav.${match.key}`) : t('nav.dashboardTitleFallback')
            })()}
          </h1>
          <LanguageSwitcher />
          {store && (() => {
            const MAX: Record<string, number> = {
              basic: 5, pro: 20, ultimate: 100, growth: 200,
              business: 400, agency: 800, enterprise: 1500, sur_mesure: 999,
            }
            const max = MAX[store.plan] ?? 5
            const pct = store.ai_credits / max
            const colorClass = store.ai_credits < 5 ? 'text-dash-danger' : pct < 0.3 ? 'text-dash-warning-dark' : 'text-dash-success'
            const canTopUp = ULTIMATE_PLANS.includes(store.plan as Plan)
            return (
              <div className="flex items-center gap-2">
                <a href={canTopUp ? '/dashboard/billing/credits' : '/dashboard/billing'}
                  className={`hidden sm:flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg transition-all hover:bg-dash-surface-2 ${colorClass}`}>
                  <Sparkles size={12} className={colorClass} />
                  <span>
                    <span className={`font-bold ${colorClass}`}>{store.ai_credits}</span>
                    <span className="text-dash-ink-faint"> {t('common.credits')}</span>
                  </span>
                </a>
                {canTopUp && (
                  <Link href="/dashboard/billing/credits"
                    className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-dash-surface transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, var(--color-dash-accent), var(--color-dash-accent-dark))' }}>
                    <Plus size={13} /> <span className="hidden sm:inline">{t('common.topUp')}</span>
                  </Link>
                )}

                <div className="w-px h-6 bg-dash-border mx-2 hidden sm:block" />
                <NotificationBell />
              </div>
            )
          })()}
        </header>

        <main className="flex-1 overflow-auto p-4 md:p-6 text-dash-ink dash-scroll">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
    </QueryProvider>
  )
}
