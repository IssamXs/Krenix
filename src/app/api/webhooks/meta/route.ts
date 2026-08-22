import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleInboundMessage } from '@/lib/chatbot-core'
import { verifyMetaSignature, sendMetaMessage, isInvalidTokenError } from '@/lib/meta'
import { decryptToken } from '@/lib/crypto'
import { notifyChannelDisconnected } from '@/lib/telegram'
import type { ChannelPlatform } from '@/types/database'

// GET → Meta verification handshake
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

interface MetaMessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  message?: { text?: string; is_echo?: boolean }
}

export async function POST(request: Request) {
  const raw = await request.text()
  const sig = request.headers.get('x-hub-signature-256')
  if (!verifyMetaSignature(raw, sig, process.env.META_APP_SECRET ?? '')) {
    return new Response('Invalid signature', { status: 403 })
  }

  let body: { object?: string; entry?: Array<{ id: string; messaging?: MetaMessagingEvent[] }> }
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  // `object` is 'page' for Messenger and 'instagram' for IG.
  const platform: ChannelPlatform = body.object === 'instagram' ? 'instagram' : 'messenger'
  const admin = createAdminClient()

  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const text = ev.message?.text
      const senderId = ev.sender?.id
      // Skip echoes, non-text, and malformed events.
      if (!text || !senderId || ev.message?.is_echo) continue

      // Resolve the store's connection. For messenger the page id is entry.id /
      // recipient.id; for instagram the ig id is entry.id / recipient.id.
      const assetId = ev.recipient?.id ?? entry.id
      const column = platform === 'instagram' ? 'ig_id' : 'page_id'
      const { data: conn } = await admin
        .from('channel_connections')
        .select('store_id, page_access_token, page_name, enabled')
        .eq('platform', platform)
        .eq(column, assetId)
        .single()

      if (!conn || !conn.enabled) continue

      let reply: string
      try {
        ;({ reply } = await handleInboundMessage({
          storeId: conn.store_id,
          sessionKey: `${platform}:${senderId}`,
          text,
          channel: platform,
        }))
      } catch (err) {
        console.error('Meta webhook handling error:', err)
        continue // Swallow — always 200 so Meta does not retry-storm.
      }

      try {
        await sendMetaMessage(decryptToken(conn.page_access_token), senderId, reply)
      } catch (err) {
        console.error('Meta send error:', err)
        // An invalid/expired token will fail on EVERY message, silently, forever.
        // Disable the connection so we stop trying (and stop hiding the outage
        // behind server logs no one is watching), and alert once.
        if (isInvalidTokenError(err)) {
          await admin.from('channel_connections').update({ enabled: false }).eq('store_id', conn.store_id).eq('platform', platform)
          await notifyChannelDisconnected(admin, conn.store_id, platform, conn.page_name ?? null)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
