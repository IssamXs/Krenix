# Secure Super-Admin Foundation + Client Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the super-admin area into an audited, 2FA-protected control center where the owner can manage clients (view, ban/unban, hard-delete) with every privileged action executed server-side.

**Architecture:** A shared `requireSuperAdmin` guard fronts new `/api/super-admin/*` route handlers (service-role writes, AAL2 + step-up enforcement, audit logging). Supabase native MFA (TOTP) provides 2FA; a signed short-lived cookie provides step-up re-auth. Existing browser-side admin writes are migrated onto these routes.

**Tech Stack:** Next.js 14 App Router route handlers, TypeScript strict, Supabase (`@supabase/ssr` server client + service-role admin client + native MFA), vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-secure-superadmin-client-management-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/step-up.ts` (new) | Sign/verify the HMAC step-up cookie (pure) |
| `src/lib/step-up.test.ts` (new) | Unit tests for step-up |
| `src/lib/super-admin.ts` (new) | `requireSuperAdmin` guard + `logAdminAction` |
| `Database/028_admin_audit_log.sql` (new) | Audit-log table + RLS |
| `src/app/api/super-admin/step-up/route.ts` (new) | Verify password → set step-up cookie |
| `src/app/api/super-admin/stores/[id]/route.ts` (new) | PATCH plan/credits/limit |
| `src/app/api/super-admin/stores/[id]/suspend/route.ts` (new) | Toggle suspend |
| `src/app/api/super-admin/payments/[id]/route.ts` (new) | POST confirm/reject subscription |
| `src/app/api/super-admin/credit-purchases/[id]/route.ts` (new) | POST confirm/reject top-up |
| `src/app/api/super-admin/clients/route.ts` (new) | GET owners list |
| `src/app/api/super-admin/clients/[ownerId]/route.ts` (new) | POST ban/unban, DELETE hard-delete |
| `src/app/api/super-admin/audit/route.ts` (new) | GET audit log |
| `src/components/super-admin/StepUpModal.tsx` (new) | Password re-entry modal + fetch helper |
| `src/app/(platform)/super-admin/security/page.tsx` (new) | TOTP enroll + challenge |
| `src/app/(platform)/super-admin/clients/page.tsx` (new) | Clients UI |
| `src/app/(platform)/super-admin/audit/page.tsx` (new) | Audit log UI |
| `middleware.ts` (modify) | AAL2 gate for `/super-admin` (exempts the security page) |
| `src/app/(platform)/super-admin/layout.tsx` (modify) | Nav links (Clients, Audit, Sécurité) |
| `src/app/(platform)/super-admin/stores/page.tsx` (modify) | Call API + step-up |
| `src/app/(platform)/super-admin/payments/page.tsx` (modify) | Call API + step-up |
| `env.example` (modify) | Document `SUPERADMIN_STEPUP_SECRET` |

**Reused:** `createClient` (`@/lib/supabase/server`), `createAdminClient` (`@/lib/supabase/admin`), `PLAN_CREDITS`, `PLAN_CHATBOT_LIMITS`, `PLAN_LABELS`, `type Plan` (`@/types/database`).

---

## Task 1: Step-up cookie lib + tests

**Files:** Create `src/lib/step-up.ts`, `src/lib/step-up.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/step-up.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { signStepUp, verifyStepUp } from './step-up'

beforeEach(() => { process.env.SUPERADMIN_STEPUP_SECRET = 'test-secret-123' })

