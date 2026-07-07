import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LayoutDashboard, Store, CreditCard, LogOut, Shield, Users, ScrollText } from 'lucide-react'

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: superAdmin } = await supabase
    .from('super_admins')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!superAdmin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-[#0A0A0F] flex">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 bg-[#111118] border-r border-white/5 flex flex-col">
        <div className="px-5 py-5 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Shield size={14} className="text-red-400" />
            </div>
            <div>
              <p className="text-white font-bold text-sm">Super Admin</p>
              <p className="text-gray-500 text-xs">Krenix</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {[
            { href: '/super-admin', label: 'Vue d\'ensemble', icon: LayoutDashboard },
            { href: '/super-admin/stores', label: 'Boutiques', icon: Store },
            { href: '/super-admin/payments', label: 'Paiements', icon: CreditCard },
            { href: '/super-admin/clients', label: 'Clients', icon: Users },
            { href: '/super-admin/audit', label: 'Audit', icon: ScrollText },
            { href: '/super-admin/security', label: 'Sécurité (2FA)', icon: Shield },
          ].map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm"
            >
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-white/5">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-500 hover:text-white hover:bg-white/5 transition-all text-sm"
          >
            <LogOut size={16} />
            Retour dashboard
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  )
}
