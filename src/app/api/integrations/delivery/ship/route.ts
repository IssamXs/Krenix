import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { COURIERS } from '@/lib/couriers'
import { resolveCourierDestination, listCourierCommunes, deliveryTypeAvailability, resolveStopdeskCenter } from '@/lib/courier-communes'
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
  let courierFee: number | null = null
  let stopdeskCenterId: number | undefined
  const resolverBase = COMMUNE_RESOLVER_BASE[provider]
  if (resolverBase) {
    const resolved = await resolveCourierDestination(resolverBase, creds, integration.from_wilaya, toWilaya, toCommune)
    if (resolved) {
      toWilaya = resolved.toWilaya
      toCommune = resolved.toCommune
      courierFee = order.delivery_type === 'desk' ? resolved.deskFee : resolved.homeFee

      // The commune name matched, but that alone doesn't mean the courier
      // serves it with the requested type — some remote communes only offer
      // one of home/desk. Sending the wrong one still gets past their name
      // validation and fails at creation with "commune ... is not
      // deliverable", which gives the merchant nothing to act on. Catch it
      // here and say exactly which type to switch to instead.
      const requestedType = order.delivery_type === 'desk' ? 'desk' : 'home'
      const availability = deliveryTypeAvailability(resolved, requestedType)
      if (!availability.available) {
        // "à domicile" / "en Stop Desk" both take the "qu'..." elision cleanly,
        // so the same phrase slots into "ne livre pas ... {phrase}" and
        // "n'est desservie qu'{phrase}" without a grammar special-case.
        const typePhrase = (t: 'home' | 'desk') => t === 'desk' ? 'en Stop Desk' : 'à domicile'
        return NextResponse.json({
          error: availability.onlyType
            ? `${adapter.label} ne livre pas « ${toCommune} » ${typePhrase(requestedType)} — cette commune n'est desservie qu'${typePhrase(availability.onlyType)}. Changez le type de livraison de la commande puis réessayez.`
            : `${adapter.label} ne dessert pas la commune « ${toCommune} », quel que soit le type de livraison.`,
          deliveryTypeMismatch: true,
          availableType: availability.onlyType,
        }, { status: 422 })
      }

      // A stopdesk parcel needs a real pickup-point id — sending is_stopdesk
      // without one is rejected as "Unknown stopdesk_id value in the
      // order_id ..." (the actual LEM-0032 failure once the commune/type
      // mismatch above was fixed). Resolve it now and refuse to ship rather
      // than send a parcel guaranteed to be rejected.
      if (requestedType === 'desk') {
        const center = await resolveStopdeskCenter(resolverBase, creds, toWilaya, toCommune)
        if (!center) {
          return NextResponse.json({
            error: `${adapter.label} n'a communiqué aucun point Stop Desk pour « ${toCommune} ». Réessayez plus tard ou passez cette commande en livraison à domicile.`,
          }, { status: 422 })
        }
        stopdeskCenterId = center.centerId

        // The courier requires stopdesk_id and to_commune_name to name the
        // SAME commune ("The selected stopdesk_id does not belong to the
        // selected to_commune_name" — the actual next LEM-0032 failure).
        // Many remote communes (Bordj Omar Driss included) have no desk of
        // their own, so resolveStopdeskCenter falls back to the nearest
        // hub — the parcel must then be addressed to THAT hub's commune,
        // since that's physically where the customer travels to collect it.
        if (center.communeName && center.communeName !== toCommune) {
          console.log('[ship] stopdesk commune override', { order: order.order_number, requestedCommune: toCommune, centerCommune: center.communeName })
          toCommune = center.communeName
        }
      }
    } else {
      // These couriers reject any commune spelling that isn't their own, so
      // shipping the stored text here only ever produced "Unknown
      // to_commune_name value in the order_id ..." — accurate, but useless to
      // a merchant. Fail with the accepted spellings instead so the commune
      // can be corrected from the order's delivery section and re-shipped.
      const accepted = await listCourierCommunes(resolverBase, creds, integration.from_wilaya, toWilaya)
      return NextResponse.json({
        error: `La commune « ${toCommune} » n'est pas reconnue par ${adapter.label}. Choisissez la bonne commune puis réessayez.`,
        communeUnresolved: true,
        communes: accepted,
      }, { status: 422 })
    }
  }

  // What the courier must collect from the customer at the door.
  //
  // Yalidine-compatible couriers ADD their own delivery fee on top of the
  // `price` we submit (freeshipping stays false — see the adapters), so to
  // have them collect exactly what the customer owes we submit that amount
  // MINUS the courier fee.
  //
  // total_price already encodes everything the customer owes: the remise is
  // baked in, and the delivery fee is included UNLESS free_delivery (then the
  // merchant absorbs it and total_price is goods-only). So `total_price -
  // courierFee` is the right submitted price in both cases — the customer
  // ends up paying total_price once the courier adds its fee back.
  //
  // When the fee is unknown (non-Yalidine courier, or the /fees/ lookup
  // failed) fall back to what the customer owes minus a normal delivery fee
  // for a paid-delivery order, or the full goods-only total for a free one —
  // the customer then pays that plus the courier's real fee, at most a small
  // delta instead of a double charge.
  const fallbackCod = order.free_delivery
    ? Number(order.total_price)
    : Number(order.total_price) - Number(order.delivery_price)
  const codAmount = courierFee !== null
    ? Math.max(0, Number(order.total_price) - courierFee)
    : Math.max(0, fallbackCod)

  console.log('[ship] cod', {
    order: order.order_number, provider,
    orderTotal: Number(order.total_price), merchantDelivery: Number(order.delivery_price),
    freeDelivery: !!order.free_delivery,
    courierFee, submittedPrice: codAmount,
    expectedCollected: courierFee !== null ? codAmount + courierFee : null,
  })

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
    codAmount,
    isStopdesk: order.delivery_type === 'desk',
    stopdeskCenterId,
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