describe('step-up cookie', () => {
  it('round-trips for the same user within TTL', () => {
    const token = signStepUp('user-1')
    expect(verifyStepUp(token, 'user-1')).toBe(true)
  })
  it('rejects a different user', () => {
    expect(verifyStepUp(signStepUp('user-1'), 'user-2')).toBe(false)
  })
  it('rejects an expired token', () => {
    const past = Date.now() - 10 * 60 * 1000
    const token = signStepUp('user-1', past)
    expect(verifyStepUp(token, 'user-1')).toBe(false)
  })
  it('rejects a tampered signature', () => {
    const token = signStepUp('user-1')
    const [exp] = token.split('.')
    expect(verifyStepUp(`${exp}.deadbeef`, 'user-1')).toBe(false)
  })
  it('rejects null / missing secret', () => {
    expect(verifyStepUp(null, 'user-1')).toBe(false)
    process.env.SUPERADMIN_STEPUP_SECRET = ''
    expect(verifyStepUp(signStepUp('user-1'), 'user-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/step-up.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/step-up.ts`**:

```ts
import crypto from 'crypto'

const secret = () => process.env.SUPERADMIN_STEPUP_SECRET ?? ''
export const STEPUP_COOKIE = 'sa_stepup'
export const STEPUP_TTL_MS = 5 * 60 * 1000

// Cookie value = `${expiryMs}.${hmac(userId.expiryMs)}`. Short-lived, per-user.
export function signStepUp(userId: string, now: number = Date.now()): string {
  const expiry = now + STEPUP_TTL_MS
  const sig = crypto.createHmac('sha256', secret()).update(`${userId}.${expiry}`).digest('hex')
  return `${expiry}.${sig}`
}

export function verifyStepUp(cookieValue: string | null | undefined, userId: string, now: number = Date.now()): boolean {
  const s = secret()
  if (!cookieValue || !s) return false
  const [expiryStr, sig] = cookieValue.split('.')
  if (!expiryStr || !sig) return false
  const expiry = Number(expiryStr)
  if (!Number.isFinite(expiry) || expiry < now) return false
  const expected = crypto.createHmac('sha256', s).update(`${userId}.${expiry}`).digest('hex')
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) } catch { return false }
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/step-up.test.ts` → 5 pass. Then `npx tsc --noEmit -p .` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/step-up.ts src/lib/step-up.test.ts
git commit -m "feat(super-admin): step-up cookie sign/verify lib"
```

---

## Task 2: Audit-log migration

**Files:** Create `Database/028_admin_audit_log.sql`

- [ ] **Step 1: Write the migration**:

```sql
-- ============================================================
-- Admin audit log — every privileged super-admin action. Service-role write
-- only; super admins can read. Never written from the browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id),
  action       TEXT NOT NULL,
  target_type  TEXT NOT NULL,
  target_id    TEXT,
  details      JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super admins read audit" ON admin_audit_log;
CREATE POLICY "super admins read audit" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = auth.uid()));
```

- [ ] **Step 2: Verify** — `cat Database/028_admin_audit_log.sql` shows the table + policy. (Owner runs it in Supabase later.)

- [ ] **Step 3: Commit**

```bash
git add Database/028_admin_audit_log.sql
git commit -m "feat(super-admin): migration 028 — admin_audit_log table"
```

---

## Task 3: Guard + audit helper + env

**Files:** Create `src/lib/super-admin.ts`; Modify `env.example`

- [ ] **Step 1: Implement `src/lib/super-admin.ts`**:

```ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyStepUp, STEPUP_COOKIE } from '@/lib/step-up'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AdminContext { userId: string; email: string; admin: SupabaseClient }

// Guard for every /api/super-admin route. Returns a NextResponse (to return
// directly) on failure, or the AdminContext on success. Order: session →
// super_admins row → AAL2 (2FA) → step-up cookie (destructive routes only).
export async function requireSuperAdmin(opts: { stepUp?: boolean } = {}): Promise<AdminContext | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié', code: 'UNAUTH' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Accès refusé', code: 'FORBIDDEN' }, { status: 403 })

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== 'aal2') {
    return NextResponse.json({ error: 'Authentification à deux facteurs requise', code: 'MFA_REQUIRED' }, { status: 403 })
  }

  if (opts.stepUp) {
    const cookieStore = await cookies()
    if (!verifyStepUp(cookieStore.get(STEPUP_COOKIE)?.value, user.id)) {
      return NextResponse.json({ error: 'Ré-authentification requise', code: 'STEPUP_REQUIRED' }, { status: 403 })
    }
  }

  return { userId: user.id, email: user.email ?? '', admin }
}

export function isAdminContext(v: AdminContext | NextResponse): v is AdminContext {
  return !(v instanceof NextResponse)
}

export async function logAdminAction(
  admin: SupabaseClient, actorId: string, action: string,
  targetType: string, targetId: string | null, details: Record<string, unknown> = {},
): Promise<void> {
  await admin.from('admin_audit_log').insert({ actor_id: actorId, action, target_type: targetType, target_id: targetId, details })
}
```

- [ ] **Step 2: Add env var to `env.example`** — append after the SLICKPAY block is not present on this branch; append at end of file:

```
# ============================================================
# SUPER ADMIN — step-up re-auth cookie signing secret
# ============================================================
SUPERADMIN_STEPUP_SECRET=     # openssl rand -hex 32
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/super-admin.ts env.example
git commit -m "feat(super-admin): requireSuperAdmin guard + audit helper"
```

---

## Task 4: Step-up route

**Files:** Create `src/app/api/super-admin/step-up/route.ts`

- [ ] **Step 1: Implement**:

```ts
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient as createRawClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { signStepUp, STEPUP_COOKIE, STEPUP_TTL_MS } from '@/lib/step-up'

// Re-verify the admin's password WITHOUT disturbing their main session (uses a
// throwaway non-persistent client), then set a short-lived signed step-up cookie.
export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()
  const { data: sa } = await admin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
  if (!sa) return NextResponse.json({ error: 'Accès refusé' }, { status: 403 })

  const { password } = await request.json().catch(() => ({ password: '' }))
  if (!password) return NextResponse.json({ error: 'Mot de passe requis' }, { status: 400 })

  const throwaway = createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { error } = await throwaway.auth.signInWithPassword({ email: user.email, password })
  if (error) return NextResponse.json({ error: 'Mot de passe incorrect' }, { status: 401 })

  const res = NextResponse.json({ ok: true })
  res.cookies.set(STEPUP_COOKIE, signStepUp(user.id), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: Math.floor(STEPUP_TTL_MS / 1000),
  })
  return res
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/super-admin/step-up/route.ts
git commit -m "feat(super-admin): step-up route (password re-verify → signed cookie)"
```

---

## Task 5: StepUpModal component + fetch helper

**Files:** Create `src/components/super-admin/StepUpModal.tsx`

- [ ] **Step 1: Implement** (a client helper that runs a protected action, and on `STEPUP_REQUIRED` shows a password modal, posts to `/api/super-admin/step-up`, then retries):

```tsx
'use client'
import { useState, useCallback } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'

