import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'

// TEMPORARY diagnostic route — remove once the real WeCan endpoint is found.
// Requires the caller's own logged-in session (same auth as every other
// /api/integrations/delivery route). Decrypts THIS STORE's own saved WeCan
// credentials server-side and probes a list of candidate paths against the
// live API. Never returns the credentials themselves — only status codes
// and truncated response bodies, safe to paste into chat.
const BASE = 'https://wecanservices.me/api/v1'

const CANDIDATES: { method: 'GET' | 'POST'; path: string; body?: string }[] = [
  { method: 'GET', path: '/orders' },
  { method: 'POST', path: '/orders', body: '[]' },
  { method: 'POST', path: '/order', body: '{}' },
  { method: 'GET', path: '/wilayas' },
  { method: 'GET', path: '/communes' },
  { method: 'GET', path: '/parcels' },
  { method: 'POST', path: '/parcels', body: '[]' },
  { method: 'POST', path: '/parcel', body: '{}' },
  { method: 'GET', path: '/user' },
  { method: 'GET', path: '/me' },
  { method: 'GET', path: '/account' },
  { method: 'GET', path: '/stores' },
  { method: 'GET', path: '/store' },
  { method: 'GET', path: '/pickup' },
  { method: 'GET', path: '/pickup-points' },
  { method: 'GET', path: '/fees' },
  { method: 'GET', path: '/tarifs' },
  { method: 'GET', path: '/tarification' },
  { method: 'GET', path: '/tracking' },
  { method: 'GET', path: '/status' },
  { method: 'GET', path: '' },
]

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
    const store = await resolveActiveStoreServer(supabase, user.id, 'id')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const admin = createAdminClient()
    const { data: integration } = await admin
      .from('delivery_integrations')
      .select('api_id, api_token')
      .eq('store_id', store.id)
      .eq('provider', 'wecan')
      .single()
    if (!integration) return NextResponse.json({ error: 'WECAN non connecté sur cette boutique' }, { status: 404 })

    let apiId: string, apiToken: string
    try {
      apiId = decryptToken(integration.api_id)
      apiToken = decryptToken(integration.api_token)
    } catch {
      return NextResponse.json({ error: 'Identifiants illisibles' }, { status: 500 })
    }

    const headers: Record<string, string> = {
      'X-API-ID': apiId,
      'X-API-TOKEN': apiToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }

    const results: { method: string; path: string; status: number | string; body: string }[] = []
    for (const c of CANDIDATES) {
      try {
        const res = await fetch(`${BASE}${c.path}`, { method: c.method, headers, body: c.body })
        const text = await res.text().catch(() => '')
        results.push({ method: c.method, path: c.path || '(root)', status: res.status, body: text.slice(0, 200) })
      } catch (e) {
        results.push({ method: c.method, path: c.path, status: 'ERROR', body: e instanceof Error ? e.message : String(e) })
      }
      await new Promise(r => setTimeout(r, 250)) // stay under WECAN's 5 req/s quota
    }

    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: 'Erreur serveur', detail: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
