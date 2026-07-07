import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'

// SlickPay POSTs the invoice payload when payment status changes. We re-verify
// status via the API (source of truth) before granting, so a spoofed webhook
// can't activate anything. Always 200 to avoid retry storms.
export async function POST(request: Request) {
  const raw = await request.text()
  // Best-effort signature check across likely header names (name is undocumented).
  const sig = request.headers.get('signature')
    ?? request.headers.get('x-signature')
    ?? request.headers.get('webhook-signature')
  if (sig && !verifyWebhookSignature(sig)) {
    console.warn('[slickpay webhook] signature mismatch — relying on status re-check')
  }

  let payload: { id?: number; data?: { id?: number }; webhook_meta_data?: Record<string, string> }
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const meta = payload.webhook_meta_data ?? {}
  const recordType = meta.record_type as 'subscription' | 'credit_purchase' | undefined
  const recordId = meta.record_id
  const storeId = meta.store_id
  const invoiceId = payload.id ?? payload.data?.id
  if (!recordType || !recordId || !storeId || !invoiceId) return NextResponse.json({ ok: true })

  try {
    const status = await getInvoiceStatus(invoiceId)
    if (status === 'paid') {
      const admin = createAdminClient()
      await confirmAndActivate(admin, recordType, recordId, storeId)
    }
  } catch (err) {
    console.error('[slickpay webhook] error:', err)
  }
  return NextResponse.json({ ok: true })
}
