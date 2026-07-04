import { createHmac, timingSafeEqual } from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

// ---- Webhook signature (pure, unit-tested) ----
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const got = signatureHeader.slice('sha256='.length)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(got, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---- OAuth / Pages ----
export interface MetaPage {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string }
}

export async function exchangeLongLivedToken(shortToken: string): Promise<string> {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', process.env.META_APP_ID!)
  url.searchParams.set('client_secret', process.env.META_APP_SECRET!)
  url.searchParams.set('fb_exchange_token', shortToken)
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (!res.ok || !json.access_token) throw new Error(json.error?.message ?? 'Token exchange failed')
  return json.access_token as string
}

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH}/me/accounts`)
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account')
  url.searchParams.set('access_token', userToken)
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to list pages')
  return (json.data ?? []) as MetaPage[]
}

export async function subscribePage(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`)
  url.searchParams.set('subscribed_fields', 'messages,messaging_postbacks')
  url.searchParams.set('access_token', pageToken)
  const res = await fetch(url, { method: 'POST' })
  const json = await res.json()
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to subscribe page')
}

export async function unsubscribePage(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`)
  url.searchParams.set('access_token', pageToken)
  const res = await fetch(url, { method: 'DELETE' })
  // Best-effort: ignore failures on disconnect (token may already be invalid).
  await res.json().catch(() => null)
}

// ---- Send API ----
export async function sendMetaMessage(
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const url = new URL(`${GRAPH}/me/messages`)
  url.searchParams.set('access_token', pageToken)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error?.message ?? `Send failed (${res.status})`)
  }
}
