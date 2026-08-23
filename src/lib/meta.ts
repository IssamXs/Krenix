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

// Graph API error `code` 190 is always an invalid/expired OAuth token (password
// change, token revoke, permission removal) — distinct from transient failures
// (rate limits, user unreachable) which must NOT disable the connection.
export class MetaSendError extends Error {
  code: number | null
  constructor(message: string, code: number | null) {
    super(message)
    this.code = code
  }
}

export function isInvalidTokenError(err: unknown): boolean {
  return err instanceof MetaSendError && err.code === 190
}

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
    throw new MetaSendError(json.error?.message ?? `Send failed (${res.status})`, json.error?.code ?? null)
  }
}

// ---- Inbound attachments ----

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_FETCH_TIMEOUT_MS = 8_000

export interface InboundImage {
  base64: string
  mimeType: string
}

// Meta serves inbound attachments from a signed, short-lived CDN URL that needs
// no page token. Returns null on ANY failure: a photo we cannot read must
// degrade to a text-only turn, never throw and take the webhook batch down with
// it.
export async function fetchInboundImage(url: string): Promise<InboundImage | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null

    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!mimeType.startsWith('image/')) return null

    const reader = res.body?.getReader()
    if (!reader) return null

    // Cap on bytes actually read — Content-Length may be absent or a lie.
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
    if (total === 0) return null

    return { base64: Buffer.concat(chunks).toString('base64'), mimeType }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
