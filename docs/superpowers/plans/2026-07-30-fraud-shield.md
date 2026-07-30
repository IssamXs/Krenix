# Fraud Shield Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 (rule-based) of the Fraud Shield feature described in `docs/superpowers/specs/2026-07-30-fraud-shield-design.md`: per-order fraud risk scoring from IP reputation, device-fingerprint reuse, order-timing regularity, and on-page behavior, surfaced on a dashboard page — gated entirely behind a single super-admin-only `stores.fraud_shield_enabled` flag so no other store is affected.

**Architecture:** A new migration adds the flag, three new `orders` columns (`fraud_risk_score`, `fraud_signals`, `fraud_label`), and a `fraud_order_signals` table for the raw per-order signals used in reuse/timing checks. Three small, independently-testable `lib/fraud-shield/*` modules (IP lookup, Turnstile verification, scoring) are wired into the existing `/api/orders` route. The storefront order form captures a device fingerprint (open-source `fingerprintjs`, self-hosted) and behavior timing, and renders a Cloudflare Turnstile widget, only when the viewed store has the flag on. A new `/dashboard/fraud-shield` page lists flagged orders for manual confirm-fake/confirm-real review.

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + RLS), TypeScript, Vitest, `@fingerprintjs/fingerprintjs` (open-source, MIT), Cloudflare Turnstile, `ip-api.com` free IP lookup.

