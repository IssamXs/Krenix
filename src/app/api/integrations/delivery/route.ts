import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto'
import { COURIERS } from '@/lib/couriers'
import { DELIVERY_PROVIDER_LIMITS, type Plan, type DeliveryProvider } from '@/types/database'

// Resolve the caller's store (owner). Delivery integrations are available on
// every plan — the tier controls HOW MANY providers can be connected at once
// (see DELIVERY_PROVIDER_LIMITS), not whether the feature exists at all.
async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { storeId: store.id as string, plan: store.plan as Plan }
}

// GET → redacted status (no credentials) + the plan's provider quota
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data } = await admin
    .from('delivery_integrations')
    .select('provider, from_wilaya, enabled')
    .eq('store_id', s.storeId)
  const connections = data ?? []
  const yalidine = connections.find(c => c.provider === 'yalidine') ?? null
  const limit = DELIVERY_PROVIDER_LIMITS[s.plan]
  return NextResponse.json({
    connected: !!yalidine, integration: yalidine, connections,
    limit: Number.isFinite(limit) ? limit : null, // null = unlimited
    used: connections.length,
  })
}

// POST { provider?, apiId, apiToken, fromWilaya? } → validate then store encrypted
export async function POST(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { provider = 'yalidine', apiId, apiToken, fromWilaya } = await request.json()
  const adapter = COURIERS[provider as DeliveryProvider]
  if (!adapter) return NextResponse.json({ error: 'Transporteur inconnu' }, { status: 400 })
  if (!apiId?.trim() || !apiToken?.trim()) {
    return NextResponse.json({ error: `${adapter.idLabel} et ${adapter.tokenLabel} requis` }, { status: 400 })
  }

  const admin = createAdminClient()

  // Plan quota — only blocks connecting a NEW provider; re-verifying/updating
  // credentials for an already-connected one never counts against the limit.
  const limit = DELIVERY_PROVIDER_LIMITS[s.plan]
  if (Number.isFinite(limit)) {
    const { data: existing } = await admin
      .from('delivery_integrations').select('provider').eq('store_id', s.storeId)
    const already = (existing ?? []).some(c => c.provider === provider)
    if (!already && (existing?.length ?? 0) >= limit) {
      return NextResponse.json({
        error: `Votre plan permet ${limit} société${limit > 1 ? 's' : ''} de livraison au maximum. Déconnectez-en une ou passez à un plan supérieur.`,
        code: 'PROVIDER_LIMIT',
      }, { status: 403 })
    }
  }

  const valid = await adapter.validate({ apiId: apiId.trim(), apiToken: apiToken.trim() })
  if (!valid) {
    return NextResponse.json({ error: `Identifiants ${adapter.label} invalides.` }, { status: 400 })
  }

  const row = {
    store_id: s.storeId,
    provider,
    api_id: encryptToken(apiId.trim()),
    api_token: encryptToken(apiToken.trim()),
    from_wilaya: fromWilaya?.trim() || null,
    enabled: true,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin
    .from('delivery_integrations')
    .upsert(row, { onConflict: 'store_id,provider' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ connected: true })
}

// DELETE { provider? } → remove a courier connection (defaults to yalidine)
export async function DELETE(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const { provider = 'yalidine' } = await request.json().catch(() => ({ provider: 'yalidine' }))
  const admin = createAdminClient()
  await admin.from('delivery_integrations').delete().eq('store_id', s.storeId).eq('provider', provider)
  return NextResponse.json({ ok: true })
}
