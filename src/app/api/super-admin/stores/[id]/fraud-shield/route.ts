import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin({ stepUp: true })
    if (!isAdminContext(auth)) return auth
    const { id } = await ctx.params
    const { enabled } = await request.json().catch(() => ({ enabled: false }))
    const { error } = await auth.admin.from('stores').update({ fraud_shield_enabled: !!enabled }).eq('id', id)
    if (error) return NextResponse.json({ error: 'Échec' }, { status: 500 })
    await logAdminAction(auth.admin, auth.userId, enabled ? 'store.fraud_shield_enable' : 'store.fraud_shield_disable', 'store', id, {})
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
