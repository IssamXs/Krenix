# SlickPay Online Payment Integration — Design

**Date:** 2026-07-07
**Status:** Approved (pending spec review)
**Author:** Issam + Claude

## Goal

Let customers pay for a Krenix plan (activation or upgrade) and for credit/message
top-ups online with **CIB / Edahabia** cards, and have the plan/credits activate
**automatically** — no manual confirmation by the platform owner. Replace the existing
(unverified, never-live) Chargily integration with **SlickPay**, an Algerian SATIM
aggregator the owner already has an account with.

## Decisions (locked)

1. **Replace** the Chargily provider entirely with SlickPay. Retire the Chargily
   checkout route, webhook route, and `lib/chargily.ts`.
2. **CIB / Edahabia** auto-activate via SlickPay (SATIM). **BaridiMob** stays on the
   existing manual "transfer + upload proof + super-admin confirms" flow — no gateway
   can confirm BaridiMob in real time.
3. **`fees: 0`** — the merchant (Krenix owner) absorbs SlickPay's commission, so the
   client pays the exact advertised plan price. Advertised tier prices stay honest.
4. Scope covers **both** record types the current system already models: `subscription`
   (plan activation/upgrade) and `credit_purchase` (AI-credit / chatbot-message packs).

## What is reused unchanged

- `src/lib/activation.ts` — `activateStorePlan()` and `grantTopup()`. All plan/credit
  granting stays here (service-role only, honors the migration-025 column lock).
- Pending-record tables: `subscriptions` and `credit_purchases`.
- Security invariants: amount computed **server-side** from constants
  (`PLAN_AMOUNTS_DZD`, `CREDIT_PACKS`, `MESSAGE_PACKS`); the client never sends a price.
  Activation runs via the admin client. Confirmation is **idempotent** — only a record
  still in `status = 'pending'` is acted on, so webhook retries + return-route double
  hits cannot double-grant.

## SlickPay API facts (from the production-tested guide)

- **Auth:** `Authorization: Bearer <PUBLIC_KEY>`, `Content-Type: application/json`,
  `Accept: application/json`.
- **Base URL:** sandbox `https://devapi.slick-pay.com/api/v2`, production
  `https://prodapi.slick-pay.com/api/v2`.
- **Accounts:** `GET /users/accounts` → pick the object with `default: 1`; its `uuid`
  is the `account` used on invoices. May be overridden by `SLICKPAY_ACCOUNT_UUID`.
- **Create invoice:** `POST /users/invoices` with:
  - `amount` (numeric, > 100 DZD, required)
  - `items` (array, required) — one item `{ name, price, quantity: 1 }`
  - `account` (uuid; omit to use default)
  - `url` (our return route)
  - `fees: 0` (merchant absorbs commission)
  - `firstname`, `lastname`, `email` (buyer identity — required when no saved `contact`)
  - `webhook_url`, `webhook_signature`, `webhook_meta_data` (optional; enable webhook)
  - **Response:** root **`url`** = the SATIM payment page (redirect the customer here);
    `id` = invoice id (used for status checks).
- **Status:** `GET /users/invoices/{id}` → `completed === 1` means **paid**;
  `completed === 0` means pending or failed (`rejection_reason` explains).
