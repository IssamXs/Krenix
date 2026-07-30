import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { encryptToken } from '@/lib/crypto'
import { validateSlickpayKey } from '@/lib/slickpay'

async function ownerStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  return store
}

// GET → connection status only (never the key itself).
export async function GET() {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: integration } = await admin
    .from('payment_integrations')
    .select('enabled')
    .eq('store_id', store.id)
    .eq('provider', 'slickpay')
    .maybeSingle()

  const { data: storeRow } = await admin
    .from('stores')
    .select('online_payment_enabled')
    .eq('id', store.id)
    .single()

  return NextResponse.json({
    connected: !!integration,
    enabled: integration?.enabled ?? false,
    showOnStorefront: storeRow?.online_payment_enabled ?? false,
  })
}

// POST { publicKey } → validate + encrypt + connect (or reconnect with a new key).
export async function POST(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { publicKey } = await request.json().catch(() => ({}))
  if (!publicKey || typeof publicKey !== 'string') {
    return NextResponse.json({ error: 'Clé publique SlickPay requise.' }, { status: 400 })
  }

  const valid = await validateSlickpayKey(publicKey)
  if (!valid) {
    return NextResponse.json({ error: 'Clé SlickPay invalide. Vérifiez votre clé publique.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('payment_integrations').upsert({
    store_id: store.id,
    provider: 'slickpay',
    public_key: encryptToken(publicKey),
    enabled: true,
  }, { onConflict: 'store_id,provider' })

  if (error) return NextResponse.json({ error: 'Erreur lors de la connexion.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { showOnStorefront } → toggle storefront visibility. Refuses to turn
// it on if no integration is connected yet.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { showOnStorefront } = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  if (showOnStorefront) {
    const { data: integration } = await admin
      .from('payment_integrations')
      .select('id, enabled')
      .eq('store_id', store.id)
      .eq('provider', 'slickpay')
      .maybeSingle()
    if (!integration || !integration.enabled) {
      return NextResponse.json({ error: 'Connectez votre compte SlickPay avant de l\'afficher sur votre boutique.' }, { status: 400 })
    }
  }

  const { error } = await admin.from('stores').update({ online_payment_enabled: !!showOnStorefront }).eq('id', store.id)
  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE → disconnect entirely (also hides it from the storefront).
export async function DELETE() {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  await admin.from('payment_integrations').delete().eq('store_id', store.id).eq('provider', 'slickpay')
  await admin.from('stores').update({ online_payment_enabled: false }).eq('id', store.id)
  return NextResponse.json({ ok: true })
}
