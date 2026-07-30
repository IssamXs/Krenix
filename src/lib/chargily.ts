// ============================================================
// Chargily Pay v2 — online card payments (CIB / Edahabia) for Algeria.
// Docs: https://dev.chargily.com/pay-v2/introduction
// BYO-key (store-owned): each store supplies its own Chargily secret key —
// same per-store model as lib/slickpay.ts, not a platform-wide key.
// ============================================================
import crypto from 'crypto'

export function chargilyBaseUrl(mode?: string): string {
  const isLive = (mode ?? '').toLowerCase() === 'live'
  return isLive ? 'https://pay.chargily.net/api/v2' : 'https://pay.chargily.net/test/api/v2'
}

function headers(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

function modeFromKey(key: string): string {
  return key.startsWith('live_') ? 'live' : 'test'
}

// Lightweight credential check for a store-supplied key — used when a
// merchant connects their own Chargily account. Any successful response
// proves the key authenticates.
export async function validateChargilyKey(key: string): Promise<boolean> {
  if (!key) return false
  try {
    const res = await fetch(`${chargilyBaseUrl(modeFromKey(key))}/balance`, { headers: headers(key) })
    return res.ok
  } catch {
    return false
  }
}

export interface CreateChargilyCheckoutInput {
  amountDzd: number
  itemName: string
  successUrl: string
  failureUrl?: string
  webhookUrl?: string
  metadata?: Record<string, string>
  /** The store's own Chargily secret key. */
  key: string
}

// Create a hosted checkout; returns the URL to redirect the customer to.
export async function createCheckout(
  input: CreateChargilyCheckoutInput,
): Promise<{ checkoutUrl: string; id: string }> {
  const res = await fetch(`${chargilyBaseUrl(modeFromKey(input.key))}/checkouts`, {
    method: 'POST',
    headers: headers(input.key),
    body: JSON.stringify({
      amount: Math.round(input.amountDzd),
      currency: 'dzd',
      success_url: input.successUrl,
      failure_url: input.failureUrl ?? input.successUrl,
      webhook_endpoint: input.webhookUrl,
      description: input.itemName,
      metadata: input.metadata,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Chargily error (${res.status})`)
  }
  const checkoutUrl = data.checkout_url as string | undefined
  if (!checkoutUrl || !data.id) throw new Error('Chargily: réponse sans checkout_url/id')
  return { checkoutUrl, id: String(data.id) }
}

// paid → 'paid'; anything else (pending, failed, expired, canceled) → 'pending'.
export async function getCheckoutStatus(id: string, key: string): Promise<'paid' | 'pending'> {
  const res = await fetch(`${chargilyBaseUrl(modeFromKey(key))}/checkouts/${id}`, { headers: headers(key) })
  const data = await res.json().catch(() => ({}))
  return data?.status === 'paid' ? 'paid' : 'pending'
}

// Verify the webhook signature (HMAC-SHA256 of the raw body with the store's
// own secret key, sent in the `signature` header). Timing-safe comparison.
export function verifyChargilySignature(rawBody: string, signature: string | null, key: string): boolean {
  if (!key || !signature) return false
  const expected = crypto.createHmac('sha256', key).update(rawBody, 'utf8').digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