- **Webhook:** SlickPay POSTs the same payload as the status GET to `webhook_url` when
  status changes, echoing `webhook_meta_data`. Authenticity is verified by comparing the
  `webhook_signature` we set against the signature SlickPay sends in a header. (The exact
  header name is not documented — confirm at integration time by logging inbound headers;
  fall back to the status-check if signature can't be verified.)

## Architecture

### New components

1. **`src/lib/slickpay.ts`** — the provider wrapper. One responsibility: talk to SlickPay.
   - `isSlickpayConfigured(): boolean` — true if `SLICKPAY_PUBLIC_KEY` is set.
   - `getDefaultAccountUuid(): Promise<string>` — returns `SLICKPAY_ACCOUNT_UUID` if set,
     else `GET /users/accounts` and pick `default: 1` (cached in-module after first call).
   - `createInvoice(input): Promise<{ paymentUrl: string; invoiceId: number }>` where
     `input = { amountDzd, itemName, buyer: {firstname,lastname,email}, returnUrl,
     webhookUrl?, metadata? }`. POSTs `/users/invoices` with `fees: 0`; returns the root
     `url` and `id`.
   - `getInvoiceStatus(invoiceId): Promise<'paid' | 'pending'>` — GET `/users/invoices/{id}`,
     maps `completed === 1` → `'paid'`.
   - `verifyWebhookSignature(headerValue: string | null): boolean` — timing-safe compare
     against `SLICKPAY_WEBHOOK_SIGNATURE`.
   - Base URL from `SLICKPAY_MODE` (`sandbox` | `live`), defaulting to sandbox.

2. **`src/app/api/payments/slickpay/checkout/route.ts`** — mirrors the current Chargily
   checkout route. `POST { kind: 'plan', plan } | { kind: 'ai_credits'|'chatbot_messages', quantity }`:
   - Auth the user, resolve the account store.
   - Compute amount + build the pending record (`subscriptions` or `credit_purchases`) —
     same server-side constants as today.
   - Build `returnUrl = ${origin}/api/payments/slickpay/return?record_type=<t>&record_id=<id>`.
   - Build `webhookUrl` only when the origin is public HTTPS (skip on localhost) →
     `${origin}/api/webhooks/slickpay`.
   - `createInvoice(...)` with `webhook_meta_data = { record_type, record_id, store_id }`.
   - Persist the returned `invoiceId` into the record's new `provider_ref` column.
   - Return `{ checkoutUrl: paymentUrl }`.

3. **`src/app/api/webhooks/slickpay/route.ts`** — the automatic path.
   - `verifyWebhookSignature(header)`; on failure return 403.
   - Parse payload; if `completed === 1`, read `record_type`/`record_id`/`store_id` from
     `webhook_meta_data` and run the shared confirm-and-activate logic (below).
   - Always return 200 otherwise (avoid retry storms).

4. **`src/app/api/payments/slickpay/return/route.ts`** (GET) — the fallback path for
   when the webhook can't reach us (localhost/dev) or is delayed.
   - Read `record_type` + `record_id` from query; load the record to get `provider_ref`.
   - `getInvoiceStatus(provider_ref)`; if `'paid'`, run the same confirm-and-activate
     logic; redirect the customer to `/dashboard?paid=1` (plan) or
     `/dashboard/billing/credits?paid=1` (top-up), else the matching `?failed=1` page.

5. **Shared confirm-and-activate helper** (small function, colocated in
   `src/lib/activation.ts` or a `src/lib/slickpay-confirm.ts`): given
   `(admin, recordType, recordId, storeId)`, flip the pending record to confirmed
   **only if still pending** and call `activateStorePlan` / `grantTopup`. Both the webhook
   and the return route call this, so they behave identically and can't double-grant.

### Data flow (plan upgrade, happy path)

```
Client clicks "Payer en ligne" on /activate or /dashboard/billing/upgrade
  → POST /api/payments/slickpay/checkout { kind:'plan', plan }
      → insert subscriptions row (status pending)
      → SlickPay POST /users/invoices (fees:0, webhook+return urls)
      → store invoice id in subscriptions.provider_ref
      → return { checkoutUrl }
  → browser redirected to SATIM payment page
  → client pays with CIB/Edahabia
  → (A) SlickPay webhook → /api/webhooks/slickpay → confirm+activate  [primary]
  → (B) SlickPay redirects client → /api/payments/slickpay/return → re-check + activate  [fallback]
  → client lands on /dashboard?paid=1, already upgraded
```

### Database migration

`Database/027_slickpay.sql`:
- `ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS provider_ref TEXT;`
- `ALTER TABLE credit_purchases ADD COLUMN IF NOT EXISTS provider_ref TEXT;`

(Both tables are service-role write already; no RLS change needed.)

### Environment variables

- `SLICKPAY_PUBLIC_KEY` — merchant public key from the SlickPay dashboard.
- `SLICKPAY_MODE` — `sandbox` (default) | `live`.
- `SLICKPAY_WEBHOOK_SIGNATURE` — a random secret we generate; sent on invoice creation
  and compared on inbound webhooks.
- `SLICKPAY_ACCOUNT_UUID` — optional override; else the default account is used.

Add all four to `env.example`. Remove the Chargily vars once the swap is verified.

### UI changes

- Repoint the existing "Payer en ligne" buttons (on `/activate` and the top-up page) from
  the Chargily checkout endpoint to `/api/payments/slickpay/checkout`. The button logic is
  otherwise unchanged (POST, receive `checkoutUrl`, redirect).
- Copy stays: CIB / Edahabia for online, BaridiMob for the manual proof flow.

### Retiring Chargily

Delete `src/lib/chargily.ts`, `src/app/api/payments/chargily/checkout/route.ts`,
`src/app/api/webhooks/chargily/route.ts`, and the Chargily env vars. Keep
`lib/activation.ts` (shared) and the pending-record tables (shared).

## Error handling & edge cases

- **Never trust redirect params** — the return route always re-verifies via the SlickPay
  status API before activating.
- **Webhook unreachable on localhost** — `webhookUrl` is only sent when the origin is
  public HTTPS; in dev the return route (fallback) does the activation.
- **Customer pays but never returns** and webhook is down — the pending record stays
  `pending`; the existing super-admin manual confirm remains as the ultimate safety net.
  A "J'ai payé — vérifier" button (re-checks status for the latest pending record) is a
  nice-to-have but out of scope for v1.
- **Idempotency** — the confirm helper updates `... WHERE status = 'pending'` and only
  grants when that update returns a row; webhook + return can both fire without
  double-granting.
- **Signature header unknown** — if we can't identify/verify the webhook signature header
  in practice, the webhook still triggers a status re-check (defense in depth), so a
  spoofed webhook can't grant anything that SlickPay's own status API doesn't confirm.

## Prerequisites (owner, external)

- A SlickPay **merchant** account approved for **SATIM (CIB/Edahabia)** acceptance.
- The account's **public API key** and its default account `uuid` (from the dashboard).
- Run the migration; set the four env vars; deploy to a public HTTPS URL (or use the
  tunnel) so the webhook can reach the server for live testing.

## Testing

- Unit: `lib/slickpay.ts` — invoice payload shape (`fees: 0`, one item, urls), status
  mapping (`completed` → `paid`), signature compare (timing-safe, rejects mismatch/null).
- Integration (sandbox `devapi`): create invoice → assert `paymentUrl` + `invoiceId`;
  status-check a known invoice.
- Idempotency: two confirm calls for the same record grant exactly once.
- Manual sandbox end-to-end: checkout → SATIM test card → return route activates the plan.

## Out of scope (v1)

- Cron/scheduled reconciliation of stale pending payments (Approach B) — add later if
  drop-off proves to be a problem.
- BaridiMob automation (not possible).
- SlickPay wallet / deeplink payment path (`invoice.deeplink`) — SATIM card only for now.
