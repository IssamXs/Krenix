import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { getYalidineFees } from '@/lib/yalidine'
import { wilayaId } from '@/lib/wilayas'

// GET ?toWilaya=<name> → Yalidine delivery fees from the store's pickup wilaya
// to the requested destination wilaya (per-commune home + stopdesk prices).
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  const toWilaya = new URL(request.url).searchParams.get('toWilaya')
  if (!toWilaya) return NextResponse.json({ error: 'toWilaya requis' }, { status: 400 })

  const admin = createAdminClient()
  const { data: integration } = await admin
    .from('delivery_integrations')
    .select('api_id, api_token, from_wilaya, enabled')
    .eq('store_id', store.id)
    .eq('provider', 'yalidine')
    .maybeSingle()
  if (!integration || !integration.enabled) {
    return NextResponse.json({ error: 'Yalidine non connecté' }, { status: 400 })
  }
  if (!integration.from_wilaya) {
    return NextResponse.json({ error: 'Wilaya de départ non configurée' }, { status: 400 })
  }

  const fromId = wilayaId(integration.from_wilaya)
  const toId = wilayaId(toWilaya)
  if (!fromId || !toId) {
    return NextResponse.json({ error: 'Wilaya inconnue' }, { status: 400 })
  }

  let creds
  try {
    creds = { apiId: decryptToken(integration.api_id), apiToken: decryptToken(integration.api_token) }
  } catch {
    return NextResponse.json({ error: 'Identifiants illisibles. Reconnectez Yalidine.' }, { status: 500 })
  }

  const fees = await getYalidineFees(creds, fromId, toId)
  if (!fees) return NextResponse.json({ error: 'Tarifs indisponibles pour cette destination' }, { status: 502 })

  return NextResponse.json({ fromWilaya: integration.from_wilaya, ...fees })
}
