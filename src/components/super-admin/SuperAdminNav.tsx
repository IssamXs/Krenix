'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Store, CreditCard, Shield, Users, ScrollText } from 'lucide-react'

const NAV = [
  { href: '/super-admin',          label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: '/super-admin/stores',   label: 'Boutiques',      icon: Store },
  { href: '/super-admin/payments', label: 'Paiements',      icon: CreditCard },
  { href: '/super-admin/clients',  label: 'Clients',        icon: Users },
  { href: '/super-admin/audit',    label: 'Audit',          icon: ScrollText },
  { href: '/super-admin/security', label: 'Sécurité',       icon: Shield },
]

// Split out of the (server) layout so the current route can be highlighted.
// `mobile` renders a horizontal scrollable chip strip (used in the mobile
// top bar); the default is the dark-sidebar vertical nav.
export default function SuperAdminNav({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname()
  const isActive = (href: string) => (href === '/super-admin' ? pathname === href : pathname.startsWith(href))

  if (mobile) {
    return (
      <nav className="flex gap-1.5 overflow-x-auto px-3 py-2 dash-scroll">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                active ? 'bg-dash-accent text-white' : 'bg-dash-surface-2 text-dash-ink-soft'
              }`}
            >
              <Icon size={13} />
              {label}
            </Link>
          )
        })}
      </nav>
    )
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto dash-scroll-dark">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              active
                ? 'bg-dash-sidebar-active text-dash-sidebar-ink'
                : 'text-dash-sidebar-ink-soft hover:text-dash-sidebar-ink hover:bg-white/5'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-dash-gold" />
            )}
            <Icon size={16} className={active ? 'text-dash-gold' : ''} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