// useProtectedAction: wraps a fetch-returning action. If the server replies
// STEPUP_REQUIRED, it opens a password modal, steps up, and retries once.
export function useProtectedAction() {
  const [pending, setPending] = useState<null | (() => Promise<Response>)>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const run = useCallback(async (action: () => Promise<Response>): Promise<Response | null> => {
    const res = await action()
    if (res.status === 403) {
      const body = await res.clone().json().catch(() => ({}))
      if (body.code === 'STEPUP_REQUIRED') { setPending(() => action); setPassword(''); setError(''); return null }
      if (body.code === 'MFA_REQUIRED') { window.location.href = '/super-admin/security?challenge=1'; return null }
    }
    return res
  }, [])

  const submit = useCallback(async () => {
    if (!pending) return
    setBusy(true); setError('')
    const su = await fetch('/api/super-admin/step-up', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
    })
    if (!su.ok) { setError('Mot de passe incorrect'); setBusy(false); return }
    const retry = await pending()
    setBusy(false); setPending(null); setPassword('')
    return retry
  }, [pending, password])

  const modal = pending ? (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-amber-400" /><h3 className="text-white font-bold">Confirmer votre identité</h3></div>
        <p className="text-gray-500 text-xs">Action sensible — entrez votre mot de passe pour continuer.</p>
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <input type="password" value={password} autoFocus onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()} placeholder="Mot de passe"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none focus:border-[#3B82F6]/50 text-sm" />
        <div className="flex gap-3">
          <button onClick={() => { setPending(null); setPassword('') }} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">Annuler</button>
          <button onClick={submit} disabled={busy || !password} className="flex-1 flex items-center justify-center py-3 rounded-xl bg-amber-500 text-black font-semibold text-sm disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  ) : null

  return { run, modal }
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/super-admin/StepUpModal.tsx
git commit -m "feat(super-admin): useProtectedAction hook + step-up modal"
```

---

## Task 6: Store admin routes + migrate stores page

**Files:** Create `src/app/api/super-admin/stores/[id]/route.ts`, `src/app/api/super-admin/stores/[id]/suspend/route.ts`; Modify `src/app/(platform)/super-admin/stores/page.tsx`

- [ ] **Step 1: Implement `stores/[id]/route.ts`** (PATCH plan/credits/limit):

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { plan, ai_credits, chatbot_daily_limit } = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (typeof plan === 'string') patch.plan = plan
  if (ai_credits !== undefined) patch.ai_credits = Number(ai_credits)
  if (chatbot_daily_limit !== undefined) patch.chatbot_daily_limit = Number(chatbot_daily_limit)
  const { error } = await auth.admin.from('stores').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: 'Échec de la mise à jour' }, { status: 500 })
  await logAdminAction(auth.admin, auth.userId, 'store.update', 'store', id, patch)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Implement `stores/[id]/suspend/route.ts`**:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { suspend } = await request.json().catch(() => ({ suspend: true }))
  const { error } = await auth.admin.from('stores').update({ is_suspended: !!suspend }).eq('id', id)
  if (error) return NextResponse.json({ error: 'Échec' }, { status: 500 })
  await logAdminAction(auth.admin, auth.userId, suspend ? 'store.suspend' : 'store.unsuspend', 'store', id, {})
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Migrate `stores/page.tsx`** — replace the two direct-write handlers with API calls guarded by the step-up hook. At the top of the component add:

```tsx
import { useProtectedAction } from '@/components/super-admin/StepUpModal'
// inside component:
const { run, modal } = useProtectedAction()
```

Replace `handleSave` body with:

```tsx
    if (!editingStore) return
    setSaving(true)
    const res = await run(() => fetch(`/api/super-admin/stores/${editingStore.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: editForm.plan, ai_credits: Number(editForm.ai_credits), chatbot_daily_limit: Number(editForm.chatbot_daily_limit) }),
    }))
    if (res && res.ok) {
      setStores(prev => prev.map(s => s.id === editingStore.id
        ? { ...s, plan: editForm.plan as Plan, ai_credits: Number(editForm.ai_credits), chatbot_daily_limit: Number(editForm.chatbot_daily_limit) } : s))
      setEditingStore(null)
    }
    setSaving(false)
```

Replace `toggleSuspend` body with:

```tsx
    const res = await run(() => fetch(`/api/super-admin/stores/${store.id}/suspend`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suspend: !store.is_suspended }),
    }))
    if (res && res.ok) setStores(prev => prev.map(s => s.id === store.id ? { ...s, is_suspended: !s.is_suspended } : s))
```

And render `{modal}` just before the closing `</div>` of the component's root. (The list still loads via the read-only browser query — reads are fine; only writes move server-side.)

- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/super-admin/stores "src/app/(platform)/super-admin/stores/page.tsx"
git commit -m "feat(super-admin): server-side store edit/suspend routes + wire UI"
```

---

## Task 7: Payment + top-up admin routes + migrate payments page

**Files:** Create `src/app/api/super-admin/payments/[id]/route.ts`, `src/app/api/super-admin/credit-purchases/[id]/route.ts`; Modify `src/app/(platform)/super-admin/payments/page.tsx`

- [ ] **Step 1: Implement `payments/[id]/route.ts`** (confirm/reject subscription — same credit math as the current client-side `handleConfirm`):

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'
import { PLAN_CREDITS, PLAN_CHATBOT_LIMITS, type Plan } from '@/types/database'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { action, reason } = await request.json().catch(() => ({}))
  const admin = auth.admin

  const { data: sub } = await admin.from('subscriptions').select('store_id, plan, status').eq('id', id).maybeSingle()
  if (!sub || sub.status !== 'pending') return NextResponse.json({ error: 'Paiement introuvable ou déjà traité' }, { status: 400 })
  const plan = sub.plan as Plan

  if (action === 'reject') {
    await admin.from('subscriptions').update({ status: 'rejected', rejected_reason: reason ?? null }).eq('id', id).eq('status', 'pending')
    await logAdminAction(admin, auth.userId, 'payment.reject', 'subscription', id, { reason })
    return NextResponse.json({ ok: true })
  }

  const { data: store } = await admin.from('stores').select('ai_credits, plan').eq('id', sub.store_id).single()
  const tierCredits = PLAN_CREDITS[plan]
  const isRenewal = store?.plan === plan
  const nextCredits = isRenewal ? tierCredits : (store?.ai_credits ?? 0) + tierCredits
  const now = new Date()
  const expiresAt = plan === 'basic' ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  await admin.from('subscriptions').update({
    status: 'active', confirmed_at: now.toISOString(), confirmed_by: auth.userId,
    started_at: now.toISOString(), expires_at: expiresAt,
  }).eq('id', id).eq('status', 'pending')
  await admin.from('stores').update({
    plan, subscription_status: 'active', ai_credits: nextCredits, chatbot_daily_limit: PLAN_CHATBOT_LIMITS[plan],
  }).eq('id', sub.store_id)
  await logAdminAction(admin, auth.userId, 'payment.confirm', 'subscription', id, { plan, nextCredits })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Implement `credit-purchases/[id]/route.ts`**:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { id } = await ctx.params
  const { action, reason } = await request.json().catch(() => ({}))
  const admin = auth.admin

  const { data: cp } = await admin.from('credit_purchases').select('store_id, kind, quantity, status').eq('id', id).maybeSingle()
  if (!cp || cp.status !== 'pending') return NextResponse.json({ error: 'Recharge introuvable ou déjà traitée' }, { status: 400 })

  if (action === 'reject') {
    await admin.from('credit_purchases').update({ status: 'rejected', rejected_reason: reason ?? null }).eq('id', id).eq('status', 'pending')
    await logAdminAction(admin, auth.userId, 'topup.reject', 'credit_purchase', id, { reason })
    return NextResponse.json({ ok: true })
  }

  const column = cp.kind === 'ai_credits' ? 'purchased_credits' : 'purchased_chatbot'
  const { data: store } = await admin.from('stores').select(column).eq('id', cp.store_id).single()
  const current = (store?.[column as keyof typeof store] as number | undefined) ?? 0
  await admin.from('stores').update({ [column]: current + cp.quantity }).eq('id', cp.store_id)
  await admin.from('credit_purchases').update({ status: 'confirmed', confirmed_at: new Date().toISOString(), confirmed_by: auth.userId }).eq('id', id).eq('status', 'pending')
  await logAdminAction(admin, auth.userId, 'topup.confirm', 'credit_purchase', id, { kind: cp.kind, quantity: cp.quantity })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Migrate `payments/page.tsx`** — add `const { run, modal } = useProtectedAction()` (import from `@/components/super-admin/StepUpModal`). Replace the four handlers' write bodies with API calls:

`handleConfirm(payment)` →
```tsx
    setProcessing(payment.id)
    const res = await run(() => fetch(`/api/super-admin/payments/${payment.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }),
    }))
    if (res && res.ok) await load()
    setProcessing(null)
```
`handleReject(paymentId)` →
```tsx
    if (!rejectReason.trim()) return
    setProcessing(paymentId)
    const res = await run(() => fetch(`/api/super-admin/payments/${paymentId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: rejectReason }),
    }))
    if (res && res.ok) await load()
    setRejectId(null); setRejectReason(''); setProcessing(null)
```
`handleConfirmPurchase(p)` →
```tsx
    setProcessing(p.id)
    const res = await run(() => fetch(`/api/super-admin/credit-purchases/${p.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirm' }),
    }))
    if (res && res.ok) await load()
    setProcessing(null)
```
`handleRejectPurchase(id)` →
```tsx
    if (!rejectReason.trim()) return
    setProcessing(id)
    const res = await run(() => fetch(`/api/super-admin/credit-purchases/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reject', reason: rejectReason }),
    }))
    if (res && res.ok) await load()
    setRejectId(null); setRejectReason(''); setProcessing(null)
