import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { deleteCompatibleParcel } from '@/lib/yalidine'
import type { DeliveryProvider } from '@/types/database'

// Couriers exposing a Yalidine-compatible DELETE /parcels/?tracking= endpoint.
const DELETE_BASE: Partial<Record<DeliveryProvider, string>> = {
  yalidine: 'https://api.yalidine.app/v1',
  wecan: 'https://api.wecanservices.me/v1',
}

// DELETE { shipmentId, force? } → cancel a parcel at the courier and drop it
// from the order's shipment history.
//
// `force: true` removes the local record even when the courier refused (or
// can't be reached). That is the merchant explicitly saying "I've cancelled
// this at the courier myself" — the parcel may still exist on the courier's
// side, so the UI must say so before sending it.
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  const { shipmentId, force } = await request.json()
  if (!shipmentId) return NextResponse.json({ error: 'shipmentId requis' }, { status: 400 })

  const admin = createAdminClient()

  // Scoped to the caller's store — a shipment id from another tenant must not
  // be deletable even with a valid session.
  const { data: shipment } = await admin
    .from('order_shipments')
    .select('id, order_id, store_id, provider, tracking_number')
    .eq('id', shipmentId)
    .eq('store_id', store.id)
    .single()
  if (!shipment) return NextResponse.json({ error: 'Expédition introuvable' }, { status: 404 })

  const provider = shipment.provider as DeliveryProvider
  const base = DELETE_BASE[provider]

  let courierDeleted = false
  let courierError: string | null = null

  if (base && shipment.tracking_number) {
    const { data: integration } = await admin
      .from('delivery_integrations')
      .select('api_id, api_token')
      .eq('store_id', store.id)
      .eq('provider', provider)
      .maybeSingle()

    if (!integration) {
      courierError = 'Transporteur non connecté — impossible d\'annuler le colis chez le transporteur.'
    } else {
      try {
        const creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
        const res = await deleteCompatibleParcel(base, creds, shipment.tracking_number)
        courierDeleted = res.success
        courierError = res.success ? null : (res.error ?? 'Suppression refusée par le transporteur')
      } catch {
        courierError = 'Identifiants transporteur illisibles. Reconnectez votre compte.'
      }
    }
  } else {
    courierError = 'Ce transporteur ne permet pas la suppression automatique.'
  }

  // Without `force`, a courier refusal aborts: deleting our record while the
  // parcel still lives at the courier would hide a real, billable shipment.
  if (!courierDeleted && !force) {
    return NextResponse.json({ error: courierError, courierRefused: true }, { status: 409 })
  }

  await admin.from('order_shipments').delete().eq('id', shipment.id).eq('store_id', store.id)

  // orders.* mirrors the most recent remaining shipment (or clears entirely),
  // keeping the list badge and the detail modal consistent with the history.
  const { data: remaining } = await admin
    .from('order_shipments')
    .select('provider, tracking_number, label_url')
    .eq('order_id', shipment.order_id)
    .order('created_at', { ascending: false })
    .limit(1)

  const latest = remaining?.[0] ?? null
  await admin.from('orders').update({
    tracking_number: latest?.tracking_number ?? null,
    delivery_provider: latest?.provider ?? null,
    delivery_label_url: latest?.label_url ?? null,
  }).eq('id', shipment.order_id).eq('store_id', store.id)

  return NextResponse.json({
    ok: true,
    courierDeleted,
    // Present when the row was force-removed locally but the parcel may still
    // exist at the courier — the UI warns the merchant to cancel it there.
    warning: courierDeleted ? null : courierError,
    latest: latest
      ? { tracking: latest.tracking_number, provider: latest.provider, labelUrl: latest.label_url }
      : null,
  })
}
