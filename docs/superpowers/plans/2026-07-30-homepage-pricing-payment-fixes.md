# Homepage/Pricing Polish + Chargily + Payment Telegram Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix logo/pricing/mockup/modal visual bugs, add Chargily as a second BYO-key store payment provider alongside SlickPay, and notify Telegram for online platform payments — then deploy.

**Architecture:** Small, mostly-independent edits to existing files, following each area's established pattern exactly (the `slickpay.ts` BYO-key shape for `chargily.ts`, the existing `payment_integrations` table for the new provider, `confirmAndActivate`'s idempotent return value as the Telegram trigger).

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres), Vitest, Tailwind.

---

### Task 1: Logo consistency — text wordmark everywhere

**Files:**
- Modify: `src/components/ui/KrenixLogo.tsx`

- [ ] **Step 1: Replace the wordmark image with text matching the homepage nav**

```tsx
import Image from 'next/image'

interface KrenixLogoProps {
  height?: number
  /** Accepted for API compatibility (white-label); brand art is fixed. */
  color?: string
  className?: string
  /** Mark only, no wordmark. */
  compact?: boolean
  /** Accepted for API compatibility (white-label); brand art is fixed. */
  mono?: boolean
}

// Krenix identity — the rising blue phoenix (Krenix → phoeNIX) + the KRENIX
// wordmark rendered as bold text (matches the homepage nav exactly).
export default function KrenixLogo({ height = 24, className = '', compact = false }: KrenixLogoProps) {
  const markSize = Math.round(height * 2.2)
  const mark = (
    <Image src="/brand/krenix-phoenix.png" alt="Krenix" width={markSize} height={markSize} unoptimized
      style={{ objectFit: 'contain', flexShrink: 0, height: markSize, width: 'auto' }} />
  )

  if (compact) return <span className={className} style={{ display: 'inline-flex' }}>{mark}</span>

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: Math.round(height * 0.14) }}>
      {mark}
      <span
        className="font-heading font-extrabold"
        style={{ fontSize: Math.round(height * 0.62), color: '#15171C', letterSpacing: '0.01em' }}
      >
        KRENIX
      </span>
    </span>
  )
}
```

- [ ] **Step 2: Verify in the browser**

Open the dev server, navigate to `/pricing`, and confirm the nav logo now shows the phoenix
icon + plain bold black "KRENIX" text (no separate blue wordmark image). Repeat for
`/dashboard` (sidebar), `/auth/login`, and `/super-admin` — same component, one fix covers
all of them.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/KrenixLogo.tsx
git commit -m "fix(brand): render KrenixLogo wordmark as text, matching the homepage nav"
```

---

### Task 2: `/pricing` — Ultimate becomes the recommended plan

**Files:**
- Modify: `src/app/(platform)/pricing/page.tsx`

- [ ] **Step 1: Move the badge/highlight from Pro to Ultimate**

In `STANDARD_PLANS` (around line 8-60), change:

```tsx
  {
    id: 'pro',
    name: 'Pro',
    price: '3 000',
    period: '/mois',
    badge: 'Recommandé',
    features: [ /* unchanged */ ],
    highlight: true,
    cta: 'Choisir Pro',
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: '9 000',
    period: '/mois',
    badge: null as string | null,
    features: [ /* unchanged */ ],
    highlight: false,
    cta: 'Choisir Ultimate',
  },
```

to:

```tsx
  {
    id: 'pro',
    name: 'Pro',
    price: '3 000',
    period: '/mois',
    badge: null as string | null,
    features: [ /* unchanged */ ],
    highlight: false,
    cta: 'Choisir Pro',
  },
  {
    id: 'ultimate',
    name: 'Ultimate',
    price: '9 000',
    period: '/mois',
    badge: 'Recommandé',
    features: [ /* unchanged */ ],
    highlight: true,
    cta: 'Choisir Ultimate',
  },
```

(Keep each plan's `features` array exactly as-is — only `badge`/`highlight` move.)

- [ ] **Step 2: Downgrade Business's badge in the Sur Mesure row**

In `SUR_MESURE_PACKAGES`, change the `business` entry's badge from:

```tsx
    badge: 'Meilleure valeur',
    badgeStyle: { background: 'var(--color-dash-gold-soft)', color: 'var(--color-dash-gold-dark)' },
    features: [ /* unchanged */ ],
    isGold: true,
```

to:

```tsx
    badge: 'Populaire',
    badgeStyle: { background: 'var(--color-dash-info-soft)', color: 'var(--color-dash-info)' },
    features: [ /* unchanged */ ],
    isGold: false,
```

(This reuses the same badge style `growth` already has — `business` no longer looks like the
top pick, and there's no new color to introduce.)

- [ ] **Step 3: Verify in the browser**

Load `/pricing`. Confirm: Ultimate now has the gold "Recommandé" badge and the
highlighted/elevated card styling; Pro looks like a plain card; Business shows a plain blue
"Populaire" badge, no longer gold.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(platform)/pricing/page.tsx"
git commit -m "fix(pricing): move recommended badge to Ultimate, downgrade Business's badge"
```

---

### Task 3: Growth becomes self-serve

**Files:**
- Modify: `src/app/(platform)/pricing/page.tsx`

- [ ] **Step 1: Add an `isSelfServe` flag to the Sur Mesure data and branch the button**

In `SUR_MESURE_PACKAGES`, add `isSelfServe: true` to the `growth` entry and `isSelfServe: false`
to `business`, `agency`, `enterprise`:

