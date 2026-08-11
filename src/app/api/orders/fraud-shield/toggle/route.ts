import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccountStore } from '@/lib/server-store'
import { getFraudShieldStatus } from '@/lib/fraud-shield/status'

// POST { enabled: boolean } — merchant toggles their Fraud Shield add-on on/off.
// Enabled may only be flipped WHILE a valid paid subscription is active: the AI
// detector is a paid feature, so switching it on requires an active purchase.
// (Store owners never touch the row directly — the service-role admin client
// does the write here.)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { enabled } = await request.json().catch(() => ({ enabled: undefined }))
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Paramètre enabled requis' }, { status: 400 })
    }

    const account = await resolveAccountStore(supabase, user.id, 'id')
    if (!account) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const status = await getFraudShieldStatus(supabase, account.id)
    if (enabled && !status.active) {
      return NextResponse.json(
        { error: 'Fraud Shield non actif : abonnement manquant ou expiré.', code: 'NOT_ACTIVE' },
        { status: 403 },
      )
    }

    const admin = createAdminClient()
    const { error } = await admin.from('stores').update({ fraud_shield_enabled: enabled }).eq('id', account.id)
    if (error) {
      console.error('Erreur activation Fraud Shield:', error)
      return NextResponse.json({ error: 'Erreur lors de l’activation' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, enabled })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
