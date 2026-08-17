import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  MAX_TELEGRAM_RECIPIENTS,
  TELEGRAM_LINK_CODE_TTL_MS,
  isTelegramBotConfigured,
  telegramBotUsername,
} from '@/lib/telegram'
import { ULTIMATE_PLANS, type Plan, type StoreSettings } from '@/types/database'

// Telegram new-order alerts — recipient management for the store owner.
//
// GET    → connected recipients + whether alerts are on
// POST   → mint a one-time link code, return the t.me deep link to share
// DELETE → disconnect one recipient (?id=)
//
// Chat ids are NEVER accepted from this route. They can only be learned from
// Telegram itself in /api/webhooks/telegram, after the person opens the bot —
// otherwise anyone could point a store's alerts (customer names and phone
// numbers) at a chat they don't control. See database/059 for the handshake.
async function ownerStore(requirePlan = false) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, settings')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  if (requirePlan && !ULTIMATE_PLANS.includes(store.plan as Plan)) {
    return { error: 'Réservé aux plans Ultimate et plus' as const, status: 403 }
  }
  return { storeId: store.id as string, settings: (store.settings ?? {}) as StoreSettings }
}

export async function GET() {
  try {
    const s = await ownerStore(true)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

    const admin = createAdminClient()
    const { data } = await admin
      .from('telegram_recipients')
      .select('id, label, chat_id, created_at')
      .eq('store_id', s.storeId)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      // A missing bot username means the deep link can't be built — surface it
      // so the UI explains the setup gap instead of showing a broken link.
      configured: isTelegramBotConfigured() && !!telegramBotUsername(),
      enabled: s.settings.notifyTelegramOrders !== false,
      maxRecipients: MAX_TELEGRAM_RECIPIENTS,
      recipients: (data ?? []).map(r => ({
        id: r.id,
        label: r.label,
        // Last 4 digits only — enough for the owner to recognize a chat,
        // not enough to be useful anywhere else.
        chatHint: String(r.chat_id).slice(-4),
        created_at: r.created_at,
      })),
    })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}

// POST { label } → { url, code, expiresAt }
export async function POST(request: Request) {
  try {
    const s = await ownerStore(true)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

    const username = telegramBotUsername()
    if (!isTelegramBotConfigured() || !username) {
      return NextResponse.json({ error: 'Bot Telegram non configuré sur la plateforme.' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({})) as { label?: string }
    const label = String(body.label ?? '').trim().slice(0, 40)
    if (!label) return NextResponse.json({ error: 'Nom du destinataire requis.' }, { status: 400 })

    const admin = createAdminClient()
    const { count } = await admin
      .from('telegram_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', s.storeId)
    if ((count ?? 0) >= MAX_TELEGRAM_RECIPIENTS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_TELEGRAM_RECIPIENTS} destinataires. Supprimez-en un d'abord.` },
        { status: 400 },
      )
    }

    // base64url keeps the code inside Telegram's [A-Za-z0-9_-] start-payload
    // charset; 18 bytes → 24 chars, far too large to guess within the 15-min TTL.
    const code = randomBytes(18).toString('base64url')
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_CODE_TTL_MS).toISOString()

    const { error } = await admin.from('telegram_link_codes').insert({
      code, store_id: s.storeId, label, expires_at: expiresAt,
    })
    if (error) {
      console.error('[api/integrations/telegram] code insert failed:', error)
      return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
    }

    return NextResponse.json({ url: `https://t.me/${username}?start=${code}`, expiresAt })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}

// DELETE ?id=<recipient id>
export async function DELETE(request: Request) {
  try {
    const s = await ownerStore(true)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Destinataire manquant.' }, { status: 400 })

    const admin = createAdminClient()
    // Scoped by store_id as well as id — an owner must not be able to delete
    // another store's recipient by guessing a uuid.
    await admin.from('telegram_recipients').delete().eq('id', id).eq('store_id', s.storeId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}

// PATCH { enabled } → master on/off, stored on stores.settings
export async function PATCH(request: Request) {
  try {
    const s = await ownerStore(true)
    if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

    const { enabled } = await request.json().catch(() => ({})) as { enabled?: boolean }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'Valeur invalide.' }, { status: 400 })
    }

    const admin = createAdminClient()
    await admin
      .from('stores')
      .update({ settings: { ...s.settings, notifyTelegramOrders: enabled } })
      .eq('id', s.storeId)
    return NextResponse.json({ ok: true, enabled })
  } catch {
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 })
  }
}
