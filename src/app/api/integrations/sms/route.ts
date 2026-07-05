import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { encryptToken } from '@/lib/crypto'
import { validateTwilioCredentials } from '@/lib/twilio'
import { BUSINESS_PLANS, type Plan } from '@/types/database'

async function ownerStore(requirePlan = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  if (requirePlan && !BUSINESS_PLANS.includes(store.plan as Plan)) {
    return { error: 'Réservé aux plans Business et plus' as const, status: 403 }
  }
  return { storeId: store.id as string }
}

// GET → redacted status (sender only, no secrets)
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data } = await admin
    .from('sms_integrations')
    .select('sender, enabled')
    .eq('store_id', s.storeId)
    .eq('provider', 'twilio')
    .maybeSingle()
  return NextResponse.json({ connected: !!data, sender: data?.sender ?? null })
}

// POST { accountSid, authToken, sender } → validate then store encrypted
export async function POST(request: Request) {
  const s = await ownerStore(true)
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { accountSid, authToken, sender } = await request.json()
  if (!accountSid?.trim() || !authToken?.trim() || !sender?.trim()) {
    return NextResponse.json({ error: 'SID, token et numéro expéditeur requis' }, { status: 400 })
  }

  const valid = await validateTwilioCredentials({ accountSid: accountSid.trim(), authToken: authToken.trim(), sender: sender.trim() })
  if (!valid) {
    return NextResponse.json({ error: 'Identifiants Twilio invalides.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('sms_integrations').upsert({
    store_id: s.storeId,
    provider: 'twilio',
    account_sid: encryptToken(accountSid.trim()),
    auth_token: encryptToken(authToken.trim()),
    sender: sender.trim(),
    enabled: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id,provider' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ connected: true, sender: sender.trim() })
}

// DELETE → remove
export async function DELETE() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  await admin.from('sms_integrations').delete().eq('store_id', s.storeId).eq('provider', 'twilio')
  return NextResponse.json({ ok: true })
}
