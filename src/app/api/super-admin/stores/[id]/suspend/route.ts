import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { revalidateStoreCache } from '@/lib/cache/store-cache'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { suspend } = await request.json().catch(() => ({ suspend: true }))
  const { error } = await auth.admin.from('stores').update({ is_suspended: !!suspend }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Échec' }, { status: 500 })
  await logAdminAction(auth.admin, auth.userId, suspend ? 'store.suspend' : 'store.unsuspend', 'store', id, {})
  // Cached store lookup filters is_suspended=false — a suspension must take
  // effect immediately, not after the cache's TTL, especially since suspension
  // is often a fraud/policy/non-payment action.
  revalidateStoreCache()
  return NextResponse.json({ ok: true })
}
