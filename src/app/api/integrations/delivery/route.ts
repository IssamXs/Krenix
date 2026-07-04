import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto'
import { validateYalidineCredentials } from '@/lib/yalidine'
import { BUSINESS_PLANS, type Plan } from '@/types/database'

// Resolve the caller's store (owner). Yalidine is gated to Business+ plans.
async function ownerStore(requirePlan = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const { data: store } = await supabase.from('stores').select('id, plan').eq('owner_id', user.id).single()
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  if (requirePlan && !BUSINESS_PLANS.includes(store.plan as Plan)) {
    return { error: 'Réservé aux plans Business et plus' as const, status: 403 }
  }
  return { storeId: store.id as string }
}

// GET → redacted status (no credentials)
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data } = await admin
    .from('delivery_integrations')
    .select('provider, from_wilaya, enabled')
    .eq('store_id', s.storeId)
    .eq('provider', 'yalidine')
    .maybeSingle()
  return NextResponse.json({ connected: !!data, integration: data ?? null })
}

// POST { apiId, apiToken, fromWilaya } → validate against Yalidine then store encrypted
export async function POST(request: Request) {
  const s = await ownerStore(true)
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { apiId, apiToken, fromWilaya } = await request.json()
  if (!apiId?.trim() || !apiToken?.trim()) {
    return NextResponse.json({ error: 'API ID et API Token requis' }, { status: 400 })
  }

  const valid = await validateYalidineCredentials({ apiId: apiId.trim(), apiToken: apiToken.trim() })
  if (!valid) {
    return NextResponse.json({ error: 'Identifiants Yalidine invalides. Vérifiez votre API ID et Token.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const row = {
    store_id: s.storeId,
    provider: 'yalidine' as const,
    api_id: encryptToken(apiId.trim()),
    api_token: encryptToken(apiToken.trim()),
    from_wilaya: fromWilaya?.trim() || null,
    enabled: true,
    updated_at: new Date().toISOString(),
  }
  // Upsert on (store_id, provider).
  const { error } = await admin
    .from('delivery_integrations')
    .upsert(row, { onConflict: 'store_id,provider' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ connected: true })
}

// DELETE → remove the store's Yalidine connection
export async function DELETE() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  await admin.from('delivery_integrations').delete().eq('store_id', s.storeId).eq('provider', 'yalidine')
  return NextResponse.json({ ok: true })
}
