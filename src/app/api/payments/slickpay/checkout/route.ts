import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccountStore } from '@/lib/server-store'
import { createInvoice, isSlickpayConfigured } from '@/lib/slickpay'
import {
  PLAN_AMOUNTS_DZD, PLAN_LABELS, CREDIT_PACKS, MESSAGE_PACKS,
  type Plan, type CreditPurchaseKind,
} from '@/types/database'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// POST { kind:'plan', plan } | { kind:'ai_credits'|'chatbot_messages', quantity }
// → pending record + SlickPay invoice → { checkoutUrl }.
export async function POST(request: Request) {
  if (!isSlickpayConfigured()) {
    return NextResponse.json({ error: 'Paiement en ligne non configuré.', code: 'NOT_CONFIGURED' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const account = await resolveAccountStore(supabase, user.id, 'id, slug, plan')
  if (!account) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const kind = body.kind as 'plan' | CreditPurchaseKind
  const origin = originOf(request)
  // SlickPay can only reach a public HTTPS webhook. On localhost, skip it — the
  // return route reconciles instead.
  const webhookUrl = origin.startsWith('https://') && !origin.includes('localhost')
    ? `${origin}/api/webhooks/slickpay` : undefined

  const buyer = {
    firstname: account.slug || 'Client',
    lastname: 'Krenix',
    email: user.email ?? 'client@krenix.store',
  }

  let amountDzd: number
  let itemName: string
  let recordType: 'subscription' | 'credit_purchase'
  let recordId: string
  let returnPath: string

  if (kind === 'plan') {
    const plan = body.plan as Plan
    amountDzd = PLAN_AMOUNTS_DZD[plan]
    if (!amountDzd || plan === 'sur_mesure') {
      return NextResponse.json({ error: 'Plan invalide pour paiement en ligne' }, { status: 400 })
    }
    itemName = `Krenix — Plan ${PLAN_LABELS[plan]} (${account.slug})`
    const { data: sub, error } = await admin.from('subscriptions').insert({
      store_id: account.id, plan, amount_dzd: amountDzd, status: 'pending', notes: 'SlickPay (en ligne)',
    }).select('id').single()
    if (error || !sub) return NextResponse.json({ error: 'Erreur de création du paiement' }, { status: 500 })
    recordType = 'subscription'; recordId = sub.id
    returnPath = 'subscription'
  } else if (kind === 'ai_credits' || kind === 'chatbot_messages') {
    const quantity = Number(body.quantity)
    const packs = kind === 'ai_credits' ? CREDIT_PACKS : MESSAGE_PACKS
    const pack = packs.find(p => p.quantity === quantity)
    if (!pack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 })
    amountDzd = pack.amountDzd
    itemName = `Krenix — ${pack.label} (${account.slug})`
    const { data: cp, error } = await admin.from('credit_purchases').insert({
      store_id: account.id, kind, quantity: pack.quantity, amount_dzd: amountDzd, status: 'pending',
    }).select('id').single()
    if (error || !cp) return NextResponse.json({ error: 'Erreur de création du paiement' }, { status: 500 })
    recordType = 'credit_purchase'; recordId = cp.id
    returnPath = 'credit_purchase'
  } else {
    return NextResponse.json({ error: 'Type de paiement invalide' }, { status: 400 })
  }

  const returnUrl = `${origin}/api/payments/slickpay/return?record_type=${returnPath}&record_id=${recordId}`

  try {
    const { paymentUrl, invoiceId } = await createInvoice({
      amountDzd, itemName, buyer, returnUrl, webhookUrl,
      metadata: { record_type: recordType, record_id: recordId, store_id: account.id },
    })
    await admin.from(recordType === 'subscription' ? 'subscriptions' : 'credit_purchases')
      .update({ provider_ref: String(invoiceId) }).eq('id', recordId)
    return NextResponse.json({ checkoutUrl: paymentUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur SlickPay'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
