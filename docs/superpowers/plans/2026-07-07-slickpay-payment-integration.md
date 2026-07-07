# SlickPay Payment Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Chargily with SlickPay so customers pay Krenix plans/top-ups with CIB/Edahabia and get activated automatically.

**Architecture:** A raw-`fetch` provider lib (`lib/slickpay.ts`) creates SATIM invoices and reads their status; a checkout route creates a pending record + invoice; a webhook route AND a return route both re-verify status via SlickPay's API and call the existing idempotent activation engine (`lib/activation.ts`). No new npm dependency — matches the existing Chargily pattern.

**Tech Stack:** Next.js 14 App Router (route handlers), TypeScript strict, Supabase (service-role admin client), vitest for unit tests. SlickPay REST API v2.

**Spec:** `docs/superpowers/specs/2026-07-07-slickpay-payment-integration-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/slickpay.ts` (new) | SlickPay REST wrapper: config, create invoice, get status, verify webhook signature |
| `src/lib/slickpay.test.ts` (new) | Unit tests for the wrapper (config, signature, request/response shape via mocked fetch) |
| `src/lib/activation.ts` (modify) | Add shared `confirmAndActivate()` used by both the webhook and return routes |
| `Database/027_slickpay.sql` (new) | Add `provider_ref` to `subscriptions` + `credit_purchases` |
| `src/app/api/payments/slickpay/checkout/route.ts` (new) | Create pending record + SlickPay invoice, return checkoutUrl |
| `src/app/api/webhooks/slickpay/route.ts` (new) | Automatic confirmation on SlickPay POST |
| `src/app/api/payments/slickpay/return/route.ts` (new) | Fallback confirmation on customer redirect |
| `src/app/(platform)/activate/page.tsx` (modify) | Point "Payer en ligne" at the SlickPay checkout |
| `src/app/(platform)/dashboard/billing/credits/page.tsx` (modify) | Point "Payer en ligne" at the SlickPay checkout |
| `env.example` (modify) | Document SlickPay env vars, drop Chargily |
| Chargily files (delete) | `lib/chargily.ts`, `api/payments/chargily/checkout/route.ts`, `api/webhooks/chargily/route.ts` |

**Reused unchanged:** `PLAN_AMOUNTS_DZD`, `PLAN_LABELS`, `CREDIT_PACKS`, `MESSAGE_PACKS`, `CreditPurchaseKind` (`src/types/database.ts`); `activateStorePlan`, `grantTopup` (`src/lib/activation.ts`); `resolveAccountStore` (`src/lib/server-store.ts`); `createAdminClient`, `createClient`.

---

## Task 1: SlickPay provider lib + tests