**Out of scope for this plan** (see spec's phased approach): the v2 ML retraining pipeline (needs real labeled data first) and importing the user's historical Google Sheets export (exact export format not yet known — a follow-up task once the file is in hand).

**Prerequisite (manual, not a coding task):** sign up for Cloudflare Turnstile (free) and create a widget for the domain, then set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in the environment. Task 6 fails open (skips verification) if `TURNSTILE_SECRET_KEY` is unset, so the feature can be built and merged before these keys exist — but Turnstile provides no real protection until they're set.

---

### Task 1: Database migration

**Files:**
- Create: `Database/042_fraud_shield.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 042 — Fraud Shield: per-store fraud-detection feature (v1, rule-based)
-- Idempotent. Paste into Supabase → SQL Editor → Run.
--
-- Gated entirely behind stores.fraud_shield_enabled, defaulting to FALSE for
-- every store. Only a super admin (or the service role) may flip it — this
-- follows the same protected-column pattern as plan/credits (migration 025).
-- ============================================================

ALTER TABLE stores ADD COLUMN IF NOT EXISTS fraud_shield_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_risk_score INTEGER;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_signals JSONB;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS fraud_label TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fraud_label_check;
ALTER TABLE orders ADD CONSTRAINT orders_fraud_label_check
  CHECK (fraud_label IN ('pending', 'confirmed_fake', 'confirmed_real'));

CREATE TABLE IF NOT EXISTS fraud_order_signals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id               UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  order_id               UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL UNIQUE,
  ip                     TEXT,
  ip_country             TEXT,
  ip_is_proxy_or_hosting BOOLEAN NOT NULL DEFAULT FALSE,
  device_fingerprint     TEXT,
  time_on_page_ms        INTEGER,
  had_movement           BOOLEAN NOT NULL DEFAULT FALSE,
  form_fill_ms           INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fraud_signals_store_fingerprint
  ON fraud_order_signals(store_id, device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_store_created
  ON fraud_order_signals(store_id, created_at);

-- Service-role-only table (only the order-creation API route writes to it,
-- via the admin client) — RLS enabled with no owner policies, same as
-- rate_limits (migration 033).
ALTER TABLE fraud_order_signals ENABLE ROW LEVEL SECURITY;

-- Extend the migration-025 column-locking trigger to also protect
-- fraud_shield_enabled. Must re-CREATE OR REPLACE the whole function (it is
-- one function covering every protected column) — every existing protected
-- column is repeated here unchanged, plus the new one.
CREATE OR REPLACE FUNCTION protect_store_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.plan                   IS DISTINCT FROM OLD.plan
  OR NEW.ai_credits             IS DISTINCT FROM OLD.ai_credits
  OR NEW.chatbot_daily_limit    IS DISTINCT FROM OLD.chatbot_daily_limit
  OR NEW.purchased_credits      IS DISTINCT FROM OLD.purchased_credits
  OR NEW.purchased_chatbot      IS DISTINCT FROM OLD.purchased_chatbot
  OR NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status
  OR NEW.is_suspended           IS DISTINCT FROM OLD.is_suspended
  OR NEW.custom_domain_verified IS DISTINCT FROM OLD.custom_domain_verified
  OR NEW.fraud_shield_enabled   IS DISTINCT FROM OLD.fraud_shield_enabled
  THEN
    RAISE EXCEPTION 'Modification of protected store columns is not allowed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Same re-CREATE OR REPLACE treatment for the BEFORE INSERT defaults function,
-- adding one line so an owner can't create a new store with the flag already on.
CREATE OR REPLACE FUNCTION default_store_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.role() = 'service_role' OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  NEW.purchased_credits      := 0;
  NEW.purchased_chatbot      := 0;
  NEW.chatbot_daily_limit    := 0;
  NEW.is_suspended           := FALSE;
  NEW.custom_domain_verified := FALSE;
  NEW.subscription_status    := COALESCE(NEW.subscription_status, 'active');
  NEW.fraud_shield_enabled   := FALSE;

  IF NEW.plan IS DISTINCT FROM 'basic'
     AND NOT EXISTS (SELECT 1 FROM stores WHERE owner_id = NEW.owner_id AND plan = NEW.plan)
  THEN
    NEW.plan := 'basic';
  END IF;

  IF NEW.plan = 'basic' THEN
    NEW.ai_credits := LEAST(COALESCE(NEW.ai_credits, 5), 5);
  ELSE
    NEW.ai_credits := 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Run it**

Paste the full file into Supabase → SQL Editor → Run. Expected: `Success. No rows returned`.

- [ ] **Step 3: Verify the protected-column trigger picked up the new column**

Run in SQL Editor (replace `<any-store-id>` with a real id):

```sql
UPDATE stores SET fraud_shield_enabled = true WHERE id = '<any-store-id>';
```

Expected (when run as a normal authenticated non-super-admin session, e.g. via the anon/authenticated role rather than the SQL Editor's superuser session): `ERROR: Modification of protected store columns is not allowed`. Running it directly in the SQL Editor will succeed instead, since the editor runs as the Postgres superuser, not through PostgREST's `authenticated` role — that's expected and not a useful test of the trigger. The real check happens in Task 7's test.

- [ ] **Step 4: Commit**

```bash
git add Database/042_fraud_shield.sql
git commit -m "feat(fraud-shield): add fraud_shield_enabled flag and order signal columns"
```

---

### Task 2: TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add the new fields to `Store` and `Order`, and a `FraudLabel` type**

Find the `Store` interface and add `fraud_shield_enabled: boolean` (placed next to `custom_domain_verified` for proximity to other flag-like fields):

```typescript
export interface Store {
  id: string
  owner_id: string
  name: string
  slug: string
  logo_url: string | null
  theme_id: string | null
  pro_theme_slug: string | null
  plan: Plan
  subscription_status: SubscriptionStatus
  ai_credits: number
  chatbot_daily_limit: number
  settings: StoreSettings
  is_onboarded: boolean
  is_suspended: boolean
  custom_domain: string | null
  custom_domain_verified: boolean
  fraud_shield_enabled: boolean
  purchased_credits: number
  purchased_chatbot: number
  online_payment_enabled: boolean
  active_payment_provider: PaymentProvider | null
  created_at: string
  updated_at: string
  theme?: Theme
}
```

Add a `FraudLabel` type and extend `Order`:

```typescript
export type FraudLabel = 'pending' | 'confirmed_fake' | 'confirmed_real'

export interface Order {
  id: string
  store_id: string
  product_id: string | null
  landing_page_id: string | null
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  commune: string
  address: string | null
  quantity: number
  color: string | null
  size: string | null
  unit_price: number
  total_price: number
  delivery_price: number
  status: OrderStatus
  source: OrderSource
  notes: string | null
  variant: string | null
  tracking_number: string | null
  delivery_provider: string | null
  delivery_label_url: string | null
  payment_status: 'unpaid' | 'paid'
  payment_provider: PaymentProvider | null
  payment_ref: string | null
  fraud_risk_score: number | null
  fraud_signals: Record<string, { points: number; detail: string }> | null
  fraud_label: FraudLabel
  created_at: string
  updated_at: string
  product?: Product
  landing_page?: LandingPage
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors (there will likely be pre-existing unrelated errors in the repo if any — confirm the count doesn't increase).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "feat(fraud-shield): extend Store/Order types for fraud fields"
```

---

### Task 3: IP reputation lookup

**Files:**
- Create: `src/lib/fraud-shield/ip-intel.ts`
- Test: `src/lib/fraud-shield/ip-intel.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupIpIntel } from './ip-intel'

describe('lookupIpIntel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns proxy/hosting flag and country on a successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', countryCode: 'FR', proxy: true, hosting: false }),
    }))
    const result = await lookupIpIntel('1.2.3.4')
    expect(result).toEqual({ country: 'FR', isProxyOrHosting: true })
  })

  it('fails open (no signal) when the lookup errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const result = await lookupIpIntel('1.2.3.4')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
  })

  it('fails open when the API reports non-success status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'fail' }),
    }))
    const result = await lookupIpIntel('bogus')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
  })

  it('returns no signal for an unknown/missing IP without calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await lookupIpIntel('unknown')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fraud-shield/ip-intel.test.ts`
Expected: FAIL — `Cannot find module './ip-intel'`.

- [ ] **Step 3: Write the implementation**

```typescript
// ============================================================
// Free IP reputation lookup via ip-api.com (no key, ~45 req/min limit).
//
// NOTE: ip-api.com's free tier ToS restricts use to non-commercial purposes.
// Krenix is a commercial SaaS — confirm ip-api.com's paid plan (or swap this
// file for another provider) before relying on this for more than one pilot
// store at real volume. Kept isolated in this one file so swapping providers
// later is a single-file change.
// ============================================================

export interface IpIntel {
  country: string | null
  isProxyOrHosting: boolean
}

const EMPTY: IpIntel = { country: null, isProxyOrHosting: false }

export async function lookupIpIntel(ip: string): Promise<IpIntel> {
  if (!ip || ip === 'unknown') return EMPTY
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,proxy,hosting`,
      { signal: AbortSignal.timeout(2000) },
    )
    if (!res.ok) return EMPTY
    const data = await res.json()
    if (data.status !== 'success') return EMPTY
    return {
      country: data.countryCode ?? null,
      isProxyOrHosting: !!data.proxy || !!data.hosting,
    }
  } catch {
    // A lookup failure must never block a real order — fail open.
    return EMPTY
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fraud-shield/ip-intel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fraud-shield/ip-intel.ts src/lib/fraud-shield/ip-intel.test.ts
git commit -m "feat(fraud-shield): add free IP reputation lookup"
```

---

### Task 4: Turnstile server-side verification

**Files:**
- Create: `src/lib/fraud-shield/turnstile.ts`
- Test: `src/lib/fraud-shield/turnstile.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { verifyTurnstileToken } from './turnstile'

describe('verifyTurnstileToken', () => {
  const ORIGINAL_ENV = process.env.TURNSTILE_SECRET_KEY

  beforeEach(() => { process.env.TURNSTILE_SECRET_KEY = 'test-secret' })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_ENV
  })

  it('returns true when Cloudflare confirms the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }))
    expect(await verifyTurnstileToken('good-token', '1.2.3.4')).toBe(true)
  })

  it('returns false when Cloudflare rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }))
    expect(await verifyTurnstileToken('bad-token', '1.2.3.4')).toBe(false)
  })

  it('returns false when no token is provided', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await verifyTurnstileToken(null, '1.2.3.4')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails open when TURNSTILE_SECRET_KEY is not configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = ''
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await verifyTurnstileToken('any-token', '1.2.3.4')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails open when the Cloudflare call errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await verifyTurnstileToken('good-token', '1.2.3.4')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fraud-shield/turnstile.test.ts`
Expected: FAIL — `Cannot find module './turnstile'`.

- [ ] **Step 3: Write the implementation**

```typescript
// ============================================================
// Cloudflare Turnstile server-side verification.
//
// Fails OPEN (treats the order as legitimate) when TURNSTILE_SECRET_KEY is
// unset or Cloudflare's endpoint errors — a misconfigured or down CAPTCHA
// provider must never block real checkouts. It only fails CLOSED (rejects
// the order) when the key IS configured and Cloudflare explicitly says the
// token is invalid, or no token was submitted at all.
// ============================================================

export async function verifyTurnstileToken(token: string | null | undefined, remoteIp: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (!token) return false

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return true
    const data = await res.json()
    return !!data.success
  } catch {
    return true
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fraud-shield/turnstile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fraud-shield/turnstile.ts src/lib/fraud-shield/turnstile.test.ts
git commit -m "feat(fraud-shield): add Turnstile server-side verification"
```

---

### Task 5: Risk scoring engine

**Files:**
- Create: `src/lib/fraud-shield/score.ts`
- Test: `src/lib/fraud-shield/score.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { computeFraudRiskScore, type FraudSignalInputs } from './score'

const BASE: FraudSignalInputs = {
  ipCountry: 'DZ',
  ipIsProxyOrHosting: false,
  fingerprintSeenRecently: false,
  hadMovement: true,
  formFillMs: 8000,
  currentOrderTimestamp: '2026-07-30T08:09:55.000Z',
  previousOrderTimestamps: [],
}

describe('computeFraudRiskScore', () => {
  it('scores a clean, human-looking order at 0 with no signals', () => {
    const result = computeFraudRiskScore(BASE)
    expect(result.score).toBe(0)
    expect(result.signals).toEqual({})
  })

  it('flags a datacenter/proxy IP', () => {
    const result = computeFraudRiskScore({ ...BASE, ipIsProxyOrHosting: true })
    expect(result.score).toBe(25)
    expect(result.signals.datacenter_ip.points).toBe(25)
  })

  it('flags device fingerprint reuse', () => {
    const result = computeFraudRiskScore({ ...BASE, fingerprintSeenRecently: true })
    expect(result.score).toBe(30)
    expect(result.signals.fingerprint_reuse.points).toBe(30)
  })

  it('flags absent human behavior (no movement + fast fill)', () => {
    const result = computeFraudRiskScore({ ...BASE, hadMovement: false, formFillMs: 900 })
    expect(result.score).toBe(15)
    expect(result.signals.no_human_behavior.points).toBe(15)
  })

  it('does not flag fast-fill alone if there was mouse movement', () => {
    const result = computeFraudRiskScore({ ...BASE, hadMovement: true, formFillMs: 900 })
    expect(result.signals.no_human_behavior).toBeUndefined()
  })

  it('flags a non-Algeria IP country', () => {
    const result = computeFraudRiskScore({ ...BASE, ipCountry: 'FR' })
    expect(result.score).toBe(10)
    expect(result.signals.ip_country_mismatch.detail).toContain('FR')
  })

  it('flags a regular timing pattern matching the original bot screenshot (~2-4 min gaps)', () => {
    const result = computeFraudRiskScore({
      ...BASE,
      currentOrderTimestamp: '2026-07-30T08:09:55.000Z',
      previousOrderTimestamps: [
        '2026-07-30T08:07:22.000Z',
        '2026-07-30T08:04:54.000Z',
        '2026-07-30T08:04:17.000Z',
        '2026-07-30T08:03:25.000Z',
      ],
    })
    expect(result.score).toBe(20)
    expect(result.signals.timing_regularity).toBeDefined()
  })

  it('does not flag irregular, human-paced order gaps', () => {
    const result = computeFraudRiskScore({
      ...BASE,
      currentOrderTimestamp: '2026-07-30T12:00:00.000Z',
      previousOrderTimestamps: [
        '2026-07-30T10:15:00.000Z',
        '2026-07-30T08:50:00.000Z',
        '2026-07-30T08:40:00.000Z',
        '2026-07-30T05:00:00.000Z',
      ],
    })
    expect(result.signals.timing_regularity).toBeUndefined()
  })

  it('does not flag timing with fewer than 4 data points', () => {
    const result = computeFraudRiskScore({
      ...BASE,
      previousOrderTimestamps: ['2026-07-30T08:07:22.000Z'],
    })
    expect(result.signals.timing_regularity).toBeUndefined()
  })

  it('combines multiple signals and caps the score at 100', () => {
    const result = computeFraudRiskScore({
      ipCountry: 'FR',
      ipIsProxyOrHosting: true,
      fingerprintSeenRecently: true,
      hadMovement: false,
      formFillMs: 500,
      currentOrderTimestamp: '2026-07-30T08:09:55.000Z',
      previousOrderTimestamps: [
        '2026-07-30T08:07:22.000Z',
        '2026-07-30T08:04:54.000Z',
        '2026-07-30T08:04:17.000Z',
        '2026-07-30T08:03:25.000Z',
      ],
    })
    // 25 + 30 + 15 + 10 + 20 = 100
    expect(result.score).toBe(100)
    expect(Object.keys(result.signals).sort()).toEqual(
      ['datacenter_ip', 'fingerprint_reuse', 'ip_country_mismatch', 'no_human_behavior', 'timing_regularity'].sort(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/fraud-shield/score.test.ts`
Expected: FAIL — `Cannot find module './score'`.

- [ ] **Step 3: Write the implementation**

```typescript
// ============================================================
// Fraud Shield v1 — hand-tuned rule-based risk scoring.
//
// Combines four independent signals into a 0-100 risk score. Every signal
// that fires is returned with its point contribution and a French detail
// string for display on /dashboard/fraud-shield. This is intentionally a
// pure function (no DB/network access) so it's fully unit-testable; the
// caller (the orders API route) is responsible for gathering the inputs.
//
// v2 (see design spec): once enough orders have been confirmed
// fake/real via the dashboard, these hand-tuned weights get replaced by a
// model trained on the same features — the shape of FraudSignalInputs is
// exactly the feature set that model will consume.
// ============================================================

export interface FraudSignalInputs {
  ipCountry: string | null
  ipIsProxyOrHosting: boolean
  fingerprintSeenRecently: boolean
  hadMovement: boolean
  formFillMs: number | null
  /** ISO timestamp of the order currently being scored. */
  currentOrderTimestamp: string
  /** This store's previous orders' created_at, most-recent-first. */
  previousOrderTimestamps: string[]
}

export interface FraudSignal {
  points: number
  detail: string
}

export interface FraudSignalResult {
  score: number
  signals: Record<string, FraudSignal>
}

const HOME_COUNTRY = 'DZ'
// Up to this many total data points (current order + previous ones) are used
// to judge timing regularity.
const TIMING_WINDOW = 5
const MIN_GAPS_FOR_TIMING_CHECK = 3
const MIN_MEAN_GAP_SECONDS = 30
const MAX_MEAN_GAP_SECONDS = 900
const MAX_COEFFICIENT_OF_VARIATION = 0.3

export function computeFraudRiskScore(input: FraudSignalInputs): FraudSignalResult {
  const signals: Record<string, FraudSignal> = {}

  if (input.ipIsProxyOrHosting) {
    signals.datacenter_ip = { points: 25, detail: 'IP identifiée comme proxy/VPN/hébergeur' }
  }

  if (input.fingerprintSeenRecently) {
    signals.fingerprint_reuse = { points: 30, detail: 'Même appareil déjà utilisé pour une autre commande récente' }
  }

  if (!input.hadMovement && input.formFillMs !== null && input.formFillMs < 1500) {
    signals.no_human_behavior = { points: 15, detail: 'Aucun mouvement détecté et formulaire rempli en moins de 1,5s' }
  }

  if (input.ipCountry && input.ipCountry !== HOME_COUNTRY) {
    signals.ip_country_mismatch = { points: 10, detail: `IP localisée hors Algérie (${input.ipCountry})` }
  }

  const timing = detectRegularTiming(input.currentOrderTimestamp, input.previousOrderTimestamps)
  if (timing) {
    signals.timing_regularity = {
      points: 20,
      detail: `Intervalle régulier entre commandes (~${Math.round(timing.meanSeconds)}s, écart-type ${Math.round(timing.stdDevSeconds)}s)`,
    }
  }

  const score = Math.min(100, Object.values(signals).reduce((sum, s) => sum + s.points, 0))
  return { score, signals }
}

function detectRegularTiming(
  currentTimestamp: string,
  previousTimestampsMostRecentFirst: string[],
): { meanSeconds: number; stdDevSeconds: number } | null {
  const times = [currentTimestamp, ...previousTimestampsMostRecentFirst]
    .slice(0, TIMING_WINDOW)
    .map(t => new Date(t).getTime())
    .sort((a, b) => a - b) // oldest to newest

  if (times.length < MIN_GAPS_FOR_TIMING_CHECK + 1) return null

  const gapsSeconds: number[] = []
  for (let i = 1; i < times.length; i++) {
    gapsSeconds.push((times[i] - times[i - 1]) / 1000)
  }

  const mean = gapsSeconds.reduce((a, b) => a + b, 0) / gapsSeconds.length
  if (mean < MIN_MEAN_GAP_SECONDS || mean > MAX_MEAN_GAP_SECONDS) return null

  const variance = gapsSeconds.reduce((a, b) => a + (b - mean) ** 2, 0) / gapsSeconds.length
  const stdDev = Math.sqrt(variance)
  const coefficientOfVariation = mean === 0 ? Infinity : stdDev / mean

  if (coefficientOfVariation >= MAX_COEFFICIENT_OF_VARIATION) return null
  return { meanSeconds: mean, stdDevSeconds: stdDev }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/fraud-shield/score.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fraud-shield/score.ts src/lib/fraud-shield/score.test.ts
git commit -m "feat(fraud-shield): add rule-based risk scoring engine"
```

---

### Task 6: Wire scoring into the orders API route

**Files:**
- Modify: `src/app/api/orders/route.ts`
- Test: `src/app/api/orders/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedOrders: Record<string, unknown>[] = []
const insertedSignals: Record<string, unknown>[] = []
let storeRow: Record<string, unknown> = {
  id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false,
}
let previousOrders: { created_at: string }[] = []
let fingerprintMatches: { id: string }[] = []

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => true,
  requestIp: () => '1.2.3.4',
}))

vi.mock('@/lib/fraud-shield/turnstile', () => ({
  verifyTurnstileToken: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/fraud-shield/ip-intel', () => ({
  lookupIpIntel: vi.fn().mockResolvedValue({ country: 'FR', isProxyOrHosting: true }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'stores') {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: storeRow }) }) }) }
      }
      if (table === 'orders') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedOrders.push(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: { id: 'order-1', order_number: 'K-1', total_price: 1000, wilaya: 'Alger', commune: 'Alger', color: null, quantity: 1, customer_name: 'Amira' },
                  error: null,
                }),
              }),
            }
          },
          select: () => ({
            eq: () => ({
              order: () => ({ limit: async () => ({ data: previousOrders }) }),
            }),
          }),
        }
      }
      if (table === 'fraud_order_signals') {
        return {
          insert: (payload: Record<string, unknown>) => { insertedSignals.push(payload); return Promise.resolve({ error: null }) },
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({ limit: async () => ({ data: fingerprintMatches }) }),
              }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/orders', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = {
  store_id: 'store-1',
  customer_name: 'Amira Benali',
  customer_phone: '0555123456',
  wilaya: 'Alger',
  commune: 'Alger Centre',
  quantity: 1,
}

