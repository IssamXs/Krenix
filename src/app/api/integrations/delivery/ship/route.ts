import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { COURIERS } from '@/lib/couriers'
import { resolveCourierDestination } from '@/lib/courier-communes'
import type { DeliveryProvider } from '@/types/database'

// Yalidine-compatible providers validate to_commune_name/to_wilaya_name against
// their own canonical spellings and reject near-matches ("Unknown
// to_commune_name value..."). For these, resolve the order's commune through the
// courier's own /fees/ data before creating the parcel (src/lib/courier-communes.ts).
const COMMUNE_RESOLVER_BASE: Partial<Record<DeliveryProvider, string>> = {
  yalidine: 'https://api.yalidine.app/v1',
  wecan: 'https://api.wecanservices.me/v1',
}

// POST { orderId, provider? } → create a parcel with a connected courier and store tracking.
// `provider` lets the caller pick which of the store's (possibly several,
// per plan quota) connected couriers to ship through; omitted = first one.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  // `reship: true` is required to create an additional parcel for an order
  // that already has one — an explicit, deliberate signal from the detail
  // modal's "Nouvelle expédition" action, not the default row/button click.
  // Without it, a stray double-click can never create a second real parcel.
  const { orderId, provider: requestedProvider, reship } = await request.json()
  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('*, product:products(name), order_items(product_name, quantity)')
    .eq('id', orderId)
    .eq('store_id', store.id)
    .single()
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })

  if (order.tracking_number && !reship) {
    return NextResponse.json({ tracking: order.tracking_number, labelUrl: order.delivery_label_url, provider: order.delivery_provider, alreadyShipped: true })
  }

  const { data: integrations } = await admin
    .from('delivery_integrations')
    .select('provider, api_id, api_token, from_wilaya, enabled')
    .eq('store_id', store.id)
    .eq('enabled', true)
    .order('created_at')
  const integration = requestedProvider
    ? (integrations ?? []).find(i => i.provider === requestedProvider)
    : (integrations ?? [])[0] // no preference given — the store's first (usually only) connection
  if (!integration) {
    return NextResponse.json({ error: 'Aucun transporteur connecté. Ajoutez vos identifiants dans Intégrations → Livraison.' }, { status: 400 })
  }

  const provider = integration.provider as DeliveryProvider
  const adapter = COURIERS[provider]
  if (!integration.from_wilaya) {
    return NextResponse.json({ error: `Configurez la wilaya de départ pour ${adapter.label} (reconnectez-vous dans Intégrations → Livraison).` }, { status: 400 })
  }

  const nameParts = (order.customer_name as string).trim().split(/\s+/)
  const firstname = nameParts[0] || order.customer_name
  const familyname = nameParts.slice(1).join(' ') || firstname
  const productList = order.order_items && order.order_items.length > 0
    ? order.order_items.map((i: { product_name: string; quantity: number }) => `${i.product_name} x${i.quantity}`).join(', ')
    : `${order.product?.name ?? order.color ?? 'Produit'} x${order.quantity}`

  let creds
  try {
    creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
  } catch {
    return NextResponse.json({ error: 'Identifiants transporteur illisibles. Reconnectez votre compte.' }, { status: 500 })
  }

  if (!order.commune?.trim()) {
    return NextResponse.json({ error: 'La commande n\'a pas de commune de destination.' }, { status: 400 })
  }
  let toWilaya = order.wilaya
  let toCommune: string = order.commune
  const resolverBase = COMMUNE_RESOLVER_BASE[provider]
  if (resolverBase) {
    // Best-effort: on resolution failure (network, unknown wilaya code, no
    // close match) ship the stored names — the courier's own error, if any,
    // is what the UI already knows how to surface.
    const resolved = await resolveCourierDestination(resolverBase, creds, integration.from_wilaya, toWilaya, toCommune)
    if (resolved) {
      toWilaya = resolved.toWilaya
      toCommune = resolved.toCommune
    }
  }

  const result = await adapter.createParcel(creds, {
    orderNumber: order.order_number,
    fromWilaya: integration.from_wilaya ?? '',
    firstname,
    familyname,
    phone: order.customer_phone,
    address: order.address || `${order.commune}, ${order.wilaya}`,
    toWilaya,
    toCommune,
    productList,
    codAmount: Number(order.total_price),
    isStopdesk: order.delivery_type === 'desk',
    // No exact scale reading — a heavy-flagged order (accounts for quantity/
    // bagging, not just the product) reports a weight just over the 5kg
    // threshold so the courier bills/handles it as such.
    weight: order.is_heavy ? 6 : 1,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error ?? 'Création du colis échouée' }, { status: 502 })
  }

  // order_shipments keeps every parcel ever created for this order; the
  // orders row itself always mirrors the MOST RECENT one so every existing
  // list badge/WhatsApp template keeps reading a single tracking number.
  await admin.from('order_shipments').insert({
    order_id: order.id, store_id: store.id, provider,
    tracking_number: result.tracking, label_url: result.labelUrl,
  })
  await admin.from('orders').update({
    tracking_number: result.tracking,
    delivery_provider: provider,
    delivery_label_url: result.labelUrl,
  }).eq('id', order.id)

  return NextResponse.json({ tracking: result.tracking, labelUrl: result.labelUrl, provider })
}
