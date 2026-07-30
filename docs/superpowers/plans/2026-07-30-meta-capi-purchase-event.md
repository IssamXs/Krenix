# Meta CAPI Purchase Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fire a Meta Conversions API "Purchase" event (hashed email/phone matching) whenever a Krenix subscription is confirmed, so the owner's ads can be optimized for Sales instead of Conversations.

**Architecture:** One new fire-and-forget provider module (`lib/meta-capi.ts`, mirrors the existing `lib/telegram.ts` fire-and-forget contract), called from the three existing subscription-confirmation code paths right after each one's DB write succeeds.

**Tech Stack:** Next.js 14 API routes, TypeScript, Vitest, Meta Graph API v21.0.

---

### Task 1: `lib/meta-capi.ts` — provider module

**Files:**
- Create: `src/lib/meta-capi.ts`

- [ ] **Step 1: Write the module**

```ts
// ============================================================
// Meta Conversions API — reports confirmed Krenix subscription sales as
// "Purchase" events so the owner's own ad account (Click-to-WhatsApp ads
// selling Krenix itself) can be optimized for Sales instead of Conversations.
// Not the same system as the per-merchant storefront pixels (MarketingPixel /
// pixel-events.ts) — this is platform-level, one pixel, the owner's own ads.
//
// No click-ID attribution is available (plain wa.me links, not the paid
// WhatsApp Business Platform), so matching relies on hashed email/phone
// ("Advanced Matching") — Meta associates the purchase with whichever of its
// users share that contact info. Weaker than click-ID matching, but still a
// real conversion signal for Sales-objective optimization.
// ============================================================
import { createHash } from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

export function isMetaCapiConfigured(): boolean {
  return !!process.env.META_CAPI_ACCESS_TOKEN && !!process.env.META_CAPI_PIXEL_ID
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

// Algerian local format (0X XX XX XX XX, with or without spaces) → Meta's
// expected digits-only, country-code-prefixed form (213XXXXXXXXX). Returns
// null for anything that doesn't look like a valid Algerian mobile number, so
// a garbage user_metadata.phone value is never sent to Meta.
export function normalizePhoneForMeta(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (/^0[567]\d{8}$/.test(digits)) return `213${digits.slice(1)}`
  if (/^213[567]\d{8}$/.test(digits)) return digits
  return null
}

export interface PurchaseEventInput {
  email: string
  phone?: string | null
  valueDzd: number
}

// Fire-and-forget: logs errors, never throws. A Meta API hiccup must never
// block or fail the actual payment confirmation this reports on.
export async function sendPurchaseEvent(input: PurchaseEventInput): Promise<void> {
  if (!isMetaCapiConfigured()) return

  const userData: Record<string, string[]> = {}
  const email = input.email?.trim().toLowerCase()
  if (email) userData.em = [sha256(email)]
  const normalizedPhone = input.phone ? normalizePhoneForMeta(input.phone) : null
  if (normalizedPhone) userData.ph = [sha256(normalizedPhone)]
  if (!userData.em && !userData.ph) return

  try {
    const res = await fetch(`${GRAPH}/${process.env.META_CAPI_PIXEL_ID}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: [{
          event_name: 'Purchase',
          event_time: Math.floor(Date.now() / 1000),
          action_source: 'other',
          user_data: userData,
          custom_data: { value: input.valueDzd, currency: 'DZD' },
        }],
        access_token: process.env.META_CAPI_ACCESS_TOKEN,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      console.error('[meta-capi] Purchase event rejected:', res.status, JSON.stringify(body))
    }
  } catch (err) {
    console.error('[meta-capi] Purchase event failed:', err)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/meta-capi.ts
git commit -m "feat(meta-capi): add Purchase event provider module"
```

---

### Task 2: `lib/meta-capi.test.ts`

**Files:**
- Create: `src/lib/meta-capi.test.ts`

- [ ] **Step 1: Write the tests**

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'crypto'
import { isMetaCapiConfigured, normalizePhoneForMeta, sendPurchaseEvent } from './meta-capi'

beforeEach(() => {
  process.env.META_CAPI_ACCESS_TOKEN = 'test_token'
  process.env.META_CAPI_PIXEL_ID = '123456789'
})
afterEach(() => {
  delete process.env.META_CAPI_ACCESS_TOKEN
  delete process.env.META_CAPI_PIXEL_ID
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('isMetaCapiConfigured', () => {
  it('is true when both env vars are set', () => {
    expect(isMetaCapiConfigured()).toBe(true)
  })
  it('is false when either is missing', () => {
    delete process.env.META_CAPI_PIXEL_ID
    expect(isMetaCapiConfigured()).toBe(false)
  })
})

describe('normalizePhoneForMeta', () => {
  it('converts local Algerian format to 213-prefixed digits', () => {
    expect(normalizePhoneForMeta('0549494949')).toBe('213549494949')
    expect(normalizePhoneForMeta('05 49 49 49 49')).toBe('213549494949')
    expect(normalizePhoneForMeta('0654321098')).toBe('213654321098')
    expect(normalizePhoneForMeta('0712345678')).toBe('213712345678')
  })
  it('accepts already-prefixed 213 numbers', () => {
    expect(normalizePhoneForMeta('213549494949')).toBe('213549494949')
  })
  it('returns null for invalid input', () => {
    expect(normalizePhoneForMeta('12345')).toBeNull()
    expect(normalizePhoneForMeta('0123456789')).toBeNull()
    expect(normalizePhoneForMeta('')).toBeNull()
  })
})

describe('sendPurchaseEvent', () => {
  it('posts a Purchase event with hashed email+phone and value/currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendPurchaseEvent({ email: 'Test@Example.com', phone: '0549494949', valueDzd: 9000 })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789/events')
    const body = JSON.parse(opts.body)
    expect(body.data[0].event_name).toBe('Purchase')
    expect(body.data[0].action_source).toBe('other')
    expect(body.data[0].custom_data).toEqual({ value: 9000, currency: 'DZD' })
    expect(body.data[0].user_data.em).toEqual([createHash('sha256').update('test@example.com').digest('hex')])
    expect(body.data[0].user_data.ph).toEqual([createHash('sha256').update('213549494949').digest('hex')])
    expect(body.access_token).toBe('test_token')
  })

  it('omits ph when phone is missing or invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendPurchaseEvent({ email: 'a@b.com', phone: null, valueDzd: 3000 })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user_data).not.toHaveProperty('ph')
  })

  it('never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(sendPurchaseEvent({ email: 'a@b.com', valueDzd: 3000 })).resolves.toBeUndefined()
  })

  it('never throws when Meta returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: { message: 'bad token' } }),
    }))
    await expect(sendPurchaseEvent({ email: 'a@b.com', valueDzd: 3000 })).resolves.toBeUndefined()
  })

  it('no-ops when not configured', async () => {
    delete process.env.META_CAPI_ACCESS_TOKEN
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sendPurchaseEvent({ email: 'a@b.com', valueDzd: 3000 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no-ops when neither email nor phone is usable', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sendPurchaseEvent({ email: '', phone: 'garbage', valueDzd: 3000 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/lib/meta-capi.test.ts`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta-capi.test.ts
git commit -m "test(meta-capi): cover phone normalization and Purchase event payload"
```

---

### Task 3: Wire into the super-admin manual payment confirmation

**Files:**
- Modify: `src/app/api/super-admin/payments/[id]/route.ts`

- [ ] **Step 1: Import the new module**

Change the top imports from:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { PLAN_CREDITS, PLAN_CHATBOT_LIMITS, PLAN_LABELS, type Plan } from '@/types/database'
import { computePlanExpiry } from '@/lib/plan-expiry'
import { sendEmail, planApprovedEmail, paymentRejectedEmail } from '@/lib/email'
import type { SupabaseClient } from '@supabase/supabase-js'
```

to:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { PLAN_CREDITS, PLAN_CHATBOT_LIMITS, PLAN_LABELS, PLAN_AMOUNTS_DZD, type Plan } from '@/types/database'
import { computePlanExpiry } from '@/lib/plan-expiry'
import { sendEmail, planApprovedEmail, paymentRejectedEmail } from '@/lib/email'
import { sendPurchaseEvent } from '@/lib/meta-capi'
import type { SupabaseClient } from '@supabase/supabase-js'
```

- [ ] **Step 2: Report the sale to Meta right after the confirm branch's DB writes**

Change the end of the `confirm` branch (the default action, after the `reject` block) from:

```ts
  await logAdminAction(admin, auth.userId, 'payment.confirm', 'subscription', id, { plan, nextCredits })

  if (store?.owner_id) {
    const { subject, html } = planApprovedEmail({ storeName: store.name as string, planLabel: PLAN_LABELS[plan], storeSlug: store.slug as string })
    await notifyOwnerByEmail(admin, store.owner_id as string, subject, html, 'payments/confirm')
  }

  return NextResponse.json({ ok: true })
}
```

to:

```ts
  await logAdminAction(admin, auth.userId, 'payment.confirm', 'subscription', id, { plan, nextCredits })

  if (store?.owner_id) {
    const { subject, html } = planApprovedEmail({ storeName: store.name as string, planLabel: PLAN_LABELS[plan], storeSlug: store.slug as string })
    await notifyOwnerByEmail(admin, store.owner_id as string, subject, html, 'payments/confirm')

    const { data: ownerData } = await admin.auth.admin.getUserById(store.owner_id as string)
    const ownerEmail = ownerData.user?.email
    if (ownerEmail) {
      await sendPurchaseEvent({
        email: ownerEmail,
        phone: (ownerData.user?.user_metadata?.phone as string | undefined) ?? null,
        valueDzd: PLAN_AMOUNTS_DZD[plan],
      })
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/super-admin/payments/[id]/route.ts"
git commit -m "feat(meta-capi): report manually-confirmed subscriptions as Purchase events"
```

---

### Task 4: Wire into the SlickPay platform-billing webhook

**Files:**
- Modify: `src/app/api/webhooks/slickpay/route.ts`

- [ ] **Step 1: Import the new module and extend the record select**

Change:

```ts
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
```

to:

```ts
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
import { sendPurchaseEvent } from '@/lib/meta-capi'
```

Change:

```ts
    const admin = createAdminClient()
    const table = recordType === 'subscription' ? 'subscriptions' : 'credit_purchases'
    const { data: record } = await admin.from(table)
      .select('provider_ref, store_id').eq('id', recordId).maybeSingle()
    if (!record?.provider_ref || !record.store_id) return NextResponse.json({ ok: true })

    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
    }
```

to:

```ts
    const admin = createAdminClient()
    const table = recordType === 'subscription' ? 'subscriptions' : 'credit_purchases'
    const { data: record } = await admin.from(table)
      .select('provider_ref, store_id, amount_dzd').eq('id', recordId).maybeSingle()
    if (!record?.provider_ref || !record.store_id) return NextResponse.json({ ok: true })

    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) {
        await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
        if (recordType === 'subscription') {
          const { data: storeRow } = await admin.from('stores').select('owner_id').eq('id', record.store_id).maybeSingle()
          if (storeRow?.owner_id) {
            const { data: ownerData } = await admin.auth.admin.getUserById(storeRow.owner_id as string)
            const ownerEmail = ownerData.user?.email
            if (ownerEmail) {
              await sendPurchaseEvent({
                email: ownerEmail,
                phone: (ownerData.user?.user_metadata?.phone as string | undefined) ?? null,
                valueDzd: Number(record.amount_dzd),
              })
            }
          }
        }
      }
    }
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/slickpay/route.ts
git commit -m "feat(meta-capi): report online-confirmed subscriptions as Purchase events (webhook)"
```

---

### Task 5: Wire into the SlickPay platform-billing return route

**Files:**
- Modify: `src/app/api/payments/slickpay/return/route.ts`

- [ ] **Step 1: Import the new module and extend the record select**

Change:

```ts
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
```

to:

```ts
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
import { sendPurchaseEvent } from '@/lib/meta-capi'
```

Change:

```ts
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
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
      return NextResponse.redirect(new URL(okPath, origin))
    }
  } catch (err) {
    console.error('[slickpay return] error:', err)
  }
  return NextResponse.redirect(new URL(failPath, origin))
