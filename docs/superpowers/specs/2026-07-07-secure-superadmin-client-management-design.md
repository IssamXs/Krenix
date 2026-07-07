# Secure Super-Admin Foundation + Client Management — Design (Spec A)

**Date:** 2026-07-07
**Status:** Approved (pending spec review)
**Author:** Issam + Claude

## Goal

Turn the existing partial super-admin area into a hardened control center where the
owner (Issam) can securely manage clients — view every owner, ban/unban them, and fully
delete an account — with every privileged action executed server-side, protected by 2FA
+ step-up re-auth, and recorded in an audit log.

This is **Spec A** of a two-part effort. Spec B (usage/revenue monitoring + API-key
health) is a separate follow-up and is out of scope here.

## Decisions (locked)

1. **Server-side audited admin API.** All privileged actions move from browser writes to
   `/api/super-admin/*` route handlers using the service-role admin client, each
   re-verifying super-admin identity and writing an audit-log row.
2. **Client actions:** **Ban** (reversible — blocks login + suspends all the owner's
   stores, data retained) and **Hard-delete** (irreversible — deletes all the owner's
   stores then the auth user; guarded by typing the store name).
3. **Access security = maximum:** TOTP **2FA at login** (Supabase native MFA, enforced as
   AAL2 on the super-admin area) **and step-up re-auth** (password re-entry) before every
   destructive action.
4. **Approach:** build on Supabase-native primitives (MFA + `auth.admin`) — no custom
   security crypto.

## What already exists (extend, don't rebuild)

- `src/app/(platform)/super-admin/layout.tsx` — gate: checks `super_admins` table, redirects non-admins.
- `.../super-admin/page.tsx` — overview stats + recent stores.
- `.../super-admin/stores/page.tsx` — search stores; **client-side** edit plan/credits/limit + suspend toggle.
- `.../super-admin/payments/page.tsx` — **client-side** confirm/reject subscriptions + credit top-ups.
- `super_admins` table: `{ id, user_id → auth.users, created_at }`. No profiles/owners table — clients are `auth.users` referenced by `stores.owner_id`.
- Middleware already guards `/super-admin` for authenticated users; the layout enforces the super-admin check.

**Weakness being fixed:** the stores + payments pages mutate `stores`/`subscriptions`
directly from the browser Supabase client. This spec moves all such writes server-side.

## Architecture

### 1. Admin API layer + guard

New shared guard `src/lib/super-admin.ts`:

- `requireSuperAdmin(request, opts?: { stepUp?: boolean }): Promise<{ user, admin } | Response>` —
  1. gets the session user (server client); 401 if none;
  2. verifies a row in `super_admins` for `user.id`; 403 if not;
  3. enforces **AAL2**: reads `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`; if
     `currentLevel !== 'aal2'`, returns 403 `{ code: 'MFA_REQUIRED' }`;
  4. if `opts.stepUp`, requires a valid step-up cookie (below); 403 `{ code: 'STEPUP_REQUIRED' }` if absent/expired;
  5. returns `{ user, admin: createAdminClient() }` for the route to use.
- `logAdminAction(admin, actorId, action, targetType, targetId, details)` — inserts an
  `admin_audit_log` row. Called by every mutating route.

New route handlers under `src/app/api/super-admin/`:

| Route | Method | stepUp | Replaces |
|-------|--------|--------|----------|
| `stores/[id]` | PATCH | yes | stores page `handleSave` (plan/credits/chatbot limit) |
| `stores/[id]/suspend` | POST | yes | stores page `toggleSuspend` |
| `payments/[id]/confirm` | POST | yes | payments page `handleConfirm` (subscription) |
| `payments/[id]/reject` | POST | yes | payments page `handleReject` |
| `credit-purchases/[id]/confirm` | POST | yes | payments page `handleConfirmPurchase` |
| `credit-purchases/[id]/reject` | POST | yes | payments page `handleRejectPurchase` |
| `clients` | GET | no | (new) list owners + their stores + status |
| `clients/[ownerId]/ban` | POST | yes | (new) ban owner |
| `clients/[ownerId]/unban` | POST | yes | (new) unban owner |
| `clients/[ownerId]` | DELETE | yes | (new) hard-delete owner |
| `step-up` | POST | n/a | (new) verify password → set step-up cookie |
| `audit` | GET | no | (new) list audit log |

The client pages keep the same UX but call these routes (fetch) instead of writing to
Supabase directly. Confirm/activate logic (credits math, expiry, chatbot limit) is the
same as today's `handleConfirm`, just executed server-side with the admin client.

### 2. Audit log

Migration `Database/028_admin_audit_log.sql`:

```sql
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     UUID REFERENCES auth.users(id),
  action       TEXT NOT NULL,          -- e.g. 'store.update', 'client.ban', 'client.delete'
  target_type  TEXT NOT NULL,          -- 'store' | 'client' | 'subscription' | 'credit_purchase'
  target_id    TEXT,
  details      JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
-- Service-role write only (no anon/auth policies). Super admins read via a policy:
CREATE POLICY "super admins read audit" ON admin_audit_log FOR SELECT
  USING (EXISTS (SELECT 1 FROM super_admins sa WHERE sa.user_id = auth.uid()));
```

New page `.../super-admin/audit/page.tsx` renders the log (actor, action, target, time),
newest first — read via the admin API `GET /audit`.

### 3. Client / owner management

