import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { confirmFraudShieldPurchase } from '@/lib/activation'

// POST /api/super-admin/fraud-shield-purchases/[id] — manual confirm/reject of a
// merchant's Fraud Shield subscription (bank transfer / cash / proof-based path).
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireSuperAdmin({ stepUp: true })
    if (!isAdminContext(auth)) return auth
    const { id } = await ctx.params
    const { action, reason } = await request.json().catch(() => ({}))
    const admin = auth.admin

    const { data: fs } = await admin.from('fraud_shield_purchases')
      .select('store_id, status').eq('id', id).maybeSingle()
    if (!fs || fs.status !== 'pending') {
      return NextResponse.json({ error: 'Demande introuvable ou déjà traitée' }, { status: 400 })
    }

    if (action === 'reject') {
      await admin.from('fraud_shield_purchases')
        .update({ status: 'rejected', rejected_reason: reason ?? null })
        .eq('id', id).eq('status', 'pending')
      await logAdminAction(admin, auth.userId, 'fraud_shield.reject', 'fraud_shield_purchase', id, { reason })
      return NextResponse.json({ ok: true })
    }

    const granted = await confirmFraudShieldPurchase(admin, id, fs.store_id as string, auth.userId)
    if (!granted) {
      return NextResponse.json({ error: 'Demande introuvable ou déjà traitée' }, { status: 400 })
    }
    await logAdminAction(admin, auth.userId, 'fraud_shield.confirm', 'fraud_shield_purchase', id, {})
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