```

to:

```ts
  const admin = createAdminClient()
  const table = recordType === 'subscription' ? 'subscriptions' : 'credit_purchases'
  const { data: record } = await admin.from(table)
    .select('provider_ref, store_id, amount_dzd').eq('id', recordId).maybeSingle()

  if (!record?.provider_ref || !record.store_id) {
    return NextResponse.redirect(new URL(failPath, origin))
  }

  try {
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) {
        await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
        if (recordType === 'subscription') {
          const { data: storeRow } = await admin.from('stores').select('owner_id').eq('id', record.store_id).maybeSingle()
          if (storeRow?.owner_id) {
            const { data: ownerData } = await admin.auth.admin.getUserById(storeRow.owner_id as string)
            const ownerEmail = ownerData.user?.email
            if (ownerEmail) {
              await sendPurchaseEvent({
                email: ownerEmail,
                phone: (ownerData.user?.user_metadata?.phone as string | undefined) ?? null,
                valueDzd: Number(record.amount_dzd),
              })
            }
          }
        }
      }
      return NextResponse.redirect(new URL(okPath, origin))
    }
  } catch (err) {
    console.error('[slickpay return] error:', err)
  }
  return NextResponse.redirect(new URL(failPath, origin))
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/payments/slickpay/return/route.ts"
git commit -m "feat(meta-capi): report online-confirmed subscriptions as Purchase events (return route)"
```

---

### Task 6: Document env vars and final verification

**Files:**
- Modify: `.env.example` (if it exists — check first)

- [ ] **Step 1: Check for and update `.env.example`**

Run: `grep -n "NEXT_PUBLIC_META_PIXEL_ID" .env.example`

If found, add these two lines right after it:

```
# --- Meta Conversions API (platform's own ad account — Purchase events) ---
META_CAPI_ACCESS_TOKEN=
META_CAPI_PIXEL_ID=
```

If `.env.example` doesn't exist or has no such line, skip this step (don't invent a file structure that isn't already there).

- [ ] **Step 2: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS, including the new `meta-capi.test.ts` file.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification note for the user**

This feature no-ops safely until `META_CAPI_ACCESS_TOKEN` and `META_CAPI_PIXEL_ID` are
both set (real end-to-end verification needs the owner's Meta Events Manager token,
which isn't available in this environment — see Task 6 of the spec's "Testing" section:
unit tests cover the payload shape, but a live Meta API call requires the owner's own
credentials to be added to `.env.local` and then production).

- [ ] **Step 5: Commit any remaining changes**

```bash
git status --short
```

If `.env.example` was modified:

```bash
git add .env.example
git commit -m "docs(meta-capi): document Purchase event env vars"
```
