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

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${slickpayKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
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
// override; otherwise fetches the account flagged default:1. Cached per process.
let cachedAccountUuid: string | null = null
export async function getDefaultAccountUuid(): Promise<string | undefined> {
  if (process.env.SLICKPAY_ACCOUNT_UUID) return process.env.SLICKPAY_ACCOUNT_UUID
  if (cachedAccountUuid) return cachedAccountUuid
  const res = await fetch(`${slickpayBaseUrl()}/users/accounts`, { headers: headers() })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return undefined
  const accounts = (data?.data ?? []) as Array<{ uuid: string; default: number }>
  const chosen = accounts.find(a => a.default === 1) ?? accounts[0]
  cachedAccountUuid = chosen?.uuid ?? null
  return cachedAccountUuid ?? undefined
}

export interface CreateInvoiceInput {
  amountDzd: number
  itemName: string
  buyer: { firstname: string; lastname: string; email: string; address?: string }
  returnUrl: string
  webhookUrl?: string
  metadata?: Record<string, string>
}

// Create a SATIM invoice; returns the SATIM payment page URL (response ROOT url)
// and the invoice id. fees:0 → merchant absorbs commission, client pays exact amount.
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ paymentUrl: string; invoiceId: number }> {
  if (!slickpayKey()) throw new Error('SlickPay non configuré (SLICKPAY_PUBLIC_KEY manquant)')
  const account = await getDefaultAccountUuid()

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
    method: 'POST', headers: headers(), body: JSON.stringify(body),
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
export async function getInvoiceStatus(invoiceId: number | string): Promise<'paid' | 'pending'> {
  const res = await fetch(`${slickpayBaseUrl()}/users/invoices/${invoiceId}`, { headers: headers() })
  const data = await res.json().catch(() => ({}))
  const completed = data?.completed ?? data?.data?.completed
  return Number(completed) === 1 ? 'paid' : 'pending'
}