```tsx
const SUR_MESURE_PACKAGES = [
  {
    key: 'growth',
    name: 'GROWTH',
    price: '12 000',
    badge: 'Populaire',
    badgeStyle: { background: 'var(--color-dash-info-soft)', color: 'var(--color-dash-info)' },
    features: [ /* unchanged */ ],
    isGold: false,
    isSelfServe: true,
  },
  {
    key: 'business',
    // ...unchanged...
    isSelfServe: false,
  },
  {
    key: 'agency',
    // ...unchanged...
    isSelfServe: false,
  },
  {
    key: 'enterprise',
    // ...unchanged...
    isSelfServe: false,
  },
]
```

Then replace the single "Commander button" block (around line 373-393) with a branch:

```tsx
                {/* Action button */}
                {pkg.isSelfServe ? (
                  <Link
                    href="/auth/register"
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all hover:opacity-90 active:scale-95"
                    style={{
                      background: 'var(--color-dash-surface-2)',
                      border: '1px solid var(--color-dash-border)',
                      color: 'var(--color-dash-ink)',
                    }}
                  >
                    Choisir Growth
                    <ArrowRight size={12} />
                  </Link>
                ) : (
                  <button
                    onClick={() => handleCommander(pkg.name)}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold tracking-wide uppercase transition-all hover:opacity-90 active:scale-95"
                    style={
                      pkg.isGold
                        ? {
                            background: 'linear-gradient(135deg, var(--color-dash-gold), var(--color-dash-gold-dark))',
                            color: '#fff',
                            boxShadow: '0 8px 20px -6px var(--color-dash-gold)',
                          }
                        : {
                            background: 'var(--color-dash-surface-2)',
                            border: '1px solid var(--color-dash-border)',
                            color: 'var(--color-dash-ink)',
                          }
                    }
                  >
                    <MessageCircle size={12} />
                    Commander
                  </button>
                )}
```

`ArrowRight` is already imported at the top of the file (used by the standard-plan CTAs and
the bottom CTA), so no new import is needed.

- [ ] **Step 2: Verify in the browser**