beforeEach(() => {
  insertedOrders.length = 0
  insertedSignals.length = 0
  previousOrders = []
  fingerprintMatches = []
  storeRow = { id: 'store-1', is_suspended: false, subscription_status: 'active', fraud_shield_enabled: false }
})

describe('POST /api/orders — fraud shield gating', () => {
  it('does not score or record signals when fraud_shield_enabled is false', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].fraud_risk_score).toBeUndefined()
    expect(insertedSignals).toHaveLength(0)
  })

  it('scores the order and records signals when fraud_shield_enabled is true', async () => {
    storeRow.fraud_shield_enabled = true
    const res = await POST(makeRequest({ ...VALID_BODY, turnstile_token: 'tok', device_fingerprint: 'fp-1', had_movement: false, form_fill_ms: 400 }))
    expect(res.status).toBe(200)
    expect(insertedOrders[0].fraud_risk_score).toBeGreaterThan(0)
    expect(insertedSignals).toHaveLength(1)
    expect(insertedSignals[0].device_fingerprint).toBe('fp-1')
  })

  it('rejects the order when Turnstile verification fails and fraud_shield_enabled is true', async () => {
    storeRow.fraud_shield_enabled = true
    const { verifyTurnstileToken } = await import('@/lib/fraud-shield/turnstile')
    vi.mocked(verifyTurnstileToken).mockResolvedValueOnce(false)
    const res = await POST(makeRequest({ ...VALID_BODY, turnstile_token: 'bad' }))
    expect(res.status).toBe(400)
    expect(insertedOrders).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: FAIL — `insertedOrders[0].fraud_risk_score` assertions fail because the route doesn't read `fraud_shield_enabled` or compute a score yet.

- [ ] **Step 3: Modify the route**

Replace the full file with:

```typescript
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { verifyTurnstileToken } from '@/lib/fraud-shield/turnstile'
import { lookupIpIntel } from '@/lib/fraud-shield/ip-intel'
import { computeFraudRiskScore } from '@/lib/fraud-shield/score'

// Storefront order creation.
//
// This MUST be server-side. The browser previously inserted into `orders`
// directly with the anon key and asked for the row back
// (`.insert(...).select(...)`), which PostgREST turns into
// INSERT ... RETURNING. RETURNING requires a SELECT policy on the new row, and
// `orders` deliberately has no anon SELECT policy (a customer must never be
// able to read other customers' orders/phone numbers). So every real order
// failed with a 42501 RLS violation — the insert itself was fine, reading the
// row back was not. Going through the admin client here fixes that without
// opening up any anon read access.
//
// Price fields are intentionally NOT trusted from the client: the
// validate_order_insert trigger (migration 033) recomputes unit_price/
// total_price from the products table. They are still sent so manual/no-product
// orders keep a sane value.

function validAlgerianPhone(phone: string) {
  return /^(05|06|07)\d{8}$/.test(phone.replace(/\s/g, ''))
}

export async function POST(request: Request) {
  try {
    if (!(await checkRateLimit(`orders:${requestIp(request)}`, 10, 600))) {
      return NextResponse.json({ error: 'Trop de commandes. Réessayez plus tard.' }, { status: 429 })
    }

    const body = await request.json()
    const {
      store_id, product_id, landing_page_id, variant,
      customer_name, customer_phone, wilaya, commune,
      color, size, quantity, unit_price, delivery_price, total_price,
      source, notes,
      turnstile_token, device_fingerprint, time_on_page_ms, had_movement, form_fill_ms,
    } = body

    if (!store_id || !customer_name?.trim()) {
      return NextResponse.json({ error: 'Champs requis manquants.' }, { status: 400 })
    }
    if (!validAlgerianPhone(String(customer_phone ?? ''))) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }
    if (!wilaya || !commune?.trim()) {
      return NextResponse.json({ error: 'Wilaya et commune requises.' }, { status: 400 })
    }
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty < 1 || qty > 100) {
      return NextResponse.json({ error: 'Quantité invalide.' }, { status: 400 })
    }

    const admin = createAdminClient()

    // The store must exist, be live, and be paid — never accept orders for a
    // suspended or unactivated boutique.
    const { data: store } = await admin
      .from('stores')
      .select('id, is_suspended, subscription_status, fraud_shield_enabled')
      .eq('id', store_id)
      .maybeSingle()
    if (!store || store.is_suspended || store.subscription_status !== 'active') {
      return NextResponse.json({ error: 'Boutique indisponible.' }, { status: 404 })
    }

    const ip = requestIp(request)
    let fraudRiskScore: number | null = null
    let fraudSignals: Record<string, { points: number; detail: string }> | null = null
    let ipIntel = { country: null as string | null, isProxyOrHosting: false }

    if (store.fraud_shield_enabled) {
      const turnstileOk = await verifyTurnstileToken(turnstile_token, ip)
      if (!turnstileOk) {
        return NextResponse.json({ error: 'Vérification anti-robot échouée. Réessayez.' }, { status: 400 })
      }

      const [intel, { data: previousOrders }, { data: fingerprintMatches }] = await Promise.all([
        lookupIpIntel(ip),
        admin
          .from('orders')
          .select('created_at')
          .eq('store_id', store_id)
          .order('created_at', { ascending: false })
          .limit(4),
        device_fingerprint
          ? admin
              .from('fraud_order_signals')
              .select('id')
              .eq('store_id', store_id)
              .eq('device_fingerprint', device_fingerprint)
              .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
              .limit(1)
          : Promise.resolve({ data: [] }),
      ])
      ipIntel = intel

      const result = computeFraudRiskScore({
        ipCountry: ipIntel.country,
        ipIsProxyOrHosting: ipIntel.isProxyOrHosting,
        fingerprintSeenRecently: (fingerprintMatches ?? []).length > 0,
        hadMovement: !!had_movement,
        formFillMs: form_fill_ms ?? null,
        currentOrderTimestamp: new Date().toISOString(),
        previousOrderTimestamps: (previousOrders ?? []).map((o: { created_at: string }) => o.created_at),
      })
      fraudRiskScore = result.score
      fraudSignals = result.signals
    }

    const insertPayload: Record<string, unknown> = {
      store_id,
      product_id: product_id ?? null,
      landing_page_id: landing_page_id ?? null,
      variant: variant ?? null,
      customer_name: String(customer_name).trim().slice(0, 100),
      customer_phone: String(customer_phone).replace(/\s/g, ''),
      wilaya,
      commune: String(commune).trim().slice(0, 100),
      color: color || null,
      size: size || null,
      quantity: qty,
      unit_price: Number(unit_price) || 0,
      delivery_price: Number(delivery_price) || 0,
      total_price: Number(total_price) || 0,
      status: 'pending',
      source: source || 'form',
      notes: notes || null,
    }
    if (store.fraud_shield_enabled) {
      insertPayload.fraud_risk_score = fraudRiskScore
      insertPayload.fraud_signals = fraudSignals
    }

    const { data: order, error } = await admin
      .from('orders')
      .insert(insertPayload)
      .select('id, order_number, total_price, wilaya, commune, color, quantity, customer_name')
      .single()

    if (error) {
      // The DB triggers (validation + same-phone spam guard) raise P0001 with a
      // ready-to-show French message; surface that, hide anything else.
      console.error('[api/orders] insert failed:', error)
      const isTriggerMessage = error.code === 'P0001'
      return NextResponse.json(
        { error: isTriggerMessage ? error.message : 'Erreur lors de la commande. Réessayez.' },
        { status: isTriggerMessage ? 400 : 500 },
      )
    }

    if (store.fraud_shield_enabled && order?.id) {
      await admin.from('fraud_order_signals').insert({
        store_id,
        order_id: order.id,
        ip,
        ip_country: ipIntel.country,
        ip_is_proxy_or_hosting: ipIntel.isProxyOrHosting,
        device_fingerprint: device_fingerprint ?? null,
        time_on_page_ms: time_on_page_ms ?? null,
        had_movement: !!had_movement,
        form_fill_ms: form_fill_ms ?? null,
      })
    }

    return NextResponse.json({ order })
  } catch (err) {
    console.error('[api/orders] unexpected error:', err)
    return NextResponse.json({ error: 'Erreur interne du serveur.' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/orders/route.test.ts`
Expected: PASS (3 tests). Also re-run the pre-existing orders tests to confirm nothing broke: `npx vitest run src/app/api/orders`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/orders/route.ts src/app/api/orders/route.test.ts
git commit -m "feat(fraud-shield): score orders and record signals when enabled"
```

---

### Task 7: Super-admin toggle endpoint

**Files:**
- Create: `src/app/api/super-admin/stores/[id]/fraud-shield/route.ts`
- Test: `src/app/api/super-admin/stores/[id]/fraud-shield/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

let updatedPatch: Record<string, unknown> | null = null
let authResult: unknown = { admin: { from: () => ({ update: (p: Record<string, unknown>) => { updatedPatch = p; return { eq: async () => ({ error: null }) } } }) }, userId: 'admin-1' }

vi.mock('@/lib/super-admin', () => ({
  requireSuperAdmin: async () => authResult,
  isAdminContext: (a: unknown) => !!(a as { admin?: unknown }).admin,
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/cache/store-cache', () => ({
  revalidateStoreCache: vi.fn(),
}))

import { POST } from './route'

beforeEach(() => {
  updatedPatch = null
  authResult = { admin: { from: () => ({ update: (p: Record<string, unknown>) => { updatedPatch = p; return { eq: async () => ({ error: null }) } } }) }, userId: 'admin-1' }
})

describe('POST /api/super-admin/stores/[id]/fraud-shield', () => {
  it('enables the flag', async () => {
    const req = new Request('http://test', { method: 'POST', body: JSON.stringify({ enabled: true }) })
    const res = await POST(req, { params: Promise.resolve({ id: 'store-1' }) })
    expect(res.status).toBe(200)
    expect(updatedPatch).toEqual({ fraud_shield_enabled: true })
  })

  it('disables the flag', async () => {
    const req = new Request('http://test', { method: 'POST', body: JSON.stringify({ enabled: false }) })
    const res = await POST(req, { params: Promise.resolve({ id: 'store-1' }) })
    expect(res.status).toBe(200)
    expect(updatedPatch).toEqual({ fraud_shield_enabled: false })
  })

  it('returns whatever requireSuperAdmin returns when the caller is not an admin', async () => {
    authResult = new Response('nope', { status: 403 })
    const req = new Request('http://test', { method: 'POST', body: JSON.stringify({ enabled: true }) })
    const res = await POST(req, { params: Promise.resolve({ id: 'store-1' }) })
    expect(res.status).toBe(403)
    expect(updatedPatch).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/api/super-admin/stores/[id]/fraud-shield/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation** (mirrors `stores/[id]/suspend/route.ts` exactly)

```typescript
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { revalidateStoreCache } from '@/lib/cache/store-cache'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { enabled } = await request.json().catch(() => ({ enabled: false }))
  const { error } = await auth.admin.from('stores').update({ fraud_shield_enabled: !!enabled }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Échec' }, { status: 500 })
  await logAdminAction(auth.admin, auth.userId, enabled ? 'store.fraud_shield_enable' : 'store.fraud_shield_disable', 'store', id, {})
  revalidateStoreCache()
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/api/super-admin/stores/[id]/fraud-shield/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/api/super-admin/stores/[id]/fraud-shield/route.ts" "src/app/api/super-admin/stores/[id]/fraud-shield/route.test.ts"
git commit -m "feat(fraud-shield): add super-admin toggle endpoint"
```

---

### Task 8: Super-admin UI toggle

**Files:**
- Modify: `src/app/(platform)/super-admin/stores/page.tsx`

- [ ] **Step 1: Add `fraud_shield_enabled` to the `StoreRow` interface**

Find:
```typescript
interface StoreRow {
  id: string
  name: string
  slug: string
  plan: Plan
  subscription_status: string
  ai_credits: number
  chatbot_daily_limit: number
  is_suspended: boolean
  is_onboarded: boolean
  created_at: string
  owner_id: string
  custom_domain: string | null
  purchased_credits: number
  purchased_chatbot: number
  subscriptions?: { status: string; expires_at: string | null }[]
}
```

Replace with (adds one field):
```typescript
interface StoreRow {
  id: string
  name: string
  slug: string
  plan: Plan
  subscription_status: string
  ai_credits: number
  chatbot_daily_limit: number
  is_suspended: boolean
  is_onboarded: boolean
  created_at: string
  owner_id: string
  custom_domain: string | null
  purchased_credits: number
  purchased_chatbot: number
  fraud_shield_enabled: boolean
  subscriptions?: { status: string; expires_at: string | null }[]
}
```

- [ ] **Step 2: Add a `toggleFraudShield` handler next to `toggleSuspend`**

Find:
```typescript
  const toggleSuspend = async (store: StoreRow) => {
    const res = await run(() => fetch(`/api/super-admin/stores/${store.id}/suspend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suspend: !store.is_suspended }),
    }))
    if (res && res.ok) setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_suspended: !s.is_suspended } : s))
  }
