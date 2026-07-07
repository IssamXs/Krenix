import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'

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
  const recordType = url.searchParams.get('record_type') as 'subscription' | 'credit_purchase' | null
  const recordId = url.searchParams.get('record_id')
  const origin = originOf(request)

  const okPath = recordType === 'credit_purchase' ? '/dashboard/billing/credits?paid=1' : '/dashboard?paid=1'
  const failPath = recordType === 'credit_purchase' ? '/dashboard/billing/credits?failed=1' : '/activate?failed=1'

  if (!recordType || !recordId) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  const admin = createAdminClient()
  const table = recordType === 'subscription' ? 'subscriptions' : 'credit_purchases'
  const { data: record } = await admin.from(table)
    .select('provider_ref, store_id').eq('id', recordId).maybeSingle()

  if (!record?.provider_ref || !record.store_id) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  try {
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      return NextResponse.redirect(new URL(okPath, origin))
    }
  } catch (err) {
    console.error('[slickpay return] error:', err)
  }
  return NextResponse.redirect(new URL(failPath, origin))
}