New page `.../super-admin/clients/page.tsx`. Data via `GET /api/super-admin/clients`:
the route lists all `stores` grouped by `owner_id`, resolves each owner's email through
`admin.auth.admin.listUsers()` (paginated) or per-owner `getUserById`, and returns
`[{ ownerId, email, banned, stores: [{id,name,slug,plan,subscription_status,is_suspended}], storeCount }]`.

Actions:
- **Ban** (`POST clients/[ownerId]/ban`, stepUp): `admin.auth.admin.updateUserById(ownerId, { ban_duration: '876000h' })` (blocks login) + set `is_suspended = true` on all their stores. Audit `client.ban`.
- **Unban** (`POST clients/[ownerId]/unban`, stepUp): `ban_duration: 'none'` + `is_suspended = false` on their stores. Audit `client.unban`.
- **Hard-delete** (`DELETE clients/[ownerId]`, stepUp): UI requires typing a store's name to confirm; the route deletes all the owner's stores (child rows cascade via existing FKs, as the agency-delete route already relies on) then `admin.auth.admin.deleteUser(ownerId)`. Audit `client.delete` with the store list in `details` before deletion.

### 4. Two-factor (TOTP) — Supabase native MFA

- New page `.../super-admin/security/page.tsx`: **Enroll** flow using
  `supabase.auth.mfa.enroll({ factorType: 'totp' })` → show the returned QR (`totp.qr_code`)
  → user enters a code → `mfa.challenge` + `mfa.verify` to activate the factor. Shows
  current factor status; allows unenroll (also stepUp-guarded server-side? — unenroll is a
  Supabase client call by the user themself, acceptable).
- **Enforcement:** `requireSuperAdmin` demands AAL2. The super-admin `layout.tsx` server
  component checks: if the user is a super admin but `getAuthenticatorAssuranceLevel()`
  returns `nextLevel === 'aal2' && currentLevel === 'aal1'`, redirect to a **challenge
  screen** (`/super-admin/security?challenge=1`) that asks for the TOTP code
  (`mfa.challengeAndVerify`) to step up to AAL2 for the session. If the admin has **no**
  factor enrolled yet, send them to the enroll screen first (bootstrapping).
- Because MFA state lives in Supabase (`auth.mfa_factors`), there is **no app schema** for 2FA.

### 5. Step-up re-auth

- Modal in the UI collects the admin's **password** before a destructive action.
- `POST /api/super-admin/step-up` re-verifies it: create a throwaway server client and call
  `signInWithPassword({ email: user.email, password })`; on success, set a **short-lived
  (5 min) httpOnly, signed** cookie `sa_stepup` (value = HMAC of `user.id + expiry` using a
  server secret `SUPERADMIN_STEPUP_SECRET`), and discard the throwaway session so the main
  session is untouched. `requireSuperAdmin({ stepUp: true })` validates this cookie.
- No new stored secret per admin; password is the factor. (A dedicated PIN was considered
  and rejected in favor of password re-entry — one less secret to manage.)

## Data flow (ban a client)

```
Clients page → click Ban → step-up modal (password)
  → POST /api/super-admin/step-up  → sets sa_stepup cookie (5 min)
  → POST /api/super-admin/clients/{ownerId}/ban
      requireSuperAdmin(stepUp:true): session ✓, super_admins ✓, AAL2 ✓, sa_stepup ✓
      → auth.admin.updateUserById(ban_duration) + suspend all owner stores
      → logAdminAction('client.ban', ...)
  → UI reflects banned state
```

## Error handling & edge cases

- **Not enrolled in MFA yet (bootstrap):** the very first time, the super admin has no
  factor — the layout routes them to enroll before the area unlocks. Documented in the runbook.
- **MFA_REQUIRED / STEPUP_REQUIRED:** API returns a typed code; the client shows the
  challenge/step-up modal rather than a generic error.
- **Self-protection:** the API refuses to ban or delete the requesting super admin's own
  account, and refuses to delete an owner who is a super admin.
- **Idempotency / partial failure on delete:** delete stores first (cascade), then the auth
  user; if the auth-user delete fails, the stores are already gone but the audit row
  (written first, with the store list) preserves what happened; surface the error.
- **Never trust the client:** all authorization is re-checked server-side every call;
  the browser only orchestrates modals.
- **Data-safety:** ban is fully reversible; hard-delete is the only destructive path and is
  quadruple-guarded (super-admin + AAL2 + step-up + typed store-name confirmation) + audited.

## Environment variables

- `SUPERADMIN_STEPUP_SECRET` — random secret used to sign the step-up cookie
  (`openssl rand -hex 32`). Add to `env.example`.

## Testing

- Unit (`vitest`): `super-admin.ts` guard — rejects no-session (401), non-admin (403),
  aal1 (403 MFA_REQUIRED), missing step-up cookie when required (403 STEPUP_REQUIRED),
  accepts a valid signed step-up cookie; step-up cookie sign/verify (HMAC, expiry, tamper).
- Unit: audit-log helper writes the expected row shape.
- Manual (runbook): enroll TOTP, log in requiring the code, ban/unban a throwaway test
  owner, hard-delete a throwaway test owner (verify stores + auth user gone + audit rows).

## Out of scope (Spec B, later)

- Usage / revenue / abuse monitoring dashboards.
- Platform API-key health panel (Claude/Gemini/SlickPay/Meta status; masked values).
- Rotating API keys from the UI (not safely possible with env-var keys — stays manual).

## Prerequisites

- An authenticator app (Google Authenticator / Authy) on the owner's phone for TOTP.
- `SUPERADMIN_STEPUP_SECRET` set in the environment.