```

Add immediately after it:
```typescript

  const toggleFraudShield = async (store: StoreRow) => {
    const res = await run(() => fetch(`/api/super-admin/stores/${store.id}/fraud-shield`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: !store.fraud_shield_enabled }),
    }))
    if (res && res.ok) setStores(prev => prev.map(s => s.id === store.id ? { ...s, fraud_shield_enabled: !s.fraud_shield_enabled } : s))
  }
```

- [ ] **Step 3: Render the toggle button**

Find the block around line 230 that shows `Crédits IA` / `Chatbot/jour` (read the file to get the exact surrounding JSX before editing, since line numbers shift):

```
<p className="text-dash-ink">Crédits IA : <span className="text-dash-ink-soft">{store.ai_credits}</span></p>
<p className="text-dash-ink">Chatbot/jour : <span className="text-dash-ink-soft">{store.chatbot_daily_limit}</span></p>
```

Add immediately after those two lines, inside the same container:
```tsx
<div className="flex items-center gap-2 pt-1">
  <span className="text-dash-ink text-xs">Fraud Shield :</span>
  <button
    onClick={() => toggleFraudShield(store)}
    className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors ${
      store.fraud_shield_enabled ? 'bg-dash-success-soft text-dash-success' : 'bg-dash-surface-2 text-dash-ink-soft'
    }`}
  >
    {store.fraud_shield_enabled ? 'Activé' : 'Désactivé'}
  </button>
</div>
```

