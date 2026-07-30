import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
import { sendPurchaseEvent } from '@/lib/meta-capi'

// SlickPay POSTs the invoice payload when payment status changes. The webhook
// body is effectively unauthenticated (SlickPay's signature header name is
// undocumented — see verifyWebhookSignature below), so it is NOT the source of
// truth for anything. We only use it to learn WHICH record to re-check, then
// look up that record's own provider_ref (the invoice id we ourselves created
// for it, stored server-side at checkout time — see slickpay/checkout) and ask
// SlickPay for THAT invoice's status. Never trust an invoice id, store id, or
// paid-status claim taken directly from the request body: doing so would let
// someone pair one genuinely-paid (but cheaper, unrelated) invoice id with an
// arbitrary recordId in the metadata and activate a plan they never paid for.
// This mirrors the same lookup slickpay/return already does. Always 200 to
// avoid retry storms.
export async function POST(request: Request) {
  const raw = await request.text()
  // Best-effort signature check across likely header names (name is undocumented).
  const sig = request.headers.get('signature')
    ?? request.headers.get('x-signature')
    ?? request.headers.get('webhook-signature')
  if (sig && !verifyWebhookSignature(sig)) {
    console.warn('[slickpay webhook] signature mismatch — relying on status re-check')
  }

  let payload: { webhook_meta_data?: Record<string, string> }
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const meta = payload.webhook_meta_data ?? {}
  const recordType = meta.record_type as 'subscription' | 'credit_purchase' | undefined
  const recordId = meta.record_id
  if (!recordType || !recordId) return NextResponse.json({ ok: true })

  try {
    const admin = createAdminClient()
    const table = recordType === 'subscription' ? 'subscriptions' : 'credit_purchases'
    const { data: record } = await admin.from(table)
      .select('provider_ref, store_id, amount_dzd').eq('id', recordId).maybeSingle()
    if (!record?.provider_ref || !record.store_id) return NextResponse.json({ ok: true })

    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) {
        await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
        if (recordType === 'subscription') {
          const { data: storeRow } = await admin.from('stores').select('owner_id').eq('id', record.store_id).maybeSingle()
          if (storeRow?.owner_id) {
            const { data: ownerData } = await admin.auth.admin.getUserById(storeRow.owner_id as string)
            const ownerEmail = ownerData.user?.email
            if (ownerEmail) {
              await sendPurchaseEvent({
                email: ownerEmail,
                phone: (ownerData.user?.user_metadata?.phone as string | undefined) ?? null,
                valueDzd: Number(record.amount_dzd),
              })
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[slickpay webhook] error:', err)
  }
  return NextResponse.json({ ok: true })
}
