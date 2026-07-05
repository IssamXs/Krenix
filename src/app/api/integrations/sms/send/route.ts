import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { sendSms } from '@/lib/twilio'
import { toWaNumber, messageForStatus, orderMessageVars, renderTemplate } from '@/lib/whatsapp'
import type { OrderStatus } from '@/types/database'

// POST { orderId } → send the status SMS for an order (owner-triggered).
// Currently used when an order is confirmed. Fire-and-forget: never blocks the UI.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })

    const { data: store } = await supabase.from('stores').select('id, name, settings').eq('owner_id', user.id).single()
    if (!store) return NextResponse.json({ ok: false }, { status: 404 })

    const { orderId } = await request.json()
    if (!orderId) return NextResponse.json({ ok: false })

    const admin = createAdminClient()
    const { data: integration } = await admin
      .from('sms_integrations')
      .select('account_sid, auth_token, sender, enabled')
      .eq('store_id', store.id)
      .eq('provider', 'twilio')
      .maybeSingle()
    if (!integration || !integration.enabled) return NextResponse.json({ ok: false, reason: 'not_connected' })

    const { data: order } = await admin
      .from('orders')
      .select('*, product:products(name)')
      .eq('id', orderId)
      .eq('store_id', store.id)
      .single()
    if (!order) return NextResponse.json({ ok: false })

    const template = messageForStatus(order.status as OrderStatus, store.settings?.orderMessages)
    if (!template) return NextResponse.json({ ok: false, reason: 'no_template' })
    const body = renderTemplate(template, orderMessageVars(order, { storeName: store.name, productName: order.product?.name ?? null }))

    const e164 = toWaNumber(order.customer_phone)
    if (!e164) return NextResponse.json({ ok: false, reason: 'bad_number' })

    let creds
    try {
      creds = {
        accountSid: decryptToken(integration.account_sid),
        authToken: decryptToken(integration.auth_token),
        sender: integration.sender,
      }
    } catch {
      return NextResponse.json({ ok: false, reason: 'bad_creds' })
    }

    const sent = await sendSms(creds, `+${e164}`, body)
    return NextResponse.json({ ok: sent })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