**Files:**
- Create: `src/lib/slickpay.ts`
- Test: `src/lib/slickpay.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/slickpay.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isSlickpayConfigured, slickpayBaseUrl, verifyWebhookSignature,
  createInvoice, getInvoiceStatus,
} from './slickpay'

beforeEach(() => {
  process.env.SLICKPAY_PUBLIC_KEY = 'pk_test_123'
  process.env.SLICKPAY_MODE = 'sandbox'
  process.env.SLICKPAY_WEBHOOK_SIGNATURE = 'whsig_secret'
  process.env.SLICKPAY_ACCOUNT_UUID = 'acct-uuid-1'
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('config', () => {
  it('is configured when the key is set', () => {
    expect(isSlickpayConfigured()).toBe(true)
  })
  it('picks sandbox vs prod base url from SLICKPAY_MODE', () => {
    process.env.SLICKPAY_MODE = 'sandbox'
    expect(slickpayBaseUrl()).toBe('https://devapi.slick-pay.com/api/v2')
    process.env.SLICKPAY_MODE = 'live'
    expect(slickpayBaseUrl()).toBe('https://prodapi.slick-pay.com/api/v2')
  })
})

describe('verifyWebhookSignature', () => {
  it('accepts the exact configured signature', () => {
    expect(verifyWebhookSignature('whsig_secret')).toBe(true)
  })
  it('rejects a wrong or missing signature', () => {
    expect(verifyWebhookSignature('nope')).toBe(false)
    expect(verifyWebhookSignature(null)).toBe(false)
  })
})

describe('createInvoice', () => {
  it('posts amount, one item, fees:0, urls and returns paymentUrl + id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 3140458, url: 'https://cib.satim.dz/pay?mdOrder=X' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createInvoice({
      amountDzd: 3000,
      itemName: 'Krenix — Plan Pro',
      buyer: { firstname: 'A', lastname: 'B', email: 'a@b.dz' },
      returnUrl: 'https://site/return',
      webhookUrl: 'https://site/hook',
      metadata: { record_type: 'subscription', record_id: 'r1', store_id: 's1' },
    })

    expect(res).toEqual({ paymentUrl: 'https://cib.satim.dz/pay?mdOrder=X', invoiceId: 3140458 })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://devapi.slick-pay.com/api/v2/users/invoices')
    const body = JSON.parse(opts.body)
    expect(body.amount).toBe(3000)
    expect(body.fees).toBe(0)
    expect(body.items).toEqual([{ name: 'Krenix — Plan Pro', price: 3000, quantity: 1 }])
    expect(body.url).toBe('https://site/return')
    expect(body.webhook_url).toBe('https://site/hook')
    expect(body.webhook_meta_data).toEqual({ record_type: 'subscription', record_id: 'r1', store_id: 's1' })
    expect(opts.headers.Authorization).toBe('Bearer pk_test_123')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ message: 'The amount field is required.' }),
    }))
    await expect(createInvoice({
      amountDzd: 50, itemName: 'x', buyer: { firstname: 'A', lastname: 'B', email: 'a@b.dz' }, returnUrl: 'u',
    })).rejects.toThrow('The amount field is required.')
  })
})

describe('getInvoiceStatus', () => {
  it('maps completed:1 to paid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: 1, completed: 1, data: { id: 1, completed: 1 } }),
    }))
    expect(await getInvoiceStatus(1)).toBe('paid')
  })
  it('maps completed:0 to pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: 1, completed: 0, data: { id: 1, completed: 0 } }),
    }))
    expect(await getInvoiceStatus(1)).toBe('pending')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/slickpay.test.ts`
Expected: FAIL — `Failed to resolve import "./slickpay"` (module doesn't exist yet).

- [ ] **Step 3: Implement `src/lib/slickpay.ts`**

```ts
// ============================================================
// SlickPay — online SATIM (CIB / Edahabia) payments for Algeria.
// Docs: https://developers.slick-pay.com  (v2 REST)
// Platform-owned key: SLICKPAY_PUBLIC_KEY (+ SLICKPAY_MODE sandbox|live).
// ============================================================
import crypto from 'crypto'

const KEY = process.env.SLICKPAY_PUBLIC_KEY ?? ''

export function isSlickpayConfigured(): boolean {
  return !!KEY
}

export function slickpayBaseUrl(): string {
  const mode = (process.env.SLICKPAY_MODE ?? 'sandbox').toLowerCase()
  return mode === 'live'
    ? 'https://prodapi.slick-pay.com/api/v2'
    : 'https://devapi.slick-pay.com/api/v2'
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${KEY}`,
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
  buyer: { firstname: string; lastname: string; email: string }
  returnUrl: string
  webhookUrl?: string
  metadata?: Record<string, string>
}