- [ ] **Step 4: Verify manually**

Run: `npm run dev`, log in as the super admin, open `/super-admin/stores`, expand any store row, click the Fraud Shield toggle, confirm it flips and persists on page reload.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(platform)/super-admin/stores/page.tsx"
git commit -m "feat(fraud-shield): add super-admin toggle button"
```

---

### Task 9: Client-side signal capture

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/lib/fraud-shield/client-signals.ts`

- [ ] **Step 1: Install the open-source fingerprint library**

Run: `npm install @fingerprintjs/fingerprintjs`
Expected: added to `dependencies` in `package.json`.

- [ ] **Step 2: Write the capture utility**

```typescript
'use client'

// ============================================================
// Storefront-only signal capture for Fraud Shield. Only imported/used when
// the viewed store has fraud_shield_enabled — see OrderFormFields.tsx.
//
// Device fingerprint: open-source, self-hosted @fingerprintjs/fingerprintjs
// (MIT-licensed, no quota, no billing — NOT the paid Fingerprint Pro API).
// ============================================================

let cachedFingerprint: string | null = null

export async function getDeviceFingerprint(): Promise<string | null> {
  if (cachedFingerprint) return cachedFingerprint
  try {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default
    const agent = await FingerprintJS.load()
    const result = await agent.get()
    cachedFingerprint = result.visitorId
    return cachedFingerprint
  } catch {
    return null
  }
}

export interface BehaviorSignals {
  time_on_page_ms: number
  had_movement: boolean
  form_fill_ms: number | null
}

export interface BehaviorTracker {
  /** Call on every form field change to track fill speed. */
  recordInput(): void
  getSignals(): BehaviorSignals
  dispose(): void
}

export function createBehaviorTracker(): BehaviorTracker {
  const startedAt = Date.now()
  let hadMovement = false
  let firstInputAt: number | null = null
  let lastInputAt: number | null = null

  const onMove = () => { hadMovement = true }
  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onMove, { once: true, passive: true })
    window.addEventListener('touchstart', onMove, { once: true, passive: true })
  }

  return {
    recordInput() {
      const now = Date.now()
      if (firstInputAt === null) firstInputAt = now
      lastInputAt = now
    },
    getSignals() {
      return {
        time_on_page_ms: Date.now() - startedAt,
        had_movement: hadMovement,
        form_fill_ms: firstInputAt !== null && lastInputAt !== null ? lastInputAt - firstInputAt : null,
      }
    },
    dispose() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('touchstart', onMove)
      }
    },
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/lib/fraud-shield/client-signals.ts
git commit -m "feat(fraud-shield): add client-side fingerprint and behavior capture"
```

