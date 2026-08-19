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

/**
 * Revoke ALL app permissions for the user identified by `userToken`.
 *
 * Facebook grants are additive across sessions: once a user grants a scope
 * (e.g. business_management) to an app, it stays granted at the user level
 * even when subsequent FB.login() calls request only a subset — and the
 * persisted user-level scope set is what filters /me/accounts. So a token
 * that our client asked for with only 3 scopes can still be "polluted" by
 * previously-granted permissions and hit the personal-Page filter.
 *
 * This wipes the slate so the next FB.login() reissues a truly clean token
 * with only the current scope list. Called when listPages returns zero as
 * a self-heal path — the caller then tells the user to click Connect again.
 */
export async function revokeAllAppPermissions(userToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/me/permissions`)
  url.searchParams.set('access_token', userToken)
  const res = await fetch(url, { method: 'DELETE' })
  // Best-effort: if this fails, the manual "revoke on facebook.com" path still works.
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    console.error('[meta] revokeAllAppPermissions failed:', json.error ?? res.status)
  }
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
