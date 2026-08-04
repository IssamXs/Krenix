# Required + verified phone number at signup

## Goal

Today `/auth/register` collects phone as an **optional** free-text field that
is only ever written into Supabase `user_metadata` — never persisted to a
queryable column, never validated for format, never confirmed as real. This
spec makes phone:

1. **Required** at signup, validated as an Algerian mobile number.
2. **Verified** via a one-time code delivered through Telegram before the
   user can reach onboarding or the dashboard.

## Non-goals

- Changing/re-verifying phone from dashboard settings later (out of scope;
  can be a follow-up).
- SMS or WhatsApp as a channel — Telegram-only per decision below (see Risk
  accepted).
- Any change to merchant-facing SMS (the existing per-store BYO-Twilio order
  notifications in `lib/twilio.ts` / `sms_integrations` table are untouched —
  unrelated system, not used here).
- A super-admin visit/login/funnel tracker — raised in the same conversation
  as this feature, but it's an independent subsystem (analytics data model +
  dashboard UI) and gets its own separate design spec.

## Decisions made during brainstorming

- **Channel/provider**: [Telegram Gateway](https://core.telegram.org/gateway)
  — Telegram's official verification-code API (not a custom bot, not the
  Bot API). $0.01 per successfully delivered code; `checkSendAbility` lets
  us detect up-front, for free, whether a number is reachable on Telegram at
  all before attempting to charge for a send.
- **No SMS fallback**: numbers not registered on Telegram cannot verify.
  Twilio SMS was considered and explicitly rejected — Twilio's Algeria SMS
  rate is ~$0.273/message + $0.05 Verify fee (~$0.32/verification vs.
  Telegram's $0.01), and the owner does not want that cost. **Risk accepted**:
  since verification is a hard block with no bypass, a merchant whose phone
  isn't on Telegram cannot complete signup at all. The owner's judgment is
  that most of the target market (Algerian e-commerce sellers/dropshippers)
  already has Telegram, and the on-page advisory (below) is the mitigation
  for the rest — no server-side fallback channel is being built.
- **Cost tolerance**: $0.01/signup was judged negligible against
  3,000–9,000+ DZD/month plan prices — no spend cap/budget alert needed.
- **"Install Telegram" advisory placement**: Telegram's verification
  message is a fixed system template — it cannot carry custom marketing
  copy, so any pitch for installing Telegram has to live on Krenix's own
  site. It's shown **only when `checkSendAbility` reports the number can't
  receive Telegram messages** — not shown upfront to everyone, so users who
  already have Telegram see zero extra friction.
- **Timing**: verification happens immediately after account creation,
  before onboarding — not folded into the onboarding wizard itself.
- **Strictness**: hard block. Every platform route except `/auth/*`,
  `/api/*`, and `/super-admin/*` is inaccessible until `phone_verified=true`.
  This persists across logins — an abandoned verification is re-prompted on
  next login, not just immediately after signup.
- **Super-admin exemption**: `/super-admin/*` is exempt from the gate so the
  platform owner can never be locked out of admin tools by a Telegram Gateway
  outage or misconfiguration.
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
  telegram_request_id TEXT,                    -- last Gateway request_id, for checkVerificationStatus
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
  `phone_verifications` row and triggers the first Telegram code) instead of
  writing phone into `user_metadata`.
- Redirect to `/auth/verify-phone` instead of `/onboarding/step-1`.

## `/auth/verify-phone` page (new)

- **OAuth case**: if the authenticated user has no `phone_verifications` row
  yet (Google signup never collected a phone), show a phone-entry field
  first ("Quel est votre numéro ?"), validated with the same regex, before
  proceeding to code entry.
- **Normal / deliverable case**: show the masked phone (`05 55 •• •• 56`), a
  code input (length matches Gateway's `code_length` response, default 6), a
  "Renvoyer le code" button (disabled behind a 60s countdown), and a
  "Modifier le numéro" link to go back and re-enter the phone (re-sends).
- On correct code: redirect to `/onboarding/step-1`.
- On incorrect code: French error message.
- **Undeliverable case** (`checkSendAbility` reports the number isn't on
  Telegram): instead of a code screen, show the install-Telegram advisory:

  > **Vérifiez votre compte avec Telegram**
  > Nous n'avons pas trouvé Telegram sur ce numéro. Installez l'application
  > (c'est gratuit et ça prend 30 secondes) pour vérifier votre compte — et
  > rejoignez en même temps notre communauté Krenix : support réactif,
  > astuces e-commerce, et les nouveautés de la plateforme en premier.
  >
  > [Installer Telegram] [Rejoindre la communauté Krenix →]
  > [J'ai installé Telegram, réessayer]

  Copy is a first draft — refine wording/CTA links (App/Play Store links,
  community channel URL) during implementation review.

## Telegram Gateway integration

New `lib/telegram-gateway.ts` — platform-owned credentials via one env var
(`TELEGRAM_GATEWAY_TOKEN`, from https://gateway.telegram.org/), calling
`https://gatewayapi.telegram.org/METHOD_NAME` with
`Authorization: Bearer <token>`.

```ts
checkSendAbility(e164Phone: string): Promise<{ deliverable: boolean; requestId?: string }>
// POST checkSendAbility { phone_number }
// Free. deliverable=false → number not reachable on Telegram.

sendVerificationMessage(e164Phone: string, requestId?: string): Promise<{ requestId: string; codeLength: number }>
// POST sendVerificationMessage { phone_number, request_id?, code_length: 6, ttl: 600 }
// Passing the request_id from checkSendAbility makes this call free (already
// known-deliverable); ttl=600s means Telegram auto-refunds if undelivered
// within 10 minutes.

checkVerificationStatus(requestId: string, code: string): Promise<'code_valid' | 'code_invalid' | 'expired'>
// POST checkVerificationStatus { request_id, code }
```

Phone is converted from the domestic `0X XX XX XX XX` form to E.164 before
calling Telegram (`0555123456` → `+213555123456`) via a small helper, e.g.
`toE164Algeria(phone: string): string`.

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
    the phone and `phone_verified=false`.
  - Calls `checkSendAbility` first. If not deliverable, returns
    `{ deliverable: false }` (client shows the install-Telegram advisory,
    nothing charged). If deliverable, calls `sendVerificationMessage`,
    stores `telegram_request_id`, returns `{ deliverable: true, codeLength }`.

- **`POST /api/auth/verify-phone/check`**
  - Requires an authenticated Supabase session.
  - Body: `{ code }`.
  - Rate-limited on attempts: `verify-phone:check:user:<id>` (5 tries / 10
    min).
  - Calls `checkVerificationStatus` with the stored `telegram_request_id`;
    on `code_valid`, updates the row (service-role client) with
    `phone_verified=true, verified_at=NOW()`.

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

New platform-level var (document in a new `.env.example`, since none
currently exists in the repo):
```
TELEGRAM_GATEWAY_TOKEN=
```

## Testing plan

- Unit: `toE164Algeria`, Algerian phone regex edge cases (valid `05/06/07`
  prefixes, invalid lengths/prefixes).
- Manual: full register → verify-phone → onboarding flow with a real
  Telegram-registered test number; OAuth signup → phone-entry → verify flow;
  resend cooldown behavior; wrong-code error path; a number NOT on Telegram
  → install-Telegram advisory shown, no charge incurred; middleware redirect
  for an unverified user hitting `/dashboard` directly by URL; grandfathered
  existing user (no row) reaching `/dashboard` without interruption.