---

### Task 10: Turnstile client widget hook

**Files:**
- Create: `src/lib/fraud-shield/use-turnstile.ts`

- [ ] **Step 1: Write the hook**

```typescript
'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: { sitekey: string; callback: (token: string) => void }) => string
    }
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
let scriptLoadPromise: Promise<void> | null = null

function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()
  if (scriptLoadPromise) return scriptLoadPromise
  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Turnstile script failed to load'))
    document.head.appendChild(script)
  })
  return scriptLoadPromise
}

// Renders an (usually invisible) Turnstile widget into the returned ref's
// container and exposes the verification token once solved. Only call with
// enabled=true when the store has fraud_shield_enabled — this loads an
// external script, which should never happen for stores without the flag.
export function useTurnstile(siteKey: string | undefined, enabled: boolean) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled || !siteKey || !containerRef.current) return
    let cancelled = false
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: (t: string) => setToken(t),
        })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [enabled, siteKey])

  return { containerRef, token }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/fraud-shield/use-turnstile.ts
git commit -m "feat(fraud-shield): add Turnstile client widget hook"
```

---

### Task 11: Wire capture into the storefront order form

**Files:**
- Modify: `src/components/store/OrderFormFields.tsx`

- [ ] **Step 1: Import the new utilities**

Find:
```typescript
import { colorHex, isLightHex, colorRemaining, sizeRemaining } from '@/lib/variants'
import { Loader2, CheckCircle, ShoppingBag, Truck, Check, CreditCard, Banknote } from 'lucide-react'
```

Replace with:
```typescript
import { colorHex, isLightHex, colorRemaining, sizeRemaining } from '@/lib/variants'
import { getDeviceFingerprint, createBehaviorTracker, type BehaviorTracker } from '@/lib/fraud-shield/client-signals'
import { useTurnstile } from '@/lib/fraud-shield/use-turnstile'
import { Loader2, CheckCircle, ShoppingBag, Truck, Check, CreditCard, Banknote } from 'lucide-react'
```

- [ ] **Step 2: Start capture when the flag is on**

Find:
```typescript
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)
```