// Create a SATIM invoice; returns the SATIM payment page URL (response ROOT url)
// and the invoice id. fees:0 → merchant absorbs commission, client pays exact amount.
export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<{ paymentUrl: string; invoiceId: number }> {
  if (!KEY) throw new Error('SlickPay non configuré (SLICKPAY_PUBLIC_KEY manquant)')
  const account = await getDefaultAccountUuid()

  const body: Record<string, unknown> = {
    amount: Math.round(input.amountDzd),
    fees: 0,
    items: [{ name: input.itemName, price: Math.round(input.amountDzd), quantity: 1 }],
    url: input.returnUrl,
    firstname: input.buyer.firstname,
    lastname: input.buyer.lastname,
    email: input.buyer.email,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/slickpay.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/slickpay.ts src/lib/slickpay.test.ts
git commit -m "feat(payments): SlickPay provider lib (create invoice, status, webhook verify)"
```

---

## Task 2: Migration — provider_ref columns

**Files:**
- Create: `Database/027_slickpay.sql`

- [ ] **Step 1: Write the migration**

Create `Database/027_slickpay.sql`:

```sql
-- ============================================================
-- SlickPay: store the SlickPay invoice id on each pending payment record so the
-- webhook + return route can re-verify status by record. Service-role write only.
-- ============================================================
ALTER TABLE subscriptions     ADD COLUMN IF NOT EXISTS provider_ref TEXT;
ALTER TABLE credit_purchases  ADD COLUMN IF NOT EXISTS provider_ref TEXT;
```

- [ ] **Step 2: Verify the SQL is valid by reading it back**

Run: `cat Database/027_slickpay.sql`
Expected: the two `ALTER TABLE ... ADD COLUMN IF NOT EXISTS provider_ref TEXT;` statements.

(The owner runs this in the Supabase SQL editor — it is idempotent and safe to re-run.)

- [ ] **Step 3: Commit**

```bash
git add Database/027_slickpay.sql
git commit -m "feat(payments): migration 027 — provider_ref on subscriptions + credit_purchases"
```

---

## Task 3: Shared confirm-and-activate helper

**Files:**
- Modify: `src/lib/activation.ts` (append a function at end of file)

- [ ] **Step 1: Add `confirmAndActivate` to `src/lib/activation.ts`**

Append this function (keep existing `activateStorePlan` / `grantTopup` unchanged):

```ts
// Confirm a pending payment record and grant its plan/top-up — idempotently.
// The UPDATE only matches a still-'pending' row, so webhook + return route (and
// webhook retries) can all call this without ever double-granting. Returns true
// if THIS call performed the grant, false if it was already confirmed / not found.
export async function confirmAndActivate(
  admin: SupabaseClient,
  recordType: 'subscription' | 'credit_purchase',
  recordId: string,
  storeId: string,
): Promise<boolean> {
  if (recordType === 'subscription') {
    const { data: sub } = await admin
      .from('subscriptions')
      .update({ status: 'active', confirmed_at: new Date().toISOString(), started_at: new Date().toISOString() })
      .eq('id', recordId).eq('status', 'pending')
      .select('plan')
      .maybeSingle()
    if (!sub) return false
    await activateStorePlan(admin, storeId, sub.plan as Plan)
    return true
  }
  const { data: cp } = await admin
    .from('credit_purchases')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('id', recordId).eq('status', 'pending')
    .select('kind, quantity')
    .maybeSingle()
  if (!cp) return false
  await grantTopup(admin, storeId, cp.kind as 'ai_credits' | 'chatbot_messages', cp.quantity as number)
  return true
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean). `SupabaseClient` and `Plan` are already imported at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/activation.ts
git commit -m "feat(payments): shared idempotent confirmAndActivate helper"
```

---

## Task 4: Checkout route

**Files:**
- Create: `src/app/api/payments/slickpay/checkout/route.ts`

- [ ] **Step 1: Implement the checkout route**

Create `src/app/api/payments/slickpay/checkout/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAccountStore } from '@/lib/server-store'
import { createInvoice, isSlickpayConfigured } from '@/lib/slickpay'
import {
  PLAN_AMOUNTS_DZD, PLAN_LABELS, CREDIT_PACKS, MESSAGE_PACKS,
  type Plan, type CreditPurchaseKind,
} from '@/types/database'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// POST { kind:'plan', plan } | { kind:'ai_credits'|'chatbot_messages', quantity }
// → pending record + SlickPay invoice → { checkoutUrl }.
export async function POST(request: Request) {
  if (!isSlickpayConfigured()) {
    return NextResponse.json({ error: 'Paiement en ligne non configuré.', code: 'NOT_CONFIGURED' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const account = await resolveAccountStore(supabase, user.id, 'id, slug, plan')
  if (!account) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const kind = body.kind as 'plan' | CreditPurchaseKind
  const origin = originOf(request)
  // SlickPay can only reach a public HTTPS webhook. On localhost, skip it — the
  // return route reconciles instead.
  const webhookUrl = origin.startsWith('https://') && !origin.includes('localhost')
    ? `${origin}/api/webhooks/slickpay` : undefined

  const buyer = {
    firstname: account.slug || 'Client',
    lastname: 'Krenix',
    email: user.email ?? 'client@krenix.store',
  }

  let amountDzd: number
  let itemName: string
  let recordType: 'subscription' | 'credit_purchase'
  let recordId: string
  let returnPath: string

  if (kind === 'plan') {
    const plan = body.plan as Plan
    amountDzd = PLAN_AMOUNTS_DZD[plan]
    if (!amountDzd || plan === 'sur_mesure') {
      return NextResponse.json({ error: 'Plan invalide pour paiement en ligne' }, { status: 400 })
    }
    itemName = `Krenix — Plan ${PLAN_LABELS[plan]} (${account.slug})`
    const { data: sub, error } = await admin.from('subscriptions').insert({
      store_id: account.id, plan, amount_dzd: amountDzd, status: 'pending', notes: 'SlickPay (en ligne)',
    }).select('id').single()
    if (error || !sub) return NextResponse.json({ error: 'Erreur de création du paiement' }, { status: 500 })
    recordType = 'subscription'; recordId = sub.id
    returnPath = 'subscription'
  } else if (kind === 'ai_credits' || kind === 'chatbot_messages') {
    const quantity = Number(body.quantity)
    const packs = kind === 'ai_credits' ? CREDIT_PACKS : MESSAGE_PACKS
    const pack = packs.find(p => p.quantity === quantity)
    if (!pack) return NextResponse.json({ error: 'Pack invalide' }, { status: 400 })
    amountDzd = pack.amountDzd
    itemName = `Krenix — ${pack.label} (${account.slug})`
    const { data: cp, error } = await admin.from('credit_purchases').insert({
      store_id: account.id, kind, quantity: pack.quantity, amount_dzd: amountDzd, status: 'pending',
    }).select('id').single()
    if (error || !cp) return NextResponse.json({ error: 'Erreur de création du paiement' }, { status: 500 })
    recordType = 'credit_purchase'; recordId = cp.id
    returnPath = 'credit_purchase'
  } else {
    return NextResponse.json({ error: 'Type de paiement invalide' }, { status: 400 })
  }

  const returnUrl = `${origin}/api/payments/slickpay/return?record_type=${returnPath}&record_id=${recordId}`

  try {
    const { paymentUrl, invoiceId } = await createInvoice({
      amountDzd, itemName, buyer, returnUrl, webhookUrl,
      metadata: { record_type: recordType, record_id: recordId, store_id: account.id },
    })
    await admin.from(recordType === 'subscription' ? 'subscriptions' : 'credit_purchases')
      .update({ provider_ref: String(invoiceId) }).eq('id', recordId)
    return NextResponse.json({ checkoutUrl: paymentUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur SlickPay'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payments/slickpay/checkout/route.ts
git commit -m "feat(payments): SlickPay checkout route (pending record + invoice)"
```

---

## Task 5: Webhook route

**Files:**
- Create: `src/app/api/webhooks/slickpay/route.ts`

- [ ] **Step 1: Implement the webhook route**

Create `src/app/api/webhooks/slickpay/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'

// SlickPay POSTs the invoice payload when payment status changes. We re-verify
// status via the API (source of truth) before granting, so a spoofed webhook
// can't activate anything. Always 200 to avoid retry storms.
export async function POST(request: Request) {
  const raw = await request.text()
  // Best-effort signature check across likely header names (name is undocumented).
  const sig = request.headers.get('signature')
    ?? request.headers.get('x-signature')
    ?? request.headers.get('webhook-signature')
  if (sig && !verifyWebhookSignature(sig)) {
    console.warn('[slickpay webhook] signature mismatch — relying on status re-check')
  }

  let payload: { id?: number; data?: { id?: number }; webhook_meta_data?: Record<string, string> }
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const meta = payload.webhook_meta_data ?? {}
  const recordType = meta.record_type as 'subscription' | 'credit_purchase' | undefined
  const recordId = meta.record_id
  const storeId = meta.store_id
  const invoiceId = payload.id ?? payload.data?.id
  if (!recordType || !recordId || !storeId || !invoiceId) return NextResponse.json({ ok: true })

  try {
    const status = await getInvoiceStatus(invoiceId)
    if (status === 'paid') {
      const admin = createAdminClient()
      await confirmAndActivate(admin, recordType, recordId, storeId)
    }
  } catch (err) {
    console.error('[slickpay webhook] error:', err)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/webhooks/slickpay/route.ts
git commit -m "feat(payments): SlickPay webhook — status-verified auto activation"
```

---

## Task 6: Return route (fallback)

**Files:**
- Create: `src/app/api/payments/slickpay/return/route.ts`

- [ ] **Step 1: Implement the return route**

Create `src/app/api/payments/slickpay/return/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// SlickPay redirects the customer here after payment. We re-verify status via the
// API and activate if paid (covers dev/localhost where the webhook can't reach us,
// and delayed webhooks). Idempotent via confirmAndActivate.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const recordType = url.searchParams.get('record_type') as 'subscription' | 'credit_purchase' | null
  const recordId = url.searchParams.get('record_id')
  const origin = originOf(request)

  const okPath = recordType === 'credit_purchase' ? '/dashboard/billing/credits?paid=1' : '/dashboard?paid=1'
  const failPath = recordType === 'credit_purchase' ? '/dashboard/billing/credits?failed=1' : '/activate?failed=1'

  if (!recordType || !recordId) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  const admin = createAdminClient()
  const table = recordType === 'subscription' ? 'subscriptions' : 'credit_purchases'
  const { data: record } = await admin.from(table)
    .select('provider_ref, store_id').eq('id', recordId).maybeSingle()

  if (!record?.provider_ref || !record.store_id) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  try {
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      return NextResponse.redirect(new URL(okPath, origin))
    }
  } catch (err) {
    console.error('[slickpay return] error:', err)
  }
  return NextResponse.redirect(new URL(failPath, origin))
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/payments/slickpay/return/route.ts
git commit -m "feat(payments): SlickPay return route (fallback activation)"
```

---

## Task 7: Point the UI at SlickPay

**Files:**
- Modify: `src/app/(platform)/activate/page.tsx:30`
- Modify: `src/app/(platform)/dashboard/billing/credits/page.tsx:76`

- [ ] **Step 1: Swap the endpoint in `activate/page.tsx`**

Change line 30 from:

```ts
      const res = await fetch('/api/payments/chargily/checkout', {
```

to:

```ts
      const res = await fetch('/api/payments/slickpay/checkout', {
```

(Everything else — the `code === 'NOT_CONFIGURED'` handling, `d.checkoutUrl` redirect — stays; the SlickPay route returns the same shape.)

- [ ] **Step 2: Swap the endpoint in `dashboard/billing/credits/page.tsx`**

Change line 76 from:

```ts
      const res = await fetch('/api/payments/chargily/checkout', {
```

to:

```ts
      const res = await fetch('/api/payments/slickpay/checkout', {
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(platform)/activate/page.tsx" "src/app/(platform)/dashboard/billing/credits/page.tsx"
git commit -m "feat(payments): point 'Payer en ligne' buttons at SlickPay"
```

---

## Task 8: Retire Chargily + env docs

**Files:**
- Delete: `src/lib/chargily.ts`
- Delete: `src/app/api/payments/chargily/checkout/route.ts`
- Delete: `src/app/api/webhooks/chargily/route.ts`
- Modify: `env.example`

- [ ] **Step 1: Delete the Chargily files**

```bash
git rm src/lib/chargily.ts src/app/api/payments/chargily/checkout/route.ts src/app/api/webhooks/chargily/route.ts
```

- [ ] **Step 2: Confirm nothing still imports Chargily**

Run: `grep -rn "chargily\|Chargily" src/`
Expected: no matches. (If any appear, remove those references before continuing.)

- [ ] **Step 3: Update `env.example`**

Remove any `CHARGILY_*` lines and add:

```
# --- SlickPay (online CIB / Edahabia payments) ---
SLICKPAY_PUBLIC_KEY=
SLICKPAY_MODE=sandbox            # sandbox | live
SLICKPAY_WEBHOOK_SIGNATURE=      # any random secret; sent on invoice + verified on webhook
SLICKPAY_ACCOUNT_UUID=           # optional; omit to use your default SlickPay account
```

- [ ] **Step 4: Type-check + full test run**

Run: `npx tsc --noEmit -p . && npx vitest run`
Expected: tsc clean; all tests pass (including `slickpay.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(payments): retire Chargily, document SlickPay env vars"
```

---

## Task 9: Owner setup + sandbox end-to-end verification

**Not code — a runbook for the owner. No commit.**

- [ ] **Step 1: Set env vars in `.env.local`**

```
SLICKPAY_PUBLIC_KEY=<from SlickPay dashboard>
SLICKPAY_MODE=sandbox
SLICKPAY_WEBHOOK_SIGNATURE=<run: openssl rand -hex 16>
```

- [ ] **Step 2: Run migration 027** in the Supabase SQL editor (`Database/027_slickpay.sql`).

- [ ] **Step 3: Sandbox smoke test of the lib**

Run: `npx vitest run src/lib/slickpay.test.ts`
Expected: PASS. (Live sandbox invoice creation is verified through the UI in the next step.)

- [ ] **Step 4: End-to-end via the tunnel**

With the dev server + Cloudflare tunnel running (public HTTPS so the webhook can reach us):
1. Open `/activate` (or `/dashboard/billing/upgrade`) over the tunnel URL.
2. Click **Payer en ligne** → you should be redirected to the SATIM sandbox page.
3. Complete the sandbox card payment.
4. Confirm you land on `/dashboard?paid=1` and the store's plan/credits updated (check the dashboard, or query `stores` for the new `plan`/`ai_credits`).
5. Confirm the `subscriptions` row flipped to `active` and its `provider_ref` holds the invoice id.

Expected: plan activates automatically with no manual super-admin confirmation. If the webhook header name differs, activation still happens via the return route — check the server logs for `[slickpay webhook]` vs `[slickpay return]` to see which path fired.

---

## Self-Review

**1. Spec coverage:**
- Replace Chargily → Tasks 4–8. ✅
- Reuse activation engine → Task 3 (`confirmAndActivate` wraps `activateStorePlan`/`grantTopup`). ✅
- `lib/slickpay.ts` (create/status/verify/account) → Task 1. ✅
- Checkout + webhook + return routes → Tasks 4, 5, 6. ✅
- `provider_ref` migration → Task 2. ✅
- UI swap → Task 7. ✅
- Env vars → Task 8. ✅
- `fees: 0` → Task 1 (`createInvoice` hardcodes `fees: 0`), asserted in test. ✅
- Both plan + top-ups → Task 4 handles both record types. ✅
- Idempotency → Task 3 (`WHERE status='pending'`). ✅
- Never trust redirect params → Task 6 re-verifies via `getInvoiceStatus`. ✅
- Localhost webhook skip → Task 4 (`webhookUrl` only for public HTTPS). ✅
- BaridiMob manual untouched → no task modifies it. ✅

**2. Placeholder scan:** No TBD/TODO; every code step has full code; every command has expected output. ✅

**3. Type consistency:** `createInvoice`/`getInvoiceStatus`/`verifyWebhookSignature`/`isSlickpayConfigured`/`slickpayBaseUrl`/`getDefaultAccountUuid` names identical across Tasks 1/4/5/6. `confirmAndActivate(admin, recordType, recordId, storeId)` signature identical in Tasks 3/5/6. Record types `'subscription' | 'credit_purchase'` consistent. Return shape `{ checkoutUrl }` matches the UI's `d.checkoutUrl` (Task 7). ✅
