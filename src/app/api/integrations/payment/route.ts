import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { encryptToken } from '@/lib/crypto'
import { validateSlickpayKey } from '@/lib/slickpay'
import { validateChargilyKey } from '@/lib/chargily'
import type { PaymentProvider } from '@/types/database'

async function ownerStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  return store
}

function isProvider(v: unknown): v is PaymentProvider {
  return v === 'slickpay' || v === 'chargily'
}

// GET → connection status for both providers + which one is active.
export async function GET() {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: integrations } = await admin
    .from('payment_integrations')
    .select('provider, enabled')
    .eq('store_id', store.id)

  const { data: storeRow } = await admin
    .from('stores')
    .select('online_payment_enabled, active_payment_provider')
    .eq('id', store.id)
    .single()

  const byProvider = (p: PaymentProvider) => (integrations ?? []).find(i => i.provider === p)

  return NextResponse.json({
    slickpay: { connected: !!byProvider('slickpay'), enabled: byProvider('slickpay')?.enabled ?? false },
    chargily: { connected: !!byProvider('chargily'), enabled: byProvider('chargily')?.enabled ?? false },
    showOnStorefront: storeRow?.online_payment_enabled ?? false,
    activeProvider: (storeRow?.active_payment_provider as PaymentProvider | null) ?? null,
  })
}

// POST { provider, publicKey } → validate + encrypt + connect (or reconnect).
export async function POST(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { provider, publicKey } = await request.json().catch(() => ({}))
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Fournisseur de paiement invalide.' }, { status: 400 })
  }
  if (!publicKey || typeof publicKey !== 'string') {
    return NextResponse.json({ error: 'Clé requise.' }, { status: 400 })
  }

  const valid = provider === 'slickpay'
    ? await validateSlickpayKey(publicKey)
    : await validateChargilyKey(publicKey)
  if (!valid) {
    return NextResponse.json({ error: 'Clé invalide. Vérifiez votre clé.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('payment_integrations').upsert({
    store_id: store.id,
    provider,
    public_key: encryptToken(publicKey),
    enabled: true,
  }, { onConflict: 'store_id,provider' })

  if (error) return NextResponse.json({ error: 'Erreur lors de la connexion.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { showOnStorefront, provider? } → toggle storefront visibility for a
// given provider (making it the active one), or hide the storefront entirely
// when showOnStorefront is false.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { showOnStorefront, provider } = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  if (showOnStorefront) {
    if (!isProvider(provider)) {
      return NextResponse.json({ error: 'Fournisseur de paiement invalide.' }, { status: 400 })
    }
    const { data: integration } = await admin
      .from('payment_integrations')
      .select('id, enabled')
      .eq('store_id', store.id)
      .eq('provider', provider)
      .maybeSingle()
    if (!integration || !integration.enabled) {
      return NextResponse.json({ error: 'Connectez ce compte avant de l\'afficher sur votre boutique.' }, { status: 400 })
    }
    const { error } = await admin.from('stores')
      .update({ online_payment_enabled: true, active_payment_provider: provider })
      .eq('id', store.id)
    if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin.from('stores')
    .update({ online_payment_enabled: false, active_payment_provider: null })
    .eq('id', store.id)
  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { provider } → disconnect one provider; hides the storefront too if
// it was the active one.
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { provider } = await request.json().catch(() => ({}))
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Fournisseur de paiement invalide.' }, { status: 400 })
  }

  const admin = createAdminClient()
  await admin.from('payment_integrations').delete().eq('store_id', store.id).eq('provider', provider)

  const { data: storeRow } = await admin.from('stores').select('active_payment_provider').eq('id', store.id).single()
  if (storeRow?.active_payment_provider === provider) {
    await admin.from('stores').update({ online_payment_enabled: false, active_payment_provider: null }).eq('id', store.id)
  }
  return NextResponse.json({ ok: true })
}