Replace with:
```typescript
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [createdOrder, setCreatedOrder] = useState<CreatedOrder | null>(null)

  const fraudShieldEnabled = !!store.fraud_shield_enabled
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null)
  const behaviorTrackerRef = useRef<BehaviorTracker | null>(null)
  const { containerRef: turnstileRef, token: turnstileToken } = useTurnstile(
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
    fraudShieldEnabled,
  )

  useEffect(() => {
    if (!fraudShieldEnabled) return
    getDeviceFingerprint().then(setDeviceFingerprint)
    behaviorTrackerRef.current = createBehaviorTracker()
    return () => behaviorTrackerRef.current?.dispose()
  }, [fraudShieldEnabled])
```

- [ ] **Step 3: Record input activity on every field change**

Find:
```typescript
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))
```

Replace with:
```typescript
  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      behaviorTrackerRef.current?.recordInput()
      setForm(f => ({ ...f, [k]: e.target.value }))
    }
```

- [ ] **Step 4: Include the signals in the order payload**

Find the `fetch('/api/orders', ...)` body in `handleSubmit`:
```typescript
        body: JSON.stringify({
          store_id: store.id,
          product_id: product?.id ?? null,
          landing_page_id: landingPageId ?? null,
          variant,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          wilaya: form.wilaya,
          commune: form.commune,
          color: form.color || null,
          size: form.size || null,
          quantity: form.quantity,
          unit_price: unitPrice,
          delivery_price: finalDelivery,
          total_price: total,
          source: landingPageId ? 'landing_page' : 'form',
          notes: form.notes || null,
        }),
```

Replace with:
```typescript
        body: JSON.stringify({
          store_id: store.id,
          product_id: product?.id ?? null,
          landing_page_id: landingPageId ?? null,
          variant,
          customer_name: form.customer_name,
          customer_phone: form.customer_phone,
          wilaya: form.wilaya,
          commune: form.commune,
          color: form.color || null,
          size: form.size || null,
          quantity: form.quantity,
          unit_price: unitPrice,
          delivery_price: finalDelivery,
          total_price: total,
          source: landingPageId ? 'landing_page' : 'form',
          notes: form.notes || null,
          ...(fraudShieldEnabled ? {
            turnstile_token: turnstileToken,
            device_fingerprint: deviceFingerprint,
            ...behaviorTrackerRef.current?.getSignals(),
          } : {}),
        }),
```

- [ ] **Step 5: Render the (usually invisible) Turnstile widget above the submit button**

Find:
```tsx
      <button
        onClick={handleSubmit}
        disabled={submitting || outOfStock}
```

Replace with:
```tsx
      {fraudShieldEnabled && <div ref={turnstileRef} />}

      <button
        onClick={handleSubmit}
        disabled={submitting || outOfStock}
```

- [ ] **Step 6: Verify manually**

Run: `npm run dev`. On a store where `fraud_shield_enabled` is `false` (the default), confirm the storefront order form behaves exactly as before and no Turnstile script loads (check the Network tab). Then flip the flag on for a test store via the Task 8 UI, reload the storefront, place a test order, and confirm in Supabase that `orders.fraud_risk_score`/`fraud_signals` and a matching `fraud_order_signals` row were created.

- [ ] **Step 7: Commit**

```bash
git add src/components/store/OrderFormFields.tsx
git commit -m "feat(fraud-shield): capture device/behavior signals on the storefront order form"
```

---

### Task 12: Dashboard navigation entry

**Files:**
- Modify: `src/lib/i18n/dictionaries/types.ts`
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`
- Modify: `src/app/(platform)/dashboard/layout.tsx`

- [ ] **Step 1: Add the `fraudShield` nav key to the dictionary type**

In `src/lib/i18n/dictionaries/types.ts`, find:
```typescript
    crm: string
    landingPages: string
```
Replace with:
```typescript
    crm: string
    fraudShield: string
    landingPages: string
```

- [ ] **Step 2: Add the French label**

In `src/lib/i18n/dictionaries/fr.ts`, find:
```typescript
    crm: 'CRM',
    landingPages: 'Landing Pages',
```
Replace with:
```typescript
    crm: 'CRM',
    fraudShield: 'Fraud Shield',
    landingPages: 'Landing Pages',
```

- [ ] **Step 3: Add the Arabic label**

In `src/lib/i18n/dictionaries/ar.ts`, find:
```typescript
    crm: 'إدارة العملاء',
    landingPages: 'صفحات الهبوط',
```
Replace with:
```typescript
    crm: 'إدارة العملاء',
    fraudShield: 'حماية من الاحتيال',
    landingPages: 'صفحات الهبوط',
```

- [ ] **Step 4: Add the nav item, gated on the store flag (not a plan)**

In `src/app/(platform)/dashboard/layout.tsx`, add a `ShieldAlert` icon import. Find:
```typescript
import {
  LayoutDashboard, Package, ShoppingCart, Settings, LogOut,
  Menu, X, CreditCard, FileText, Sparkles, ChevronRight, TrendingUp,
  Palette, BarChart2, Puzzle, Users, MessageCircle, UserPlus, Contact, Building2, Plus, PlayCircle
} from 'lucide-react'
```
Replace with:
```typescript
import {
  LayoutDashboard, Package, ShoppingCart, Settings, LogOut,
  Menu, X, CreditCard, FileText, Sparkles, ChevronRight, TrendingUp,
  Palette, BarChart2, Puzzle, Users, MessageCircle, UserPlus, Contact, Building2, Plus, PlayCircle, ShieldAlert
} from 'lucide-react'
```

Find the `navItems` construction:
```typescript
  const navItems: NavItem[] = [
    ...NAV_ALWAYS,
    ...(store && AGENCY_PLANS.includes(store.plan as Plan)
      ? [{ href: '/dashboard/agency', icon: Building2, key: 'agency' as const }]
      : []),
    ...NAV_PRO,
    ...NAV_BOTTOM,
  ]
```
Replace with:
```typescript
  const navItems: NavItem[] = [
    ...NAV_ALWAYS,
    ...(store && AGENCY_PLANS.includes(store.plan as Plan)
      ? [{ href: '/dashboard/agency', icon: Building2, key: 'agency' as const }]
      : []),
    // Not a plan-gated feature — visible only to the one store this is
    // piloted on, via the super-admin-only fraud_shield_enabled flag.
    ...(store?.fraud_shield_enabled
      ? [{ href: '/dashboard/fraud-shield', icon: ShieldAlert, key: 'fraudShield' as const }]
      : []),
    ...NAV_PRO,
    ...NAV_BOTTOM,
  ]
```

Also find the header title lookup so the new page's title resolves correctly. `navItems` (defined just above this block) is already `NAV_ALWAYS` + conditional agency + conditional fraud-shield + `NAV_PRO` + `NAV_BOTTOM`, so it's a strict superset of the old `[...NAV_ALWAYS, ...NAV_PRO, ...NAV_BOTTOM]` — use it directly instead of re-concatenating (re-adding `NAV_ALWAYS`/`NAV_PRO`/`NAV_BOTTOM` on top of `navItems` would just duplicate entries). Find:
```typescript
              const all = [...NAV_ALWAYS, ...NAV_PRO, ...NAV_BOTTOM]
