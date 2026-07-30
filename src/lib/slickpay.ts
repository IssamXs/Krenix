// ============================================================
// SlickPay — online SATIM (CIB / Edahabia) payments for Algeria.
// Docs: https://developers.slick-pay.com  (v2 REST)
// Platform-owned key: SLICKPAY_PUBLIC_KEY (+ SLICKPAY_MODE sandbox|live).
// ============================================================
import crypto from 'crypto'

// Read the key at call time (not a module-level const) so tests that set env in
// beforeEach see it regardless of import evaluation order.
function slickpayKey(): string {
  return process.env.SLICKPAY_PUBLIC_KEY ?? ''
}

export function isSlickpayConfigured(): boolean {
  return !!slickpayKey()
}

export function slickpayBaseUrl(): string {
  const mode = (process.env.SLICKPAY_MODE ?? 'sandbox').toLowerCase()
  return mode === 'live'
    ? 'https://prodapi.slick-pay.com/api/v2'
    : 'https://devapi.slick-pay.com/api/v2'
}

function headers(key?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key ?? slickpayKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }
}

// Lightweight credential check for a store-supplied key — used when a
// merchant connects their own SlickPay account. Any successful response
// (even an empty accounts list) proves the key authenticates.
export async function validateSlickpayKey(key: string): Promise<boolean> {
  if (!key) return false
  try {
    const res = await fetch(`${slickpayBaseUrl()}/users/accounts`, { headers: headers(key) })
    return res.ok
  } catch {
    return false
  }
}

// SlickPay echoes the webhook_signature we set at invoice creation back in an
// inbound header. Timing-safe compare against our configured secret. The exact
// header name is not documented, so routes also re-verify status via the API —
// this check is defense-in-depth, not the sole gate.
export function verifyWebhookSignature(headerValue: string | null | undefined): boolean {
  const expected = process.env.SLICKPAY_WEBHOOK_SIGNATURE ?? ''
  if (!expected || !headerValue) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(headerValue), Buffer.from(expected))
  } catch {
    return false
  }
}

// Return the merchant bank-account UUID used on invoices. Prefers the env
// override; otherwise fetches the account flagged default:1. Cached per
// process — but ONLY for the platform's own key (no `key` arg). A store's own
// key must never hit this cache, or every store's invoices would end up
// pointing at whichever store happened to call first.
let cachedAccountUuid: string | null = null
export async function getDefaultAccountUuid(key?: string): Promise<string | undefined> {
  if (!key) {
    if (process.env.SLICKPAY_ACCOUNT_UUID) return process.env.SLICKPAY_ACCOUNT_UUID
    if (cachedAccountUuid) return cachedAccountUuid
  }
  const res = await fetch(`${slickpayBaseUrl()}/users/accounts`, { headers: headers(key) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return undefined
  const accounts = (data?.data ?? []) as Array<{ uuid: string; default: number }>
  const chosen = accounts.find(a => a.default === 1) ?? accounts[0]
  if (!key) cachedAccountUuid = chosen?.uuid ?? null
  return chosen?.uuid ?? undefined
}

export interface CreateInvoiceInput {
  amountDzd: number
  itemName: string
  buyer: { firstname: string; lastname: string; email: string; address?: string }
  returnUrl: string
  webhookUrl?: string
  metadata?: Record<string, string>
  /** A store's own SlickPay key — omit for Krenix's own platform billing. */
  key?: string
}

// Create a SATIM invoice; returns the SATIM payment page URL (response ROOT url)
// and the invoice id. fees:0 → merchant absorbs commission, client pays exact amount.
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ paymentUrl: string; invoiceId: number }> {
  const effectiveKey = input.key ?? slickpayKey()
  if (!effectiveKey) throw new Error('SlickPay non configuré (SLICKPAY_PUBLIC_KEY manquant)')
  const account = await getDefaultAccountUuid(input.key)

  const amount = Math.round(input.amountDzd)
  const body: Record<string, unknown> = {
    amount,
    fees: 0,
    items: [{ name: input.itemName, price: amount, quantity: 1 }],
    url: input.returnUrl,
    firstname: input.buyer.firstname,
    lastname: input.buyer.lastname,
    email: input.buyer.email,
    address: input.buyer.address || 'Algérie',
  }
  if (account) body.account = account
  if (input.webhookUrl) {
    body.webhook_url = input.webhookUrl
    body.webhook_signature = process.env.SLICKPAY_WEBHOOK_SIGNATURE
    if (input.metadata) body.webhook_meta_data = input.metadata
  }

  const res = await fetch(`${slickpayBaseUrl()}/users/invoices`, {
    method: 'POST', headers: headers(input.key), body: JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `SlickPay error (${res.status})`)
  }
  const paymentUrl = data.url as string | undefined
  const invoiceId = data.id as number | undefined
  if (!paymentUrl || !invoiceId) throw new Error('SlickPay: réponse sans url/id')
  return { paymentUrl, invoiceId }
}

// completed === 1 means paid; anything else is still pending/failed.
export async function getInvoiceStatus(invoiceId: number | string, key?: string): Promise<'paid' | 'pending'> {
  const res = await fetch(`${slickpayBaseUrl()}/users/invoices/${invoiceId}`, { headers: headers(key) })
  const data = await res.json().catch(() => ({}))
  const completed = data?.completed ?? data?.data?.completed
  return Number(completed) === 1 ? 'paid' : 'pending'
}
