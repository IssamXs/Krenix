import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { COURIERS } from '@/lib/couriers'
import type { DeliveryProvider } from '@/types/database'

// POST { orderId } → create a parcel with the store's connected courier and store tracking.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  const { orderId } = await request.json()
  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('*, product:products(name)')
    .eq('id', orderId)
    .eq('store_id', store.id)
    .single()
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })

  // Idempotent: don't create a second parcel for an already-shipped order.
  if (order.tracking_number) {
    return NextResponse.json({ tracking: order.tracking_number, labelUrl: order.delivery_label_url, alreadyShipped: true })
  }

  // Use the store's first enabled courier connection.
  const { data: integrations } = await admin
    .from('delivery_integrations')
    .select('provider, api_id, api_token, from_wilaya, enabled')
    .eq('store_id', store.id)
    .eq('enabled', true)
    .order('created_at')
  const integration = (integrations ?? [])[0]
  if (!integration) {
    return NextResponse.json({ error: 'Aucun transporteur connecté. Ajoutez vos identifiants dans Intégrations → Livraison.' }, { status: 400 })
  }

  const provider = integration.provider as DeliveryProvider
  const adapter = COURIERS[provider]
  if (provider === 'yalidine' && !integration.from_wilaya) {
    return NextResponse.json({ error: 'Configurez votre wilaya de départ dans les paramètres Yalidine.' }, { status: 400 })
  }

  const nameParts = (order.customer_name as string).trim().split(/\s+/)
  const firstname = nameParts[0] || order.customer_name
  const familyname = nameParts.slice(1).join(' ') || firstname
  const productName = order.product?.name ?? order.color ?? 'Produit'
  const productList = `${productName} x${order.quantity}`

  let creds
  try {
    creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
  } catch {
    return NextResponse.json({ error: 'Identifiants transporteur illisibles. Reconnectez votre compte.' }, { status: 500 })
  }

  const result = await adapter.createParcel(creds, {
    orderNumber: order.order_number,
    fromWilaya: integration.from_wilaya ?? '',
    firstname,
    familyname,
    phone: order.customer_phone,
    address: order.address || `${order.commune}, ${order.wilaya}`,
    toWilaya: order.wilaya,
    toCommune: order.commune,
    productList,
    codAmount: Number(order.total_price),
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Création du colis échouée' }, { status: 502 })
  }

  await admin.from('orders').update({
    tracking_number: result.tracking,
    delivery_provider: provider,
    delivery_label_url: result.labelUrl,
  }).eq('id', order.id)

  return NextResponse.json({ tracking: result.tracking, labelUrl: result.labelUrl })
}
