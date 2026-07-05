import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyChargilySignature } from '@/lib/chargily'
import { activateStorePlan, grantTopup } from '@/lib/activation'
import type { Plan } from '@/types/database'

// Chargily Pay webhook. Verifies the HMAC signature, then — on checkout.paid —
// confirms the pending record identified by the checkout metadata and grants the
// plan/top-up. Idempotent: only a still-'pending' record is acted on, so webhook
// retries can't double-grant.
export async function POST(request: Request) {
  const raw = await request.text()
  const signature = request.headers.get('signature')
  if (!verifyChargilySignature(raw, signature)) {
    return new Response('Invalid signature', { status: 403 })
  }

  let event: { type?: string; data?: { metadata?: Record<string, string> } }
  try { event = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  if (event.type !== 'checkout.paid') return NextResponse.json({ ok: true })

  const meta = event.data?.metadata ?? {}
  const recordType = meta.record_type
  const recordId = meta.record_id
  const storeId = meta.store_id
  if (!recordType || !recordId || !storeId) return NextResponse.json({ ok: true })

  const admin = createAdminClient()

  if (recordType === 'subscription') {
    // Flip to confirmed only if still pending (idempotency guard).
    const { data: sub } = await admin
      .from('subscriptions')
      .update({ status: 'active', confirmed_at: new Date().toISOString(), started_at: new Date().toISOString() })
      .eq('id', recordId).eq('status', 'pending')
      .select('plan')
      .maybeSingle()
    if (sub) await activateStorePlan(admin, storeId, sub.plan as Plan)
  } else if (recordType === 'credit_purchase') {
    const { data: cp } = await admin
      .from('credit_purchases')
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', recordId).eq('status', 'pending')
      .select('kind, quantity')
      .maybeSingle()
    if (cp) await grantTopup(admin, storeId, cp.kind as 'ai_credits' | 'chatbot_messages', cp.quantity as number)
  }

  return NextResponse.json({ ok: true })
}
