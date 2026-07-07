import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { plan, ai_credits, chatbot_daily_limit } = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (typeof plan === 'string') patch.plan = plan
  if (ai_credits !== undefined) patch.ai_credits = Number(ai_credits)
  if (chatbot_daily_limit !== undefined) patch.chatbot_daily_limit = Number(chatbot_daily_limit)
  const { error } = await auth.admin.from('stores').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  await logAdminAction(auth.admin, auth.userId, 'store.update', 'store', id, patch)
  return NextResponse.json({ ok: true })
}