Load `/pricing`. Confirm Growth's card now shows "Choisir Growth" with an arrow icon and,
when clicked, navigates straight to `/auth/register` (no WhatsApp popup). Confirm Business,
Agency, Enterprise still show "Commander" and still open WhatsApp.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/pricing/page.tsx"
git commit -m "feat(pricing): make Growth self-serve like Pro/Ultimate; Business/Agency/Enterprise stay Sur Mesure"
```

---

### Task 4: iPhone mockup — realistic proportions

**Files:**
- Modify: `src/app/page.tsx:286-354` (`PhoneScrollMockup`)

- [ ] **Step 1: Raise the screen height and rescale the scroll distance**

Change:

```tsx
function PhoneScrollMockup({ copy }: { copy: typeof V2_COPY['fr']['showcaseMobile'] }) {
  const screenH = 300
```

to:

```tsx
function PhoneScrollMockup({ copy }: { copy: typeof V2_COPY['fr']['showcaseMobile'] }) {
  const screenH = 460
```

And change:

```tsx
  const scrollDist = 150
```

to:

```tsx
  const scrollDist = 230
```

(`screenH` and `scrollDist` are the only two size constants in this component — the frame
`width: 232`, dynamic-island, and status-bar values stay unchanged since they're independent
of screen height. The taller frame gives the auto-scrolling notification feed more visible
rows before it loops, which reads better at the new size.)

- [ ] **Step 2: Verify in the browser**

Open the homepage, scroll to the "Contrôle total depuis votre téléphone" section. Confirm the
phone now reads as a full, realistically-proportioned iPhone (not a stubby box) and the
notification feed still scrolls smoothly without clipping oddly.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "fix(homepage): correct iPhone mockup aspect ratio to look like a full phone"
```

---

### Task 5: Order detail modal — diagnose and fix the icon/header overlap

**Files:**
- Modify: `src/app/(platform)/dashboard/orders/page.tsx` (exact lines depend on findings)

This is a visual bug that must be reproduced before it's fixed — do not guess at a CSS change
without seeing the actual render.

- [ ] **Step 1: Reproduce in the browser**

Start the dev server, log in, go to Dashboard → Commandes, click a row to open the detail
modal. Screenshot it. If it looks fine at desktop width, resize the browser pane to 375px
(mobile) and screenshot again — the report showed the bug, and the app is mobile-first, so a
narrow viewport is the most likely trigger.

- [ ] **Step 2: Identify the exact overlapping element**

Use `read_page` / `javascript_tool` (`getBoundingClientRect()`) on the modal header
(`sticky top-0 z-10` div, ~line 454) and the first timeline icon button (`w-9 h-9 rounded-xl`,
~line 484) to get their actual on-screen rectangles. Confirm which one is which — the icon set
is `Clock` (pending), `ClipboardCheck` (confirmed), `Package` (chez_livreur), `Truck`
(en_livraison), `CheckCircle2` (livree) — and note whether both `pending` and `confirmed` rows
are rendering at all (the TIMELINE array at line 237 includes all 5 statuses; if only 3 rows
are visible, something is hiding/collapsing the first two).

- [ ] **Step 3: Fix the root cause**

Likely candidates to check, in order:
- The sticky header's actual rendered height vs. its reserved layout height (inspect
  computed `height`/`padding` on the header div).
- Whether the timeline's outer `<div className="relative">` (line 472) or the first row's
  `<div className="flex items-stretch gap-3">` has an unintended negative margin or absolute
  positioning inherited from a Tailwind class.
- Whether `AnimatePresence`/`motion.div`'s `initial`/`animate` transform on the modal card
  (lines 448-450) is captured mid-transition in a screenshot taken too early (in which case
  there's no real bug — re-screenshot after the 0.2s transition settles, and if it looks fine,
  document that finding instead of changing code).

Apply the minimal fix once the cause is confirmed (e.g. adding explicit height/padding to the
header, or `mt-` spacing to the timeline's first row) — write the actual diff here once found,
matching the surrounding Tailwind class style exactly.

- [ ] **Step 4: Verify the fix**

Re-screenshot the modal at both desktop and 375px width. Confirm no overlap, and confirm the
fix didn't shift the WhatsApp buttons or the Annulée/Retournée row.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(platform)/dashboard/orders/page.tsx"
git commit -m "fix(orders): resolve icon/header overlap in the order detail modal"
```

---

### Task 6: Migration + types for Chargily as a second store payment provider

**Files:**
- Create: `Database/041_chargily_payment_provider.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Add Chargily as a second BYO-key store-level payment provider alongside
-- SlickPay. A store may connect both, but only one is "active" (shown on the
-- storefront) at a time — active_payment_provider tracks which.
-- ============================================================
ALTER TABLE payment_integrations DROP CONSTRAINT IF EXISTS payment_integrations_provider_check;
ALTER TABLE payment_integrations ADD CONSTRAINT payment_integrations_provider_check
  CHECK (provider IN ('slickpay', 'chargily'));

ALTER TABLE stores ADD COLUMN IF NOT EXISTS active_payment_provider TEXT
  CHECK (active_payment_provider IN ('slickpay', 'chargily'));
```

- [ ] **Step 2: Add the `PaymentProvider` type and new fields to `types/database.ts`**

Near `DeliveryProvider` (line 398), add:

```ts
// ============================================================
// PAYMENT INTEGRATIONS (per-store online-payment credentials, BYO-key)
// ============================================================
export type PaymentProvider = 'slickpay' | 'chargily'
```

In the `Store` interface, right after `online_payment_enabled` (line 186), add:

```ts
  // Which connected provider (see payment_integrations) is currently shown on
  // the storefront. Null when no provider has been activated yet.
  active_payment_provider: PaymentProvider | null
```

In the `Order` interface, right after `delivery_label_url` (line 387), add the three columns
migration 039 created but the type never picked up:

```ts
  // Online payment (see payment_integrations) — 'unpaid' until the store's
  // provider webhook/return route confirms it.
  payment_status: 'unpaid' | 'paid'
  payment_provider: PaymentProvider | null
  payment_ref: string | null
```

- [ ] **Step 3: Commit**

```bash
git add Database/041_chargily_payment_provider.sql src/types/database.ts
git commit -m "feat(payments): migration 041 + types for Chargily as a second store payment provider"
```

---

### Task 7: `lib/chargily.ts` — BYO-key provider wrapper

**Files:**
- Create: `src/lib/chargily.ts`

- [ ] **Step 1: Write the provider wrapper, mirroring `lib/slickpay.ts`'s shape**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/chargily.ts
git commit -m "feat(payments): add lib/chargily.ts (BYO-key store provider, mirrors lib/slickpay.ts)"
```

---

### Task 8: `lib/chargily.test.ts`

**Files:**
- Create: `src/lib/chargily.test.ts`

- [ ] **Step 1: Write tests mirroring `slickpay.test.ts`'s coverage**

```ts
import { describe, it, expect, afterEach, vi } from 'vitest'
import { chargilyBaseUrl, verifyChargilySignature, createCheckout, getCheckoutStatus, validateChargilyKey } from './chargily'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('chargilyBaseUrl', () => {
  it('picks test vs live url from the key prefix', () => {
    expect(chargilyBaseUrl('test')).toBe('https://pay.chargily.net/test/api/v2')
    expect(chargilyBaseUrl('live')).toBe('https://pay.chargily.net/api/v2')
    expect(chargilyBaseUrl(undefined)).toBe('https://pay.chargily.net/test/api/v2')
  })
})

describe('verifyChargilySignature', () => {
  it('accepts a signature computed from the same key', () => {
    const crypto = require('crypto')
    const sig = crypto.createHmac('sha256', 'sk_test_abc').update('{"a":1}', 'utf8').digest('hex')
    expect(verifyChargilySignature('{"a":1}', sig, 'sk_test_abc')).toBe(true)
  })
  it('rejects a wrong signature or missing key/signature', () => {
    expect(verifyChargilySignature('{"a":1}', 'nope', 'sk_test_abc')).toBe(false)
    expect(verifyChargilySignature('{"a":1}', null, 'sk_test_abc')).toBe(false)
    expect(verifyChargilySignature('{"a":1}', 'nope', '')).toBe(false)
  })
})

describe('validateChargilyKey', () => {
  it('returns true on a successful /balance response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await validateChargilyKey('sk_test_abc')).toBe(true)
  })
  it('returns false on a failed response or empty key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await validateChargilyKey('sk_test_abc')).toBe(false)
    expect(await validateChargilyKey('')).toBe(false)
  })
})

describe('createCheckout', () => {
  it('posts amount, urls, metadata and returns checkoutUrl + id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'chk_1', checkout_url: 'https://pay.chargily.net/checkout/chk_1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createCheckout({
      amountDzd: 3000,
      itemName: 'Krenix — Plan Pro',
      successUrl: 'https://site/return',
      webhookUrl: 'https://site/hook',
      metadata: { record_type: 'subscription', record_id: 'r1' },
      key: 'sk_test_abc',
    })

    expect(res).toEqual({ checkoutUrl: 'https://pay.chargily.net/checkout/chk_1', id: 'chk_1' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://pay.chargily.net/test/api/v2/checkouts')
    const body = JSON.parse(opts.body)
    expect(body.amount).toBe(3000)
    expect(body.currency).toBe('dzd')
    expect(body.success_url).toBe('https://site/return')
    expect(body.webhook_endpoint).toBe('https://site/hook')
    expect(opts.headers.Authorization).toBe('Bearer sk_test_abc')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ message: 'The amount field is required.' }),
    }))
    await expect(createCheckout({
      amountDzd: 50, itemName: 'x', successUrl: 'u', key: 'sk_test_abc',
    })).rejects.toThrow('The amount field is required.')
  })
})

describe('getCheckoutStatus', () => {
  it('maps status:"paid" to paid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'paid' }) }))
    expect(await getCheckoutStatus('chk_1', 'sk_test_abc')).toBe('paid')
  })
  it('maps any other status to pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) }))
    expect(await getCheckoutStatus('chk_1', 'sk_test_abc')).toBe('pending')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx vitest run src/lib/chargily.test.ts`
Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/chargily.test.ts
git commit -m "test(payments): cover lib/chargily.ts"
```

---

### Task 9: `/api/integrations/payment` — provider-aware

**Files:**
- Modify: `src/app/api/integrations/payment/route.ts`

- [ ] **Step 1: Accept a `provider` field everywhere, defaulting to `'slickpay'`**

Replace the whole file:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { encryptToken } from '@/lib/crypto'
import { validateSlickpayKey } from '@/lib/slickpay'
import { validateChargilyKey } from '@/lib/chargily'
import type { PaymentProvider } from '@/types/database'

async function ownerStore(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  return store
}

function isProvider(v: unknown): v is PaymentProvider {
  return v === 'slickpay' || v === 'chargily'
}

// GET → connection status for both providers + which one is active.
export async function GET() {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: integrations } = await admin
    .from('payment_integrations')
    .select('provider, enabled')
    .eq('store_id', store.id)

  const { data: storeRow } = await admin
    .from('stores')
    .select('online_payment_enabled, active_payment_provider')
    .eq('id', store.id)
    .single()

  const byProvider = (p: PaymentProvider) => (integrations ?? []).find(i => i.provider === p)

  return NextResponse.json({
    slickpay: { connected: !!byProvider('slickpay'), enabled: byProvider('slickpay')?.enabled ?? false },
    chargily: { connected: !!byProvider('chargily'), enabled: byProvider('chargily')?.enabled ?? false },
    showOnStorefront: storeRow?.online_payment_enabled ?? false,
    activeProvider: (storeRow?.active_payment_provider as PaymentProvider | null) ?? null,
  })
}

// POST { provider, publicKey } → validate + encrypt + connect (or reconnect).
export async function POST(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { provider, publicKey } = await request.json().catch(() => ({}))
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Fournisseur de paiement invalide.' }, { status: 400 })
  }
  if (!publicKey || typeof publicKey !== 'string') {
    return NextResponse.json({ error: 'Clé requise.' }, { status: 400 })
  }

  const valid = provider === 'slickpay'
    ? await validateSlickpayKey(publicKey)
    : await validateChargilyKey(publicKey)
  if (!valid) {
    return NextResponse.json({ error: 'Clé invalide. Vérifiez votre clé.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('payment_integrations').upsert({
    store_id: store.id,
    provider,
    public_key: encryptToken(publicKey),
    enabled: true,
  }, { onConflict: 'store_id,provider' })

  if (error) return NextResponse.json({ error: 'Erreur lors de la connexion.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH { showOnStorefront, provider? } → toggle storefront visibility for a
// given provider (making it the active one), or hide the storefront entirely
// when showOnStorefront is false.
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { showOnStorefront, provider } = await request.json().catch(() => ({}))
  const admin = createAdminClient()

  if (showOnStorefront) {
    if (!isProvider(provider)) {
      return NextResponse.json({ error: 'Fournisseur de paiement invalide.' }, { status: 400 })
    }
    const { data: integration } = await admin
      .from('payment_integrations')
      .select('id, enabled')
      .eq('store_id', store.id)
      .eq('provider', provider)
      .maybeSingle()
    if (!integration || !integration.enabled) {
      return NextResponse.json({ error: 'Connectez ce compte avant de l\'afficher sur votre boutique.' }, { status: 400 })
    }
    const { error } = await admin.from('stores')
      .update({ online_payment_enabled: true, active_payment_provider: provider })
      .eq('id', store.id)
    if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const { error } = await admin.from('stores')
    .update({ online_payment_enabled: false, active_payment_provider: null })
    .eq('id', store.id)
  if (error) return NextResponse.json({ error: 'Erreur lors de la mise à jour.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE { provider } → disconnect one provider; hides the storefront too if
// it was the active one.
export async function DELETE(request: Request) {
  const supabase = await createClient()
  const store = await ownerStore(supabase)
  if (!store) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { provider } = await request.json().catch(() => ({}))
  if (!isProvider(provider)) {
    return NextResponse.json({ error: 'Fournisseur de paiement invalide.' }, { status: 400 })
  }

  const admin = createAdminClient()
  await admin.from('payment_integrations').delete().eq('store_id', store.id).eq('provider', provider)

  const { data: storeRow } = await admin.from('stores').select('active_payment_provider').eq('id', store.id).single()
  if (storeRow?.active_payment_provider === provider) {
    await admin.from('stores').update({ online_payment_enabled: false, active_payment_provider: null }).eq('id', store.id)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/integrations/payment/route.ts
git commit -m "feat(payments): make /api/integrations/payment provider-aware (SlickPay + Chargily)"
```

---

### Task 10: Dashboard payment integrations page — provider picker

**Files:**
- Modify: `src/app/(platform)/dashboard/integrations/payment/page.tsx`

- [ ] **Step 1: Replace the single-provider page with a two-card, provider-aware version**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { CreditCard, Loader2, Check, Trash2, KeyRound } from 'lucide-react'
import Card from '@/components/dashboard/ui/Card'
import type { PaymentProvider } from '@/types/database'

const PROVIDERS: { id: PaymentProvider; name: string; blurb: string; keyLabel: string; keyHint: string }[] = [
  {
    id: 'slickpay',
    name: 'SlickPay',
    blurb: 'Paiement par carte CIB et Edahabia — même système que Krenix utilise',
    keyLabel: 'Clé publique SlickPay',
    keyHint: 'Récupérez votre clé publique depuis votre tableau de bord SlickPay (section API).',
  },
  {
    id: 'chargily',
    name: 'Chargily',
    blurb: 'Paiement par carte CIB et Edahabia via Chargily Pay',
    keyLabel: 'Clé secrète Chargily',
    keyHint: 'Récupérez votre clé secrète depuis votre tableau de bord Chargily (section API Keys).',
  },
]

type ProviderStatus = { connected: boolean; enabled: boolean }

export default function PaymentIntegrationsPage() {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Record<PaymentProvider, ProviderStatus>>({
    slickpay: { connected: false, enabled: false },
    chargily: { connected: false, enabled: false },
  })
  const [activeProvider, setActiveProvider] = useState<PaymentProvider | null>(null)
  const [showOnStorefront, setShowOnStorefront] = useState(false)

  const [openForm, setOpenForm] = useState<PaymentProvider | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [toggling, setToggling] = useState<PaymentProvider | null>(null)

  const load = () => {
    fetch('/api/integrations/payment')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return
        setStatus({ slickpay: d.slickpay, chargily: d.chargily })
        setShowOnStorefront(!!d.showOnStorefront)
        setActiveProvider(d.activeProvider ?? null)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const connect = async (provider: PaymentProvider) => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/integrations/payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, publicKey: keyInput }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur de connexion'); return }
      setOpenForm(null); setKeyInput('')
      load()
    } finally { setSaving(false) }
  }

  const disconnect = async (provider: PaymentProvider) => {
    if (!confirm(`Déconnecter ${provider === 'slickpay' ? 'SlickPay' : 'Chargily'} ? Si c'est votre fournisseur actif, le paiement en ligne ne sera plus proposé à vos clients.`)) return
    await fetch('/api/integrations/payment', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }),
    })
    load()
  }

  const activate = async (provider: PaymentProvider) => {
    setToggling(provider); setError('')
    try {
      const res = await fetch('/api/integrations/payment', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ showOnStorefront: true, provider }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Erreur'); return }
      load()
    } finally { setToggling(null) }
  }

  const deactivate = async () => {
    setToggling(activeProvider); setError('')
    try {
      await fetch('/api/integrations/payment', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ showOnStorefront: false }),
      })
      load()
    } finally { setToggling(null) }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <a href="/dashboard/integrations" className="text-dash-ink-soft hover:text-dash-ink text-sm transition-colors">← Intégrations</a>
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink">Paiement en ligne</h1>
        <p className="text-dash-ink-soft text-sm mt-1">Connectez SlickPay et/ou Chargily pour accepter le paiement par carte CIB / Edahabia sur votre boutique. Un seul fournisseur est actif à la fois.</p>
      </div>

      {error && <div className="bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-xs px-3 py-2 rounded-lg">{error}</div>}

      {PROVIDERS.map(p => {
        const s = status[p.id]
        const isActive = activeProvider === p.id && showOnStorefront
        return (
          <Card key={p.id}>
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 bg-dash-accent-soft">
                <CreditCard size={24} className="text-dash-accent-dark" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-dash-ink font-semibold text-lg">{p.name}</p>
                <p className="text-dash-ink-soft text-sm mt-0.5">{p.blurb}</p>
              </div>
              {loading ? (
                <Loader2 size={18} className="animate-spin text-dash-ink-faint" />
              ) : s.connected ? (
                <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-success-soft text-dash-success flex-shrink-0">
                  <Check size={13} /> Connecté
                </span>
              ) : (
                <button onClick={() => setOpenForm(f => f === p.id ? null : p.id)} className="text-xs font-bold px-4 py-2 rounded-xl text-white flex-shrink-0 transition-all hover:opacity-90 bg-dash-accent hover:bg-dash-accent-dark">
                  Connecter
                </button>
              )}
            </div>

            {!loading && s.connected && (
              <div className="mt-4 pt-4 border-t border-dash-border flex items-center justify-between gap-3">
                <div>
                  <p className="text-dash-ink text-sm font-medium">Afficher sur ma boutique</p>
                  <p className="text-dash-ink-soft text-xs mt-0.5">Vos clients pourront choisir de payer en ligne au moment de commander</p>
                </div>
                <button
                  onClick={() => (isActive ? deactivate() : activate(p.id))}
                  disabled={toggling === p.id}
                  className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 disabled:opacity-50 ${isActive ? 'bg-dash-success' : 'bg-dash-border'}`}
                  aria-label={`Afficher le paiement ${p.name} sur la boutique`}
                >
                  <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all shadow" style={{ left: isActive ? '22px' : '2px' }} />
                </button>
              </div>
            )}

            {!loading && s.connected && (
              <div className="mt-4 pt-4 border-t border-dash-border flex items-center justify-between">
                <p className="text-xs text-dash-ink-soft">Compte {p.name} lié à votre boutique</p>
                <button onClick={() => disconnect(p.id)} className="flex items-center gap-1.5 text-xs text-dash-danger/70 hover:text-dash-danger transition-colors">
                  <Trash2 size={12} /> Déconnecter
                </button>
              </div>
            )}

            {!loading && !s.connected && openForm === p.id && (
              <div className="mt-4 pt-4 border-t border-dash-border space-y-3">
                <div className="flex items-start gap-2 text-xs text-dash-ink-soft bg-dash-surface-2 rounded-lg px-3 py-2">
                  <KeyRound size={13} className="mt-0.5 flex-shrink-0 text-dash-ink-soft" />
                  {p.keyHint}
                </div>
                <div>
                  <label className="block text-xs text-dash-ink-soft mb-1.5 uppercase tracking-wider font-bold">{p.keyLabel}</label>
                  <input value={keyInput} onChange={e => setKeyInput(e.target.value)} type="password" placeholder={p.keyLabel}
                    className="w-full px-3 py-2.5 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-sm" />
                </div>
                <button onClick={() => connect(p.id)} disabled={saving || !keyInput.trim()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50 bg-dash-accent hover:bg-dash-accent-dark">
                  {saving ? <><Loader2 size={15} className="animate-spin" /> Vérification…</> : 'Vérifier et connecter'}
                </button>
              </div>
            )}
          </Card>
        )
      })}

      <Card className="p-6 text-center">
        <CreditCard size={32} className="mx-auto mb-3 text-dash-ink-faint" />
        <p className="text-dash-ink font-semibold">Comment ça marche</p>
        <p className="text-dash-ink-soft text-sm mt-1 max-w-sm mx-auto">
          Krenix ne prend aucune commission sur ces paiements — l&apos;argent va directement sur votre propre compte. Utile notamment pour les produits numériques, livrés sans passage par un livreur.
        </p>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Verify in the browser**

Log in as a store owner, go to Dashboard → Intégrations → Paiement en ligne. Confirm two
cards (SlickPay, Chargily) render, each connects independently, and activating one provider's
toggle deactivates the other (since only one `active_payment_provider` can be true).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/integrations/payment/page.tsx"
git commit -m "feat(payments): dashboard UI for two BYO-key providers (SlickPay + Chargily)"
```

---

### Task 11: `/api/orders/pay` — checkout uses the store's active provider

**Files:**
- Modify: `src/app/api/orders/pay/route.ts`

- [ ] **Step 1: Branch on `stores.active_payment_provider`**

Replace the file:

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { createInvoice } from '@/lib/slickpay'
import { createCheckout } from '@/lib/chargily'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import type { PaymentProvider } from '@/types/database'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// POST { orderId } → the store's OWN active provider's invoice/checkout for an
// already-created order, so the customer can pay online (CIB/Edahabia) instead
// of on delivery.
export async function POST(request: Request) {
  if (!(await checkRateLimit(`orders-pay:${requestIp(request)}`, 10, 600))) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez plus tard.' }, { status: 429 })
  }

  const { orderId } = await request.json().catch(() => ({}))
  if (!orderId) return NextResponse.json({ error: 'orderId requis' }, { status: 400 })

  const admin = createAdminClient()

  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, customer_name, customer_phone, total_price, payment_status')
    .eq('id', orderId)
    .maybeSingle()
  if (!order) return NextResponse.json({ error: 'Commande introuvable' }, { status: 404 })
  if (order.payment_status === 'paid') {
    return NextResponse.json({ error: 'Cette commande est déjà payée.' }, { status: 400 })
  }

  const { data: store } = await admin.from('stores')
    .select('slug, name, online_payment_enabled, active_payment_provider')
    .eq('id', order.store_id).single()
  const provider = store?.active_payment_provider as PaymentProvider | null
  if (!store?.online_payment_enabled || !provider) {
    return NextResponse.json({ error: 'Le paiement en ligne n\'est pas activé sur cette boutique.' }, { status: 400 })
  }

  const { data: integration } = await admin
    .from('payment_integrations')
    .select('public_key, enabled')
    .eq('store_id', order.store_id)
    .eq('provider', provider)
    .maybeSingle()
  if (!integration?.enabled) {
    return NextResponse.json({ error: 'Paiement en ligne non configuré pour cette boutique.' }, { status: 400 })
  }

  let key: string
  try {
    key = decryptToken(integration.public_key)
  } catch {
    return NextResponse.json({ error: 'Identifiants de paiement illisibles.' }, { status: 500 })
  }

  const origin = originOf(request)
  const webhookUrl = origin.startsWith('https://') && !origin.includes('localhost')
    ? `${origin}/api/webhooks/store-payment` : undefined
  const returnUrl = `${origin}/api/payments/store/return?order=${order.id}`
  const itemName = `Commande ${store.name ?? store.slug}`

  try {
    let checkoutUrl: string
    let ref: string

    if (provider === 'slickpay') {
      const nameParts = (order.customer_name as string).trim().split(/\s+/)
      const res = await createInvoice({
        key,
        amountDzd: Number(order.total_price),
        itemName,
        buyer: {
          firstname: nameParts[0] || order.customer_name,
          lastname: nameParts.slice(1).join(' ') || nameParts[0] || order.customer_name,
          email: 'client@krenix.store',
        },
        returnUrl,
        webhookUrl,
        metadata: { order_id: order.id, store_id: order.store_id },
      })
      checkoutUrl = res.paymentUrl; ref = String(res.invoiceId)
    } else {
      const res = await createCheckout({
        key,
        amountDzd: Number(order.total_price),
        itemName,
        successUrl: returnUrl,
        webhookUrl,
        metadata: { order_id: order.id, store_id: order.store_id },
      })
      checkoutUrl = res.checkoutUrl; ref = res.id
    }

    await admin.from('orders').update({ payment_provider: provider, payment_ref: ref }).eq('id', order.id)
    return NextResponse.json({ checkoutUrl })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur de paiement'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/orders/pay/route.ts
git commit -m "feat(payments): route store checkout through the store's active provider"
```

---

### Task 12: Store-payment webhook — provider-aware

**Files:**
- Modify: `src/app/api/webhooks/store-payment/route.ts`

- [ ] **Step 1: Branch status-check on the order's own `payment_provider`**

Replace the file:

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { verifyChargilySignature, getCheckoutStatus } from '@/lib/chargily'
import { decryptToken } from '@/lib/crypto'
import type { PaymentProvider } from '@/types/database'

// Webhook for STORE-level (merchant-owned) invoices/checkouts — mirrors
// /api/webhooks/slickpay's trust model exactly: the body is never trusted for
// paid-status. We only use it to learn which order to re-check, then look up
// that order's own stored payment_provider + payment_ref and ask the provider
// (with the STORE's own key) whether THAT invoice/checkout is actually paid.
// Always 200 to avoid retry storms.
export async function POST(request: Request) {
  const raw = await request.text()
  const sig = request.headers.get('signature')
    ?? request.headers.get('x-signature')
    ?? request.headers.get('webhook-signature')

  let payload: { webhook_meta_data?: Record<string, string>; metadata?: Record<string, string> }
  try { payload = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  const meta = payload.webhook_meta_data ?? payload.metadata ?? {}
  const orderId = meta.order_id
  if (!orderId) return NextResponse.json({ ok: true })

  try {
    const admin = createAdminClient()
    const { data: order } = await admin
      .from('orders')
      .select('id, store_id, payment_provider, payment_ref, payment_status, status')
      .eq('id', orderId)
      .maybeSingle()
    if (!order?.payment_ref || !order.payment_provider || order.payment_status === 'paid') {
      return NextResponse.json({ ok: true })
    }
    const provider = order.payment_provider as PaymentProvider

    const { data: integration } = await admin
      .from('payment_integrations')
      .select('public_key')
      .eq('store_id', order.store_id)
      .eq('provider', provider)
      .maybeSingle()
    if (!integration?.public_key) return NextResponse.json({ ok: true })

    const key = decryptToken(integration.public_key)

    if (provider === 'slickpay') {
      if (sig && !verifyWebhookSignature(sig)) {
        console.warn('[store-payment webhook] slickpay signature mismatch — relying on status re-check')
      }
    } else if (sig && !verifyChargilySignature(raw, sig, key)) {
      console.warn('[store-payment webhook] chargily signature mismatch — relying on status re-check')
    }

    const status = provider === 'slickpay'
      ? await getInvoiceStatus(order.payment_ref, key)
      : await getCheckoutStatus(order.payment_ref, key)

    if (status === 'paid') {
      await admin.from('orders').update({
        payment_status: 'paid',
        status: order.status === 'pending' ? 'confirmed' : order.status,
      }).eq('id', order.id)
    }
  } catch (err) {
    console.error('[store-payment webhook] error:', err)
  }
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/store-payment/route.ts
git commit -m "feat(payments): make the store-payment webhook provider-aware"
```

---

### Task 13: Store-payment return route — provider-aware

**Files:**
- Modify: `src/app/api/payments/store/return/route.ts`

- [ ] **Step 1: Branch status-check on the order's own `payment_provider`**

Replace the file:

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInvoiceStatus } from '@/lib/slickpay'
import { getCheckoutStatus } from '@/lib/chargily'
import { decryptToken } from '@/lib/crypto'
import type { PaymentProvider } from '@/types/database'

function originOf(request: Request): string {
  const url = new URL(request.url)
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  return `${proto}://${host}`
}

// The provider redirects the customer here after a store-level payment.
// Re-verify status server-side (covers localhost / delayed webhooks) before
// sending the customer on to the human-facing confirmation page. Idempotent —
// a repeat visit is harmless.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const orderId = url.searchParams.get('order')
  const origin = originOf(request)

  if (!orderId) return NextResponse.redirect(new URL('/paiement/retour?failed=1', origin))

  const admin = createAdminClient()
  const { data: order } = await admin
    .from('orders')
    .select('id, store_id, payment_provider, payment_ref, payment_status, status')
    .eq('id', orderId)
    .maybeSingle()

  if (!order?.payment_ref || !order.payment_provider) {
    return NextResponse.redirect(new URL('/paiement/retour?failed=1', origin))
  }
  if (order.payment_status === 'paid') {
    return NextResponse.redirect(new URL(`/paiement/retour?order=${order.id}&paid=1`, origin))
  }
  const provider = order.payment_provider as PaymentProvider

  const { data: integration } = await admin
    .from('payment_integrations')
    .select('public_key')
    .eq('store_id', order.store_id)
    .eq('provider', provider)
    .maybeSingle()
  if (!integration?.public_key) {
    return NextResponse.redirect(new URL('/paiement/retour?failed=1', origin))
  }

  try {
    const key = decryptToken(integration.public_key)
    const status = provider === 'slickpay'
      ? await getInvoiceStatus(order.payment_ref, key)
      : await getCheckoutStatus(order.payment_ref, key)
    if (status === 'paid') {
      await admin.from('orders').update({
        payment_status: 'paid',
        status: order.status === 'pending' ? 'confirmed' : order.status,
      }).eq('id', order.id)
      return NextResponse.redirect(new URL(`/paiement/retour?order=${order.id}&paid=1`, origin))
    }
  } catch (err) {
    console.error('[store payment return] error:', err)
  }
  return NextResponse.redirect(new URL(`/paiement/retour?order=${order.id}&failed=1`, origin))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/payments/store/return/route.ts
git commit -m "feat(payments): make the store-payment return route provider-aware"
```

---

### Task 14: Telegram alert for confirmed online platform payments

**Files:**
- Modify: `src/lib/telegram.ts`
- Modify: `src/app/api/webhooks/slickpay/route.ts`
- Modify: `src/app/api/payments/slickpay/return/route.ts`

- [ ] **Step 1: Add the notify helper to `lib/telegram.ts`**

Append to the end of the file:

```ts

import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_LABELS, type Plan } from '@/types/database'

// Ping Telegram the moment an ONLINE (auto-confirmed via webhook/return, no
// manual action needed) platform payment lands — subscriptions and top-ups a
// store owner pays Krenix directly, not a store's own customer payments.
// Callers must only call this after confirmAndActivate() returned true, so a
// webhook retry or the webhook/return race never double-notifies.
export async function notifyPlatformPaymentConfirmed(
  admin: ReturnType<typeof createAdminClient>,
  recordType: 'subscription' | 'credit_purchase',
  recordId: string,
  storeId: string,
): Promise<void> {
  const { data: store } = await admin.from('stores').select('name, slug').eq('id', storeId).maybeSingle()
  if (!store) return

  if (recordType === 'subscription') {
    const { data: sub } = await admin.from('subscriptions').select('plan, amount_dzd').eq('id', recordId).maybeSingle()
    if (!sub) return
    await sendTelegramMessage(
      `✅ <b>Paiement en ligne confirmé</b>\n${store.name} (${store.slug})\nPlan ${PLAN_LABELS[sub.plan as Plan]} — ${Number(sub.amount_dzd).toLocaleString('fr-DZ')} DZD\nActivé automatiquement, aucune action requise.`
    )
    return
  }
  const { data: cp } = await admin.from('credit_purchases').select('kind, quantity, amount_dzd').eq('id', recordId).maybeSingle()
  if (!cp) return
  const label = cp.kind === 'ai_credits' ? 'crédits IA' : 'messages chatbot'
  await sendTelegramMessage(
    `✅ <b>Recharge en ligne confirmée</b>\n${store.name} (${store.slug})\n+${cp.quantity} ${label} — ${Number(cp.amount_dzd).toLocaleString('fr-DZ')} DZD\nActivée automatiquement, aucune action requise.`
  )
}
```

- [ ] **Step 2: Call it from the platform-billing webhook**

In `src/app/api/webhooks/slickpay/route.ts`, change:

```ts
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
```

to:

```ts
import { verifyWebhookSignature, getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
```

and change:

```ts
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
    }
```

to:

```ts
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
    }
```

- [ ] **Step 3: Call it from the platform-billing return route**

In `src/app/api/payments/slickpay/return/route.ts`, change:

```ts
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
```

to:

```ts
import { getInvoiceStatus } from '@/lib/slickpay'
import { confirmAndActivate } from '@/lib/activation'
import { notifyPlatformPaymentConfirmed } from '@/lib/telegram'
```

and change:

```ts
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      return NextResponse.redirect(new URL(okPath, origin))
    }
```

to:

```ts
    const status = await getInvoiceStatus(record.provider_ref)
    if (status === 'paid') {
      const granted = await confirmAndActivate(admin, recordType, recordId, record.store_id as string)
      if (granted) await notifyPlatformPaymentConfirmed(admin, recordType, recordId, record.store_id as string)
      return NextResponse.redirect(new URL(okPath, origin))
    }
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/telegram.ts src/app/api/webhooks/slickpay/route.ts "src/app/api/payments/slickpay/return/route.ts"
git commit -m "feat(payments): Telegram alert for auto-confirmed online platform payments"
```

---

### Task 15: Live verification — SlickPay, Chargily, and Telegram

**Files:** none (verification only; fixes go wherever the real API response says they must)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS, including the new `chargily.test.ts`.

- [ ] **Step 2: Connect both providers to the ZAHRA Beauté demo store**

Using the sandbox credentials already in `.env.local` (`SLICKPAY_PUBLIC_KEY`,
`CHARGILY_SECRET_KEY`), go through the dashboard UI as the ZAHRA Beauté demo owner and
connect both SlickPay and Chargily via the Task 10 page. Confirm both show "Connecté".

- [ ] **Step 3: Run one real sandbox checkout per provider**

For each provider: activate it (toggle "Afficher sur ma boutique"), place a test order on the
ZAHRA Beauté storefront choosing "Payer en ligne", follow the redirect to the real sandbox
payment page, and either complete a sandbox test-card payment or note exactly what response
the API gives if it can't be completed end-to-end (e.g. sandbox requires a specific test card
number). Confirm the order's `payment_status` flips to `paid` (via webhook or the return route)
and report the actual API responses seen — do not report success without having seen it.

- [ ] **Step 4: Run one real sandbox platform-billing payment**

As a test store owner, go to `/activate` (or the credits top-up page), pay online via SlickPay
sandbox, and confirm: (a) the plan/credits actually activate, (b) a Telegram message arrives in
the configured admin chat with the "✅ Paiement en ligne confirmé" text.

- [ ] **Step 5: Record findings**

Summarize in the final report to the user: which of SlickPay/Chargily worked end-to-end in
sandbox, any endpoint/response mismatches found vs. Task 7's assumptions (and what was fixed),
and confirmation the Telegram message was received.

---

### Task 16: Final verification and deploy

**Files:** none

- [ ] **Step 1: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 2: Full regression screenshot pass**

In the browser: homepage (logo, pricing section, iPhone mockup), `/pricing` (logo, Ultimate
highlighted, Growth self-serve, Business badge), dashboard orders modal (no overlap, at both
desktop and 375px), dashboard integrations/payment (both providers).

- [ ] **Step 3: Commit any remaining changes, push, and promote to production**

```bash
git status
git add -A -- ':!node_modules'
git commit -m "chore: final polish pass for homepage/pricing/payment work"
```
(Skip the commit if there's nothing staged.)

```bash
git push origin fix/mobile-theme-preview-and-basic-photos
```

Then, in the Vercel dashboard: wait for the pushed commit's Preview deployment to reach
"Ready", open its Deployment Actions menu, click "Promote to Production", confirm the dialog
shows the correct commit hash and target domains (`www.krenix.store`, `*.krenix.store`), and
confirm the promotion.

- [ ] **Step 4: Post-deploy smoke check**

Load `https://www.krenix.store/` and `https://www.krenix.store/pricing` in the browser;
confirm the logo/pricing/mockup fixes are live.
