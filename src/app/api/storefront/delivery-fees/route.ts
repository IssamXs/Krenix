import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { getCompatibleFees } from '@/lib/yalidine'
import { bestCommuneMatch } from '@/lib/courier-communes'
import { wilayaId } from '@/lib/wilayas'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import type { DeliveryProvider } from '@/types/database'

// Couriers whose /fees/ endpoint follows the Yalidine contract. Kept in sync
// with COMMUNE_RESOLVER_BASE in the ship route — the same data source backs
// both the checkout quote and the amount submitted at shipment time, so the
// merchant's margin isn't eaten by a stale hand-maintained rate table.
const FEES_BASE: Partial<Record<DeliveryProvider, string>> = {
  yalidine: 'https://api.yalidine.app/v1',
  wecan: 'https://api.wecanservices.me/v1',
}

const NO_FEES = { homeFee: null, deskFee: null }

export async function GET(request: Request) {
  try {
    // Public (unauthenticated, called from the storefront checkout) — without a
    // limit, a caller could hammer arbitrary storeIds and burn through that
    // store's own courier API quota/cost.
    const allowed = await checkRateLimit(`delivery-fees:${requestIp(request)}`, 30, 60)
    if (!allowed) return NextResponse.json({ error: 'Trop de requêtes. Réessayez plus tard.' }, { status: 429 })

    const url = new URL(request.url)
    const storeId = url.searchParams.get('storeId')
    const toWilaya = url.searchParams.get('toWilaya')
    // Optional: when the customer has already picked their commune we quote
    // that commune's exact fee instead of the wilaya-wide average.
    const toCommune = url.searchParams.get('toCommune')

    if (!storeId || !toWilaya) {
      return NextResponse.json({ error: 'storeId and toWilaya are required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Any enabled courier with a Yalidine-compatible /fees/ endpoint will do —
    // NOT just Yalidine. Hardcoding 'yalidine' here silently returned null for
    // every WeCan store, so those checkouts fell back to the store's static
    // rate table and under-quoted delivery against the courier's real tariff.
    const { data: integrations } = await admin
      .from('delivery_integrations')
      .select('provider, api_id, api_token, from_wilaya, enabled')
      .eq('store_id', storeId)
      .eq('enabled', true)
      .order('created_at')

    const integration = (integrations ?? []).find(
      i => FEES_BASE[i.provider as DeliveryProvider] && i.from_wilaya,
    )
    if (!integration) return NextResponse.json(NO_FEES)

    const base = FEES_BASE[integration.provider as DeliveryProvider]!
    const fromId = wilayaId(integration.from_wilaya)
    const toId = wilayaId(toWilaya)
    if (!fromId || !toId) return NextResponse.json(NO_FEES)

    let creds
    try {
      creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
    } catch {
      return NextResponse.json(NO_FEES)
    }

    const fees = await getCompatibleFees(base, creds, fromId, toId)
    if (!fees || fees.communes.length === 0) return NextResponse.json(NO_FEES)

    // The courier's own commune spellings for this wilaya — some wilayas
    // (Illizi, Bordj Badji Mokhtar, In Guezzam, Djanet) aren't covered by the
    // static COMMUNES_BY_WILAYA list, so the checkout renders a free-text box
    // for them. That let a customer type their wilaya name in Arabic, which
    // no courier recognizes ("Unknown to_commune_name value..." at shipping
    // time). Sending the live list lets the storefront render a real dropdown
    // instead whenever a courier is connected, closing the gap at the source.
    const communes = fees.communes.map(c => c.communeName).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr'))

    // Exact commune when we know it (matched through the courier's own
    // spellings, same as shipping does); otherwise the wilaya-wide average.
    if (toCommune?.trim()) {
      const matched = bestCommuneMatch(communes, toCommune)
      const row = matched ? fees.communes.find(c => c.communeName === matched) : null
      if (row) return NextResponse.json({ homeFee: row.home, deskFee: row.desk, communes })
    }

    const avgFee = (values: (number | null)[]): number | null => {
      const valid = values.filter((f): f is number => f !== null)
      return valid.length > 0 ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : null
    }

    return NextResponse.json({
      homeFee: avgFee(fees.communes.map(c => c.home)),
      deskFee: avgFee(fees.communes.map(c => c.desk)),
      communes,
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
