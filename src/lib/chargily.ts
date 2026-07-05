// ============================================================
// Chargily Pay v2 — online card payments (CIB / Edahabia) for Algeria.
// Docs: https://dev.chargily.com/pay-v2/introduction
//
// BYO-key (platform-owned): set CHARGILY_SECRET_KEY (+ optional CHARGILY_MODE).
// Test keys start with `test_sk_`, live keys with `live_sk_`; we pick the base
// URL from CHARGILY_MODE, falling back to the key prefix.
// ============================================================
import crypto from 'crypto'

const SECRET = process.env.CHARGILY_SECRET_KEY ?? ''

export function isChargilyConfigured(): boolean {
  return !!SECRET
}

function baseUrl(): string {
  const mode = (process.env.CHARGILY_MODE ?? '').toLowerCase()
  const isLive = mode === 'live' || (mode === '' && SECRET.startsWith('live_'))
  return isLive ? 'https://pay.chargily.net/api/v2' : 'https://pay.chargily.net/test/api/v2'
}

export interface ChargilyCheckoutInput {
  amountDzd: number
  successUrl: string
  failureUrl?: string
  webhookUrl?: string
  description?: string
  metadata?: Record<string, string>
}

// Create a hosted checkout; returns the URL to redirect the customer to.
export async function createChargilyCheckout(
  input: ChargilyCheckoutInput,
): Promise<{ checkoutUrl: string; id: string }> {
  if (!SECRET) throw new Error('Chargily non configuré (CHARGILY_SECRET_KEY manquant)')

  const res = await fetch(`${baseUrl()}/checkouts`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: Math.round(input.amountDzd),
      currency: 'dzd',
      success_url: input.successUrl,
      failure_url: input.failureUrl,
      webhook_endpoint: input.webhookUrl,
      description: input.description,
      metadata: input.metadata,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Chargily error (${res.status})`)
  }
  const checkoutUrl = data.checkout_url as string | undefined
  if (!checkoutUrl) throw new Error('Chargily: réponse sans checkout_url')
  return { checkoutUrl, id: data.id as string }
}

// Verify the webhook signature (HMAC-SHA256 of the raw body with the secret key,
// sent in the `signature` header). Timing-safe comparison.
export function verifyChargilySignature(rawBody: string, signature: string | null): boolean {
  if (!SECRET || !signature) return false
  const expected = crypto.createHmac('sha256', SECRET).update(rawBody, 'utf8').digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}