```
Replace with:
```typescript
              const all = navItems
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/i18n/dictionaries/types.ts src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts "src/app/(platform)/dashboard/layout.tsx"
git commit -m "feat(fraud-shield): add gated dashboard nav entry"
```

---

### Task 13: Dashboard Fraud Shield page

**Files:**
- Create: `src/app/(platform)/dashboard/fraud-shield/page.tsx`

- [ ] **Step 1: Write the page** (mirrors the CRM page's data-fetching/gating pattern; uses `dash-*` tokens and `StatusBadge`-style pill treatment per project design rules)

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveActiveStore } from '@/lib/active-store'
import type { FraudLabel } from '@/types/database'
import { ShieldAlert, Loader2, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDA as DA } from '@/lib/format'

interface FlaggedOrder {
  id: string
  order_number: string
  customer_name: string
  customer_phone: string
  wilaya: string
  total_price: number
  created_at: string
  fraud_risk_score: number | null
  fraud_signals: Record<string, { points: number; detail: string }> | null
  fraud_label: FraudLabel
}

const LABEL_STYLES: Record<FraudLabel, string> = {
  pending: 'bg-dash-warning-soft text-dash-warning-dark',
  confirmed_fake: 'bg-dash-danger-soft text-dash-danger',
  confirmed_real: 'bg-dash-success-soft text-dash-success',
}
const LABEL_TEXT: Record<FraudLabel, string> = {
  pending: 'En attente',
  confirmed_fake: 'Confirmée fausse',
  confirmed_real: 'Confirmée réelle',
}

export default function FraudShieldPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [storeId, setStoreId] = useState('')
  const [orders, setOrders] = useState<FlaggedOrder[]>([])
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/auth/login'); return }
      const store = await resolveActiveStore(supabase, user.id, 'id, fraud_shield_enabled') as { id: string; fraud_shield_enabled: boolean } | null
      if (!store) { router.push('/onboarding/step-1'); return }
      // Not plan-gated: redirect away entirely if this store's flag is off,
      // rather than showing a LockedFeatureCard (this isn't a paid upsell yet).
      if (!store.fraud_shield_enabled) { router.push('/dashboard'); return }
      setStoreId(store.id)

      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name, customer_phone, wilaya, total_price, created_at, fraud_risk_score, fraud_signals, fraud_label')
        .eq('store_id', store.id)
        .not('fraud_risk_score', 'is', null)
        .order('fraud_risk_score', { ascending: false })
      setOrders((data ?? []) as FlaggedOrder[])
      setLoading(false)
    })
  }, [router])

  const confirmLabel = async (orderId: string, label: FraudLabel) => {
    const supabase = createClient()
    await supabase.from('orders').update({ fraud_label: label }).eq('id', orderId).eq('store_id', storeId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, fraud_label: label } : o))
  }

  if (loading) {
    return <div className="flex items-center justify-center py-32"><Loader2 className="animate-spin text-dash-accent" size={26} /></div>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="dash-font-heading font-medium text-[28px] text-dash-ink flex items-center gap-2">
          <ShieldAlert size={24} className="text-dash-accent" /> Fraud Shield
        </h1>
        <p className="text-dash-ink-soft text-sm mt-1">
          {orders.length} commande{orders.length !== 1 ? 's' : ''} analysée{orders.length !== 1 ? 's' : ''} — rien n&apos;est bloqué automatiquement, vous décidez.
        </p>
      </div>

      {orders.length === 0 ? (
        <div className="bg-dash-surface border border-dash-border rounded-[20px] p-12 flex flex-col items-center gap-3 text-center">
          <ShieldAlert size={32} className="text-dash-ink-faint" />
          <p className="text-dash-ink-soft text-sm">Aucune commande analysée pour l&apos;instant.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map(o => {
            const isOpen = open === o.id
            const scoreTone = (o.fraud_risk_score ?? 0) >= 60 ? 'text-dash-danger' : (o.fraud_risk_score ?? 0) >= 30 ? 'text-dash-warning-dark' : 'text-dash-ink-soft'
            return (
              <div key={o.id} className="bg-dash-surface border border-dash-border rounded-[20px] overflow-hidden">
                <button onClick={() => setOpen(isOpen ? null : o.id)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-dash-surface-2 transition-colors">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-dash-surface-2 font-bold ${scoreTone}`}>
                    {o.fraud_risk_score}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-dash-ink text-sm font-medium truncate">{o.customer_name} · {o.order_number}</p>
                    <p className="text-dash-ink-soft text-xs">{o.wilaya} · {new Date(o.created_at).toLocaleString('fr-DZ')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-dash-ink text-sm font-semibold">{DA(o.total_price)}</p>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${LABEL_STYLES[o.fraud_label]}`}>{LABEL_TEXT[o.fraud_label]}</span>
                  </div>
                  {isOpen ? <ChevronUp size={16} className="text-dash-ink-soft" /> : <ChevronDown size={16} className="text-dash-ink-soft" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 border-t border-dash-border pt-3 space-y-3">
                    <div className="space-y-1.5">
                      {Object.entries(o.fraud_signals ?? {}).map(([key, sig]) => (
                        <div key={key} className="flex items-center justify-between text-xs">
                          <span className="text-dash-ink-soft">{sig.detail}</span>
                          <span className="text-dash-ink font-semibold">+{sig.points}</span>
                        </div>
                      ))}
                      {Object.keys(o.fraud_signals ?? {}).length === 0 && (
                        <p className="text-dash-ink-faint text-xs">Aucun signal détecté.</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <button onClick={() => confirmLabel(o.id, 'confirmed_real')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-dash-success-soft text-dash-success">
                        <Check size={12} /> Commande réelle
                      </button>
                      <button onClick={() => confirmLabel(o.id, 'confirmed_fake')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-dash-danger-soft text-dash-danger">
                        <X size={12} /> Commande fausse
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, with the flag enabled for a test store (Task 8) and at least one order scored (Task 11's manual test), visit `/dashboard/fraud-shield`, confirm the order shows with its score and signal breakdown, and that clicking "Commande fausse"/"Commande réelle" updates the badge and persists on reload. Also confirm that visiting the same URL for a store with the flag off redirects to `/dashboard`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/dashboard/fraud-shield/page.tsx"
git commit -m "feat(fraud-shield): add dashboard review page"
```

---

### Task 14: Environment variables documentation

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the new variables**

Append to `.env.example`:
```
# Fraud Shield (only relevant for stores with fraud_shield_enabled=true)
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs(fraud-shield): document Turnstile env vars"
```

---

## Self-review notes

- **Spec coverage:** feature flag (Task 1/7/8), client capture — fingerprint + behavior + Turnstile (Tasks 9-11), server-side IP/reputation + scoring + Turnstile verification (Tasks 3-6), storage (Task 1), dashboard review + confirm buttons (Task 13), nav gating by flag not plan (Task 12). v2 ML and the Google Sheets bootstrap import are explicitly out of scope per the spec's phased approach and are follow-up work once real data exists.
- **No placeholders:** every step has runnable code or an exact command; no TBDs.
- **Type consistency:** `FraudLabel`, `FraudSignalInputs`, `FraudSignalResult`/`FraudSignal` names are used identically across Tasks 2, 5, 6, and 13.
