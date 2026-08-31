import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
import { sendPurchaseEvent } from '@/lib/meta-capi'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// SlickPay redirects the customer here after payment. We re-verify status via the
// API and activate if paid (covers dev/localhost where the webhook can't reach us,
// and delayed webhooks). Idempotent via confirmAndActivate.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const recordType = url.searchParams.get('record_type') as 'subscription' | 'credit_purchase' | 'fraud_shield' | null
  const recordId = url.searchParams.get('record_id')
  const origin = originOf(request)

  const okPath = recordType === 'credit_purchase'
    ? '/dashboard/billing/credits?paid=1'
    : recordType === 'fraud_shield'
      ? '/dashboard/fraud-shield?paid=1'
      : '/dashboard?paid=1'
  const failPath = recordType === 'credit_purchase'
    ? '/dashboard/billing/credits?failed=1'
    : recordType === 'fraud_shield'
      ? '/dashboard/fraud-shield?failed=1'
      : '/activate?failed=1'

  if (!recordType || !recordId) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  const admin = createAdminClient()
  const table = recordType === 'subscription' ? 'subscriptions'
    : recordType === 'fraud_shield' ? 'fraud_shield_purchases' : 'credit_purchases'
  const { data: record } = await admin.from(table)
    .select('provider_ref, store_id, amount_dzd').eq('id', recordId).maybeSingle()

  if (!record?.provider_ref || !record.store_id) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  try {
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
                eventId: recordId,
              })
            }
          }
        }
      }
      return NextResponse.redirect(new URL(okPath, origin))
    }
  } catch (err) {
    console.error('[slickpay return] error:', err)
  }
  return NextResponse.redirect(new URL(failPath, origin))
}
