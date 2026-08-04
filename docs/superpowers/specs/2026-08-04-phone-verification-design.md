# Required + verified phone number at signup

## Goal

Today `/auth/register` collects phone as an **optional** free-text field that
is only ever written into Supabase `user_metadata` — never persisted to a
queryable column, never validated for format, never confirmed as real. This
spec makes phone:

1. **Required** at signup, validated as an Algerian mobile number.
2. **Verified** via a one-time SMS code (Twilio Verify) before the user can
   reach onboarding or the dashboard.

## Non-goals

- Changing/re-verifying phone from dashboard settings later (out of scope;
  can be a follow-up).
- WhatsApp as a channel (SMS-only per decision below).
- Any change to merchant-facing SMS (the existing per-store BYO-Twilio order
  notifications in `lib/twilio.ts` / `sms_integrations` table are untouched —
  this is a *platform-owned* credential, a separate integration).

## Decisions made during brainstorming

- **Channel/provider**: SMS via Twilio Verify API (not raw SMS, not
  WhatsApp). Twilio Verify owns code generation, expiry, and retry-limit
  logic server-side, so we don't hand-roll that.
- **Timing**: verification happens immediately after account creation, before
  onboarding — not folded into the onboarding wizard itself.
- **Strictness**: hard block. Every platform route except `/auth/*`,
  `/api/*`, and `/super-admin/*` is inaccessible until `phone_verified=true`.
  This persists across logins — an abandoned verification is re-prompted on
  next login, not just immediately after signup.
- **Super-admin exemption**: `/super-admin/*` is exempt from the gate so the
  platform owner can never be locked out of admin tools by a Twilio outage or
  misconfiguration.
- **Existing users**: grandfathered in. A missing `phone_verifications` row
  is treated as verified. Only new signups (and anyone who re-registers) go
  through the flow — no surprise interruption for active paying merchants.

## Data model

New migration `database/047_phone_verification.sql`:

```sql
CREATE TABLE IF NOT EXISTS phone_verifications (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone           TEXT NOT NULL,               -- E.164, e.g. +213555123456
  phone_verified  BOOLEAN NOT NULL DEFAULT false,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Users may read their own verification status...
CREATE POLICY "User reads own phone verification" ON phone_verifications
  FOR SELECT USING (auth.uid() = user_id);

-- ...but NO client INSERT/UPDATE/DELETE policy exists. All writes go through
-- server routes using the service-role client. This is deliberate: phone and
-- phone_verified must not be client-settable (a user could otherwise call
-- supabase.auth.updateUser or the client SDK directly to self-mark verified),
-- mirroring the store-column-lockdown pattern in migration 025.
```

Why a dedicated table instead of a `stores` column: verification must
complete *before* a store row exists (a store is only created in onboarding
step 1), and OAuth signups never pass through the register form's phone
field at all — so this has to anchor to the auth user, not the store.

## Registration changes

`src/app/(platform)/auth/register/page.tsx`:
- Remove the "optional" label/hint on the phone field.
- Add client-side validation reusing the existing Algerian mobile regex
  (`/^(0[5-7])\d{8}$/`, already used in `src/app/api/orders/route.ts` and
  `src/app/api/leads/route.ts`) — block submit with a French error if
  invalid, consistent with the existing password/email validation style.
- After `supabase.auth.signUp` succeeds, call
  `POST /api/auth/verify-phone/send` with the phone (creates the
  `phone_verifications` row and triggers the first SMS) instead of writing
  phone into `user_metadata`.
- Redirect to `/auth/verify-phone` instead of `/onboarding/step-1`.

## `/auth/verify-phone` page (new)

- **OAuth case**: if the authenticated user has no `phone_verifications` row
  yet (Google signup never collected a phone), show a phone-entry field
  first ("Quel est votre numéro ?"), validated with the same regex, before
  proceeding to code entry.
