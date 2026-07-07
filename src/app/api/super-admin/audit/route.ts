import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext } from '@/lib/super-admin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!isAdminContext(auth)) return auth
  const { data } = await auth.admin.from('admin_audit_log')
    .select('id, actor_id, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false }).limit(200)
  return NextResponse.json({ entries: data ?? [] })
}