```
Render `{modal}` before the root closing `</div>`.

- [ ] **Step 4: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/super-admin/payments src/app/api/super-admin/credit-purchases "src/app/(platform)/super-admin/payments/page.tsx"
git commit -m "feat(super-admin): server-side payment/top-up confirm+reject routes + wire UI"
```

---

## Task 8: Clients API (list, ban, unban, delete)

**Files:** Create `src/app/api/super-admin/clients/route.ts`, `src/app/api/super-admin/clients/[ownerId]/route.ts`

- [ ] **Step 1: Implement `clients/route.ts`** (GET list of owners):

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext } from '@/lib/super-admin'

interface StoreLite { id: string; name: string; slug: string; plan: string; subscription_status: string; is_suspended: boolean; owner_id: string }

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!isAdminContext(auth)) return auth
  const admin = auth.admin

  const { data: stores } = await admin.from('stores')
    .select('id, name, slug, plan, subscription_status, is_suspended, owner_id')
    .order('created_at', { ascending: true })
  const byOwner = new Map<string, StoreLite[]>()
  for (const s of (stores ?? []) as StoreLite[]) {
    const arr = byOwner.get(s.owner_id) ?? []
    arr.push(s); byOwner.set(s.owner_id, arr)
  }

  // Resolve emails + banned state via the auth admin API (paginated).
  const emails = new Map<string, { email: string; banned: boolean }>()
  let page = 1
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    for (const u of users) {
      const banned = !!(u as { banned_until?: string }).banned_until && new Date((u as { banned_until?: string }).banned_until!) > new Date()
      emails.set(u.id, { email: u.email ?? '—', banned })
    }
    if (users.length < 1000) break
    page++
  }

  const clients = [...byOwner.entries()].map(([ownerId, s]) => ({
    ownerId,
    email: emails.get(ownerId)?.email ?? '—',
    banned: emails.get(ownerId)?.banned ?? false,
    storeCount: s.length,
    stores: s.map(x => ({ id: x.id, name: x.name, slug: x.slug, plan: x.plan, subscription_status: x.subscription_status, is_suspended: x.is_suspended })),
  }))
  return NextResponse.json({ clients })
}
```

- [ ] **Step 2: Implement `clients/[ownerId]/route.ts`** (POST ban/unban, DELETE hard-delete, with self/other-admin protection):

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext, logAdminAction } from '@/lib/super-admin'

const BAN_FOREVER = '876000h' // ~100 years

async function assertActionable(admin: ReturnType<typeof import('@/lib/supabase/admin').createAdminClient>, ownerId: string, selfId: string) {
  if (ownerId === selfId) return 'Vous ne pouvez pas agir sur votre propre compte.'
  const { data: targetIsAdmin } = await admin.from('super_admins').select('id').eq('user_id', ownerId).maybeSingle()
  if (targetIsAdmin) return 'Impossible d’agir sur un autre super administrateur.'
  return null
}

export async function POST(request: Request, ctx: { params: Promise<{ ownerId: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { ownerId } = await ctx.params
  const { action } = await request.json().catch(() => ({}))
  const guard = await assertActionable(auth.admin, ownerId, auth.userId)
  if (guard) return NextResponse.json({ error: guard }, { status: 400 })

  const ban = action === 'ban'
  const { error: banErr } = await auth.admin.auth.admin.updateUserById(ownerId, { ban_duration: ban ? BAN_FOREVER : 'none' })
  if (banErr) return NextResponse.json({ error: 'Échec de la mise à jour du compte' }, { status: 500 })
  await auth.admin.from('stores').update({ is_suspended: ban }).eq('owner_id', ownerId)
  await logAdminAction(auth.admin, auth.userId, ban ? 'client.ban' : 'client.unban', 'client', ownerId, {})
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, ctx: { params: Promise<{ ownerId: string }> }) {
  const auth = await requireSuperAdmin({ stepUp: true })
  if (!isAdminContext(auth)) return auth
  const { ownerId } = await ctx.params
  const guard = await assertActionable(auth.admin, ownerId, auth.userId)
  if (guard) return NextResponse.json({ error: guard }, { status: 400 })

  // Record the full store list BEFORE deletion so the audit trail survives.
  const { data: stores } = await auth.admin.from('stores').select('id, name, slug').eq('owner_id', ownerId)
  await logAdminAction(auth.admin, auth.userId, 'client.delete', 'client', ownerId, { stores: stores ?? [] })

  // Delete stores (child rows cascade via FKs), then the auth user.
  await auth.admin.from('stores').delete().eq('owner_id', ownerId)
  const { error: delErr } = await auth.admin.auth.admin.deleteUser(ownerId)
  if (delErr) return NextResponse.json({ error: 'Boutiques supprimées mais échec suppression du compte auth', code: 'PARTIAL' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/super-admin/clients
git commit -m "feat(super-admin): clients API — list, ban/unban, hard-delete (guarded)"
```