- **Normal case**: show the masked phone (`05 55 •• •• 56`), a 6-digit code
  input, a "Renvoyer le code" button (disabled behind a 60s countdown), and
  a "Modifier le numéro" link to go back and re-enter the phone (re-sends).
- On correct code: redirect to `/onboarding/step-1`.
- On incorrect code: French error message.

## Twilio Verify integration

New `lib/twilio-verify.ts` — **platform-owned** credentials via env vars
(`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`),
entirely separate from the existing per-merchant BYO-key `lib/twilio.ts` /
`sms_integrations` table.

```ts
startVerification(e164Phone: string): Promise<boolean>
// POST https://verify.twilio.com/v2/Services/{SID}/Verifications
// { To: e164Phone, Channel: 'sms' }

checkVerification(e164Phone: string, code: string): Promise<'approved' | 'pending' | 'failed'>
// POST https://verify.twilio.com/v2/Services/{SID}/VerificationCheck
// { To: e164Phone, Code: code }
```

Phone is converted from the domestic `0X XX XX XX XX` form to E.164 before
being sent to Twilio (`0555123456` → `+213555123456`) via a small helper,
e.g. `toE164Algeria(phone: string): string`.

## API routes (new)

- **`POST /api/auth/verify-phone/send`**
  - Requires an authenticated Supabase session.
  - Body: `{ phone }` (only needed/used the first time — the OAuth
    phone-entry case; subsequent resends use the phone already on file).
  - Validates Algerian format server-side (never trust client validation
    alone).
  - Rate-limited via the existing `checkRateLimit` helper:
    `verify-phone:send:user:<id>` (3 sends / 10 min) and a per-IP cap,
    matching the pattern already used in `src/app/api/auth/throttle/route.ts`.
  - Upserts the `phone_verifications` row (service-role/admin client) with
    the phone and `phone_verified=false`, then calls `startVerification`.

- **`POST /api/auth/verify-phone/check`**
  - Requires an authenticated Supabase session.
  - Body: `{ code }`.
  - Rate-limited on attempts: `verify-phone:check:user:<id>` (5 tries / 10
    min).
  - Calls `checkVerification`; on `approved`, updates the row (service-role
    client) with `phone_verified=true, verified_at=NOW()`.

## Middleware gate

`middleware.ts` → `handlePlatformAuth`: immediately after the existing
"not logged in → redirect to login" check, and before the super-admin /
onboarding checks:

```ts
if (!pathname.startsWith('/super-admin')) {
  const { data: verification } = await supabase
    .from('phone_verifications')
    .select('phone_verified')
    .eq('user_id', user.id)
    .maybeSingle()

  // No row = grandfathered existing user = treated as verified.
  if (verification && !verification.phone_verified && pathname !== '/auth/verify-phone') {
    return NextResponse.redirect(new URL('/auth/verify-phone', request.url))
  }
}
```

`/auth/verify-phone` itself must be added to `PUBLIC_ROUTES`'s auth-prefix
allowance (it already matches `pathname.startsWith('/auth/')`, so no change
needed there — just confirmed during implementation) but still requires a
logged-in user (it's not in the public route list, so the existing
"not logged in" check above still protects it).

## Rate limiting summary

Reuses the existing `lib/rate-limit.ts` → `checkRateLimit(key, limit, windowSeconds)`
pattern already used by `/api/auth/throttle`:
- Send: 3 / 10 min per user, plus per-IP.
- Check: 5 / 10 min per user.

## Environment variables

New platform-level vars (document in a new `.env.example`, since none
currently exists in the repo):
```
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=
```

## Testing plan

- Unit: `toE164Algeria`, Algerian phone regex edge cases (valid `05/06/07`
  prefixes, invalid lengths/prefixes).
- Manual: full register → verify-phone → onboarding flow with a real Twilio
  Verify sandbox number; OAuth signup → phone-entry → verify flow; resend
  cooldown behavior; wrong-code error path; middleware redirect for an
  unverified user hitting `/dashboard` directly by URL; grandfathered
  existing user (no row) reaching `/dashboard` without interruption.
