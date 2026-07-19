import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { LogOut, Shield } from 'lucide-react'
import crypto from 'crypto'
import { cookies, headers } from 'next/headers'
import SuperAdminNotifications from '@/components/super-admin/SuperAdminNotifications'
import SuperAdminNav from '@/components/super-admin/SuperAdminNav'
import KrenixLogo from '@/components/ui/KrenixLogo'

async function verifyBackupSessionNode(cookieValue: string | null | undefined, userId: string): Promise<boolean> {
  const s = process.env.SUPERADMIN_STEPUP_SECRET
  if (!cookieValue || !s) return false
  const [expiryStr, sig] = cookieValue.split('.')
  if (!expiryStr || !sig) return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false
  
  const expected = crypto.createHmac('sha256', s).update(`backup.${userId}.${expiry}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}

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

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  let isAal2 = aal?.currentLevel === 'aal2'
  if (!isAal2) {
    const cookieStore = await cookies()
    const backupCookie = cookieStore.get('sa_backup_session')?.value
    isAal2 = await verifyBackupSessionNode(backupCookie, user.id)
  }

  // Defense-in-depth 2FA gate: never render ANY super-admin page (except the
  // security page, where the 2FA challenge/enrollment happens) unless the
  // session is AAL2. Middleware already redirects non-AAL2 requests here; this
  // server-side backstop guarantees no super-admin UI can render without 2FA
  // even if middleware is ever bypassed or misconfigured.
  const pathname = (await headers()).get('x-pathname') ?? ''
  if (!isAal2 && !pathname.endsWith('/super-admin/security')) {
    redirect('/super-admin/security')
  }

  return (
    <div className="min-h-screen bg-dash-page flex dash-font-sans">
      {/* Sidebar */}
      <aside className="w-60 flex-shrink-0 bg-dash-sidebar border-r border-dash-sidebar-border flex-col hidden lg:flex">
        <div className="px-5 h-16 flex items-center border-b border-dash-sidebar-border">
          <Link href="/super-admin" className="flex items-center gap-2.5 group">
            <KrenixLogo height={30} compact />
            <span className="flex flex-col leading-none">
              <span className="text-dash-sidebar-ink font-bold text-sm tracking-tight dash-font-sans">Krenix</span>
              <span className="text-dash-gold text-[10px] font-semibold uppercase tracking-[0.14em] mt-0.5">
                Super Admin
              </span>
            </span>
          </Link>
        </div>

        <SuperAdminNav />

        <div className="px-3 py-3 border-t border-dash-sidebar-border space-y-0.5">
          <div className="px-3 pb-2">
            <p className="text-dash-sidebar-ink-soft text-[10px] uppercase tracking-wider font-semibold">Connecté</p>
            <p className="text-dash-sidebar-ink-soft text-xs truncate mt-0.5" title={user.email ?? ''}>{user.email}</p>
          </div>
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-dash-sidebar-ink-soft hover:text-dash-sidebar-ink hover:bg-white/5 transition-all duration-200 text-sm"
          >
            <LogOut size={16} />
            Retour dashboard
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto flex flex-col min-w-0 dash-scroll">
        <header className="h-16 flex-shrink-0 flex items-center justify-between lg:justify-end gap-4 px-4 sm:px-8 border-b border-dash-border bg-dash-surface sticky top-0 z-30">
          <Link href="/super-admin" className="flex items-center gap-2 lg:hidden">
            <KrenixLogo height={28} compact />
            <span className="text-dash-ink font-bold text-sm">Super Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-dash-success-soft text-dash-success border border-dash-success/20">
              <Shield size={11} />
              {isAal2 ? '2FA vérifiée' : 'Session'}
            </span>
            <SuperAdminNotifications />
          </div>
        </header>
        {/* Mobile nav strip (sidebar is hidden below lg) */}
        <div className="lg:hidden border-b border-dash-border bg-dash-surface sticky top-16 z-20">
          <SuperAdminNav mobile />
        </div>
        <div className="p-4 sm:p-6 lg:p-8 flex-1 min-w-0">
          {children}
        </div>
      </main>
    </div>
  )
}
