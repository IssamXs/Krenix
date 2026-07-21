import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { sendEmail, creditsApprovedEmail } from '@/lib/email'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { action, reason } = await request.json().catch(() => ({}))
  const admin = auth.admin

  const { data: cp } = await admin.from('credit_purchases').select('store_id, kind, quantity, status').eq('id', id).maybeSingle()
  if (!cp || cp.status !== 'pending') return NextResponse.json({ error: 'Recharge introuvable ou déjà traitée' }, { status: 400 })

  if (action === 'reject') {
    await admin.from('credit_purchases').update({ status: 'rejected', rejected_reason: reason ?? null }).eq('id', id).eq('status', 'pending')
    await logAdminAction(admin, auth.userId, 'topup.reject', 'credit_purchase', id, { reason })
    return NextResponse.json({ ok: true })
  }

  const column = cp.kind === 'ai_credits' ? 'purchased_credits' : 'purchased_chatbot'
  const { data: store } = await admin.from('stores').select(`${column}, owner_id, name`).eq('id', cp.store_id).single()
  const current = (store?.[column as keyof typeof store] as number | undefined) ?? 0
  await admin.from('stores').update({ [column]: current + cp.quantity }).eq('id', cp.store_id)
  await admin.from('credit_purchases').update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: auth.userId }).eq('id', id).eq('status', 'pending')
  await logAdminAction(admin, auth.userId, 'topup.confirm', 'credit_purchase', id, { kind: cp.kind, quantity: cp.quantity })

  if (store?.owner_id) {
    try {
      const { data } = await admin.auth.admin.getUserById(store.owner_id as string)
      const email = data.user?.email
      if (email) {
        const { subject, html } = creditsApprovedEmail({ storeName: store.name as string, quantity: cp.quantity, kind: cp.kind as 'ai_credits' | 'chatbot' })
        await sendEmail({ to: email, subject, html })
      }
    } catch (err) {
      console.error('[credit-purchases/confirm] notifyOwner failed:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