---

## Task 9: Clients page UI

**Files:** Create `src/app/(platform)/super-admin/clients/page.tsx`

- [ ] **Step 1: Implement** — lists clients from `GET /api/super-admin/clients`, with ban/unban and a typed-confirmation hard-delete, all via the step-up hook:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Loader2, Ban, CheckCircle, Trash2, Store as StoreIcon, ShieldAlert } from 'lucide-react'
import { useProtectedAction } from '@/components/super-admin/StepUpModal'

interface Client {
  ownerId: string; email: string; banned: boolean; storeCount: number
  stores: { id: string; name: string; slug: string; plan: string; subscription_status: string; is_suspended: boolean }[]
}

export default function SuperAdminClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Client | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const { run, modal } = useProtectedAction()

  const load = () => fetch('/api/super-admin/clients').then(r => r.json()).then(d => { setClients(d.clients ?? []); setLoading(false) })
  useEffect(() => { fetch('/api/super-admin/clients').then(r => r.json()).then(d => { setClients(d.clients ?? []); setLoading(false) }) }, [])

  const toggleBan = async (c: Client) => {
    setBusy(c.ownerId)
    const res = await run(() => fetch(`/api/super-admin/clients/${c.ownerId}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: c.banned ? 'unban' : 'ban' }),
    }))
    if (res && res.ok) await load()
    setBusy(null)
  }

  const confirmDelete = async () => {
    if (!deleting) return
    const expected = deleting.stores[0]?.name ?? deleting.email
    if (confirmText !== expected) return
    setBusy(deleting.ownerId)
    const res = await run(() => fetch(`/api/super-admin/clients/${deleting.ownerId}`, { method: 'DELETE' }))
    if (res && res.ok) { setDeleting(null); setConfirmText(''); await load() }
    setBusy(null)
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Clients</h1><p className="text-gray-500 text-sm mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p></div>

      {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div> : (
        <div className="space-y-3">
          {clients.map(c => (
            <div key={c.ownerId} className={`bg-[#111118] border rounded-2xl p-5 ${c.banned ? 'border-red-500/30 opacity-70' : 'border-white/5'}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold text-sm truncate">{c.email}</p>
                    {c.banned && <span className="text-red-400 text-xs bg-red-400/10 px-2 py-0.5 rounded-full">Banni</span>}
                  </div>
                  <p className="text-gray-500 text-xs mt-0.5">{c.storeCount} boutique{c.storeCount !== 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.stores.map(s => (
                      <span key={s.id} className="inline-flex items-center gap-1 text-[11px] text-gray-400 bg-white/5 px-2 py-0.5 rounded-lg">
                        <StoreIcon size={10} /> {s.slug}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleBan(c)} disabled={busy === c.ownerId}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${c.banned ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'} disabled:opacity-50`}>
                    {busy === c.ownerId ? <Loader2 size={13} className="animate-spin" /> : c.banned ? <CheckCircle size={13} /> : <Ban size={13} />}
                    {c.banned ? 'Débannir' : 'Bannir'}
                  </button>
                  <button onClick={() => { setDeleting(c); setConfirmText('') }}
                    className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all" title="Supprimer définitivement">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!clients.length && <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucun client.</div>}
        </div>
      )}

      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111118] border border-red-500/30 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-2"><ShieldAlert size={18} className="text-red-400" /><h3 className="text-white font-bold">Suppression définitive</h3></div>
            <p className="text-gray-400 text-xs">Cela supprime <b className="text-white">toutes</b> les boutiques et données de <b className="text-white">{deleting.email}</b>, et son compte. Irréversible.</p>
            <p className="text-gray-500 text-xs">Tapez <b className="text-white">{deleting.stores[0]?.name ?? deleting.email}</b> pour confirmer :</p>
            <input value={confirmText} autoFocus onChange={e => setConfirmText(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-red-500/20 text-white outline-none text-sm" />
            <div className="flex gap-3">
              <button onClick={() => { setDeleting(null); setConfirmText('') }} className="flex-1 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white text-sm">Annuler</button>
              <button onClick={confirmDelete} disabled={confirmText !== (deleting.stores[0]?.name ?? deleting.email) || busy === deleting.ownerId}
                className="flex-1 flex items-center justify-center py-3 rounded-xl bg-red-500 text-white font-semibold text-sm disabled:opacity-40">
                {busy === deleting.ownerId ? <Loader2 size={16} className="animate-spin" /> : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
      {modal}
    </div>
  )
}
```

- [ ] **Step 2: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/super-admin/clients/page.tsx"
git commit -m "feat(super-admin): clients page (ban/unban + typed-confirm delete)"
```

---

## Task 10: Audit API + page

**Files:** Create `src/app/api/super-admin/audit/route.ts`, `src/app/(platform)/super-admin/audit/page.tsx`

- [ ] **Step 1: Implement `audit/route.ts`**:

```ts
import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext } from '@/lib/super-admin'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!isAdminContext(auth)) return auth
  const { data } = await auth.admin.from('admin_audit_log')
    .select('id, actor_id, action, target_type, target_id, details, created_at')
    .order('created_at', { ascending: false }).limit(200)
  return NextResponse.json({ entries: data ?? [] })
}
```

- [ ] **Step 2: Implement `audit/page.tsx`**:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Loader2, ScrollText } from 'lucide-react'

interface Entry { id: string; action: string; target_type: string; target_id: string | null; details: Record<string, unknown>; created_at: string }

export default function SuperAdminAudit() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => { fetch('/api/super-admin/audit').then(r => r.json()).then(d => { setEntries(d.entries ?? []); setLoading(false) }) }, [])
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Journal d&apos;audit</h1><p className="text-gray-500 text-sm mt-1">200 dernières actions</p></div>
      {loading ? <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div> : (
        <div className="bg-[#111118] border border-white/5 rounded-2xl divide-y divide-white/5">
          {entries.map(e => (
            <div key={e.id} className="px-5 py-3 flex items-center gap-3 text-sm">
              <ScrollText size={14} className="text-gray-500 flex-shrink-0" />
              <span className="text-white font-medium">{e.action}</span>
              <span className="text-gray-500 text-xs">{e.target_type}{e.target_id ? `:${e.target_id.slice(0, 8)}` : ''}</span>
              <span className="ml-auto text-gray-600 text-xs">{new Date(e.created_at).toLocaleString('fr-DZ')}</span>
            </div>
          ))}
          {!entries.length && <div className="px-6 py-12 text-center text-gray-500 text-sm">Aucune action enregistrée.</div>}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Type-check** — `npx tsc --noEmit -p .` → clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/super-admin/audit "src/app/(platform)/super-admin/audit/page.tsx"
git commit -m "feat(super-admin): audit log API + page"
```

---

## Task 11: 2FA security page + AAL2 enforcement + nav

**Files:** Create `src/app/(platform)/super-admin/security/page.tsx`; Modify `src/app/(platform)/super-admin/layout.tsx`

- [ ] **Step 1: Enforce AAL2 in `middleware.ts`** — the layout CANNOT do this: it can't read the pathname to exempt the security page, and redirecting to a page under the *same* layout loops forever. Middleware has the pathname. In `handlePlatformAuth`, find the existing super-admin block:

```tsx
  if (pathname.startsWith('/super-admin')) {
    const { data: superAdmin } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!superAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }
```

Replace it with (adds an AAL2 gate that exempts the security page so enroll/challenge stays reachable):

```tsx
  if (pathname.startsWith('/super-admin')) {
    const { data: superAdmin } = await supabase
      .from('super_admins')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!superAdmin) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 2FA gate: every super-admin page EXCEPT the security page requires AAL2 (a
    // verified TOTP factor challenged this session). Below AAL2 → send to the
    // security page, which handles both enrolling a factor and challenging it.
    if (pathname !== '/super-admin/security') {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel !== 'aal2') {
        return NextResponse.redirect(new URL('/super-admin/security', request.url))
      }
    }
  }
```

- [ ] **Step 2: Add nav items in `layout.tsx`** — the layout keeps its `super_admins` gate (defense in depth) but does NO AAL redirect (that lives in middleware now). Add three nav items to the array (after the Paiements entry):

```tsx
            { href: '/super-admin/clients', label: 'Clients', icon: Users },
            { href: '/super-admin/audit', label: 'Audit', icon: ScrollText },
            { href: '/super-admin/security', label: 'Sécurité (2FA)', icon: Shield },
```

Add the imports: `import { Users, ScrollText } from 'lucide-react'` (merge with the existing lucide-react import; `Shield` is already imported).

- [ ] **Step 3: Implement `security/page.tsx`** (enroll + challenge, AAL-aware — all client-side Supabase MFA):

```tsx
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2, ShieldCheck, Shield } from 'lucide-react'

export default function SuperAdminSecurity() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [aal2, setAal2] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [enrollFactorId, setEnrollFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]).then(([factors, level]) => {
      const verified = factors.data?.totp?.find(f => f.status === 'verified')
      setFactorId(verified?.id ?? null)
      setAal2(level.data?.currentLevel === 'aal2')
      setLoading(false)
    })
  }, [supabase])

  const startEnroll = async () => {
    setBusy(true); setError('')
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
    if (error || !data) { setError('Échec de l’inscription'); setBusy(false); return }
    setEnrollFactorId(data.id); setQr(data.totp.qr_code); setBusy(false)
  }

  const verifyEnroll = async () => {
    if (!enrollFactorId) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrollFactorId, code })
    if (error) { setError('Code incorrect'); setBusy(false); return }
    setBusy(false); router.push('/super-admin')
  }

  const verifyChallenge = async () => {
    if (!factorId) return
    setBusy(true); setError('')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code })
    if (error) { setError('Code incorrect'); setBusy(false); return }
    setBusy(false); router.push('/super-admin')
  }

  if (loading) return <div className="flex justify-center py-16"><Loader2 size={28} className="animate-spin text-gray-500" /></div>

  // Verified factor but not yet AAL2 this session → challenge to step up.
  if (factorId && !aal2) {
    return (
      <div className="max-w-sm mx-auto space-y-4 py-10">
        <div className="flex items-center gap-2"><ShieldCheck size={20} className="text-green-400" /><h1 className="text-xl font-bold text-white">Vérification 2FA</h1></div>
        <p className="text-gray-500 text-sm">Entrez le code de votre application d’authentification.</p>
        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
        <input value={code} autoFocus onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && verifyChallenge()}
          placeholder="123456" inputMode="numeric" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none text-center tracking-widest text-lg" />
        <button onClick={verifyChallenge} disabled={busy || code.length < 6} className="w-full py-3 rounded-xl bg-green-500 text-black font-semibold text-sm disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Vérifier'}
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-md space-y-6">
      <div><h1 className="text-2xl font-bold text-white">Sécurité (2FA)</h1><p className="text-gray-500 text-sm mt-1">Authentification à deux facteurs</p></div>
      {factorId ? (
        <div className="bg-[#111118] border border-green-500/20 rounded-2xl p-6 flex items-center gap-3">
          <ShieldCheck size={22} className="text-green-400" />
          <div><p className="text-white font-semibold text-sm">2FA activée</p><p className="text-gray-500 text-xs">Votre compte est protégé par une application d’authentification.</p></div>
        </div>
      ) : (
        <div className="bg-[#111118] border border-white/10 rounded-2xl p-6 space-y-4">
          {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg">{error}</div>}
          {!qr ? (
            <>
              <div className="flex items-center gap-2"><Shield size={18} className="text-amber-400" /><p className="text-white font-semibold text-sm">Activez la 2FA pour continuer</p></div>
              <p className="text-gray-500 text-xs">Requis pour accéder au panneau super admin.</p>
              <button onClick={startEnroll} disabled={busy} className="w-full py-3 rounded-xl bg-[#3B82F6] text-black font-semibold text-sm disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Commencer'}
              </button>
            </>
          ) : (
            <>
              <p className="text-gray-400 text-xs">Scannez ce QR avec Google Authenticator / Authy, puis entrez le code :</p>
              {/* qr_code is an SVG data URL */}
              <img src={qr} alt="QR 2FA" className="w-44 h-44 mx-auto rounded-xl bg-white p-2" />
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="123456" inputMode="numeric"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white outline-none text-center tracking-widest text-lg" />
              <button onClick={verifyEnroll} disabled={busy || code.length < 6} className="w-full py-3 rounded-xl bg-green-500 text-black font-semibold text-sm disabled:opacity-50">
                {busy ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Activer la 2FA'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Type-check + lint** — `npx tsc --noEmit -p .` (clean) and `npx eslint "src/app/(platform)/super-admin/security/page.tsx"` (fix any `<img>`/hook warnings; `img` for a data-URL QR is fine — if eslint blocks `@next/next/no-img-element`, add `{/* eslint-disable-next-line @next/next/no-img-element */}` above the img).

- [ ] **Step 5: Commit**

```bash
git add middleware.ts "src/app/(platform)/super-admin/security/page.tsx" "src/app/(platform)/super-admin/layout.tsx"
git commit -m "feat(super-admin): TOTP 2FA enroll/challenge + AAL2 middleware gate + nav"
```

---

## Task 12: Full verification + runbook

**Not code — verification pass + owner runbook. No new commit unless fixes are needed.**

- [ ] **Step 1:** `npx tsc --noEmit -p .` → clean; `npx vitest run` → all pass (incl. `step-up.test.ts`); `npx eslint src/app/api/super-admin src/lib/super-admin.ts src/lib/step-up.ts` → clean.

- [ ] **Step 2: Owner runbook**
  1. Set `SUPERADMIN_STEPUP_SECRET` in `.env.local` (`openssl rand -hex 32`).
  2. Run `Database/028_admin_audit_log.sql` in Supabase.
  3. First login to `/super-admin` → routed to **Sécurité (2FA)** → enroll authenticator (scan QR, enter code).
  4. Re-visit `/super-admin` → enter TOTP code (challenge) to reach AAL2.
  5. Test on a **throwaway** owner account: Ban → verify their login blocked + stores suspended; Unban → restored. Hard-delete → verify stores + auth user gone, and an `client.delete` row exists in **Audit**.
  6. Confirm a pending payment via Paiements → verify it still works and logs `payment.confirm`.

---

## Self-Review

**1. Spec coverage:**
- Server-side audited admin API + guard → Tasks 3, 6, 7, 8, 10. ✅
- Migrate existing client-side writes (store edit/suspend, payment/top-up confirm/reject) → Tasks 6, 7. ✅
- Audit log table + page → Tasks 2, 10. ✅
- Client/owner list + ban/unban + hard-delete (typed confirm, self/admin protection) → Tasks 8, 9. ✅
- 2FA (TOTP) enroll + AAL2 enforcement → Task 11. ✅
- Step-up re-auth (password → signed cookie) → Tasks 1, 4, 5. ✅
- `SUPERADMIN_STEPUP_SECRET` env → Task 3. ✅
- Self-protection (no self/other-admin ban/delete) → Task 8 (`assertActionable`). ✅
- Data-safety (ban reversible; delete quadruple-guarded) → Tasks 8, 9. ✅

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; commands have expected output. The `layout.tsx` `path` no-op line is intentional (documents why pathname isn't used) and harmless. ✅

**3. Type consistency:** `requireSuperAdmin({stepUp})` + `isAdminContext` + `logAdminAction(admin, actorId, action, targetType, targetId, details)` identical across Tasks 3–10. `AdminContext` shape (`userId`, `email`, `admin`) consistent. `signStepUp`/`verifyStepUp`/`STEPUP_COOKIE`/`STEPUP_TTL_MS` consistent across Tasks 1, 3, 4. `useProtectedAction` returns `{ run, modal }`, used identically in Tasks 6, 7, 9. Route param shape `{ params: Promise<{...}> }` matches the Next 15/16 async-params convention already used in `api/stores/[id]/route.ts`. ✅
