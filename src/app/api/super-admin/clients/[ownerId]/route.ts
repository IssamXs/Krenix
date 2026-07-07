import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

const BAN_FOREVER = '876000h' // ~100 years

async function assertActionable(admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, ownerId: string, selfId: string) {
  if (ownerId === selfId) return 'Vous ne pouvez pas agir sur votre propre compte.'
  const { data: targetIsAdmin } = await admin.from('super_admins').select('id').eq('user_id', ownerId).maybeSingle()
  if (targetIsAdmin) return 'Impossible d’agir sur un autre super administrateur.'
  return null
}

export async function POST(request: Request, ctx: { params: Promise<{ ownerId: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { ownerId } = await ctx.params
  const { action } = await request.json().catch(() => ({}))
  const guard = await assertActionable(auth.admin, ownerId, auth.userId)
  if (guard) return NextResponse.json({ error: guard }, { status: 400 })

  const ban = action === 'ban'
  const { error: banErr } = await auth.admin.auth.admin.updateUserById(ownerId, { ban_duration: ban ? BAN_FOREVER : 'none' })
  if (banErr) return NextResponse.json({ error: 'Échec de la mise à jour du compte' }, { status: 500 })
  await auth.admin.from('stores').update({ is_suspended: ban }).eq('owner_id', ownerId)
  await logAdminAction(auth.admin, auth.userId, ban ? 'client.ban' : 'client.unban', 'client', ownerId, {})
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ ownerId: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { ownerId } = await ctx.params
  const guard = await assertActionable(auth.admin, ownerId, auth.userId)
  if (guard) return NextResponse.json({ error: guard }, { status: 400 })

  // Record the full store list BEFORE deletion so the audit trail survives.
  const { data: stores } = await auth.admin.from('stores').select('id, name, slug').eq('owner_id', ownerId)
  await logAdminAction(auth.admin, auth.userId, 'client.delete', 'client', ownerId, { stores: stores ?? [] })

  // Delete stores (child rows cascade via FKs), then the auth user.
  await auth.admin.from('stores').delete().eq('owner_id', ownerId)
  const { error: delErr } = await auth.admin.auth.admin.deleteUser(ownerId)
  if (delErr) return NextResponse.json({ error: 'Boutiques supprimées mais échec suppression du compte auth', code: 'PARTIAL' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
