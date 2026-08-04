# Required + Verified Phone Number (Telegram Gateway) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make phone required at Krenix signup and verify it with a one-time code delivered via the official Telegram Gateway API before the user can reach onboarding or the dashboard.

**Architecture:** A new `phone_verifications` table (server-write-only via RLS) tracks phone + verification status per auth user, independent of the `stores` table (which doesn't exist yet at signup time). Two new API routes (`/api/auth/verify-phone/send`, `/api/auth/verify-phone/check`) wrap the Telegram Gateway REST API. A new `/auth/verify-phone` page collects/confirms the code. `middleware.ts` gates every platform route (except `/super-admin/*`, which is already exempt from the routing branch that runs this check, and `/auth/*`, which is already public) behind `phone_verified`.

**Tech Stack:** Next.js 14 App Router, TypeScript, Supabase (Postgres + RLS), Telegram Gateway API (`gatewayapi.telegram.org`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-04-phone-verification-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `database/047_phone_verification.sql` | New `phone_verifications` table + RLS |
| `src/lib/phone.ts` | Algerian phone validation + E.164 conversion (pure) |
| `src/lib/phone.test.ts` | Tests for the above |
| `src/lib/telegram-gateway.ts` | Thin wrapper around the 3 Telegram Gateway endpoints used |
| `src/lib/telegram-gateway.test.ts` | Tests for the above |
| `src/lib/i18n/dictionaries/fr.ts`, `ar.ts`, `types.ts` | New `auth.verifyPhone.*` strings + `auth.register.phoneInvalid`; remove unused `phoneOptional` |
| `env.example` | New `TELEGRAM_GATEWAY_API_TOKEN` var |
| `src/app/api/auth/verify-phone/send/route.ts` | Upserts the verification row, calls Gateway `checkSendAbility` + `sendVerificationMessage` |
| `src/app/api/auth/verify-phone/send/route.test.ts` | Tests for the above |
| `src/app/api/auth/verify-phone/check/route.ts` | Calls Gateway `checkVerificationStatus`, flips `phone_verified` |
| `src/app/api/auth/verify-phone/check/route.test.ts` | Tests for the above |
| `src/app/(platform)/auth/register/page.tsx` | Phone becomes required + validated; redirects to `/auth/verify-phone` |
| `src/app/(platform)/auth/verify-phone/page.tsx` | New page: phone entry (OAuth case) → code entry → install-Telegram advisory |
| `middleware.ts` | New phone-verification gate in `handlePlatformAuth` |

---

### Task 1: Database migration

**Files:**
- Create: `database/047_phone_verification.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Migration: Required + Telegram-verified phone number at signup
-- New table, not a stores column: verification must complete before a store
-- row exists (created only at onboarding step 1), and OAuth signups never
-- pass through the register form's phone field at all — so this anchors to
-- the auth user, not the store.
CREATE TABLE IF NOT EXISTS phone_verifications (
  user_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone                TEXT NOT NULL,               -- E.164, e.g. +213555123456
  phone_verified       BOOLEAN NOT NULL DEFAULT false,
  verified_at          TIMESTAMPTZ,
  telegram_request_id  TEXT,                        -- last Gateway request_id, for checkVerificationStatus
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE phone_verifications ENABLE ROW LEVEL SECURITY;

-- Users may read their own verification status. Deliberately NO
-- INSERT/UPDATE/DELETE policy for anon/authenticated roles — every write
-- goes through server API routes on the service-role client (which bypasses
-- RLS entirely). phone_verified must never be client-settable, mirroring
-- the store-column lockdown in migration 025.
DROP POLICY IF EXISTS "User reads own phone verification" ON phone_verifications;
CREATE POLICY "User reads own phone verification" ON phone_verifications
  FOR SELECT USING (auth.uid() = user_id);
```

- [ ] **Step 2: Deliver the SQL to the user for manual execution**

Krenix migrations are run manually by the owner pasting SQL into the
Supabase SQL Editor (established project pattern — see `database/RUN_PENDING.sql`).
When this task is executed, paste the full SQL from Step 1 directly into the
chat response (not just a reference to the file path) so the user can copy
it straight into Supabase.

- [ ] **Step 3: Commit**

```bash
git add database/047_phone_verification.sql
git commit -m "feat: add phone_verifications table for Telegram-verified signup"
```

---

### Task 2: Algerian phone validation helper

**Files:**
- Create: `src/lib/phone.ts`
- Test: `src/lib/phone.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { isValidAlgerianPhone, toE164Algeria } from './phone'

describe('isValidAlgerianPhone', () => {
  it('accepts valid 05/06/07 numbers', () => {
    expect(isValidAlgerianPhone('0555123456')).toBe(true)
    expect(isValidAlgerianPhone('0655123456')).toBe(true)
    expect(isValidAlgerianPhone('0755123456')).toBe(true)
  })

  it('accepts numbers written with spaces', () => {
    expect(isValidAlgerianPhone('05 55 12 34 56')).toBe(true)
  })

  it('rejects a wrong prefix', () => {
    expect(isValidAlgerianPhone('0855123456')).toBe(false)
    expect(isValidAlgerianPhone('1555123456')).toBe(false)
  })

  it('rejects the wrong length', () => {
    expect(isValidAlgerianPhone('055512345')).toBe(false)
    expect(isValidAlgerianPhone('05551234567')).toBe(false)
  })

  it('rejects non-numeric characters', () => {
    expect(isValidAlgerianPhone('05551234ab')).toBe(false)
  })
})

describe('toE164Algeria', () => {
  it('converts domestic format to E.164', () => {
    expect(toE164Algeria('0555123456')).toBe('+213555123456')
  })

  it('strips spaces before converting', () => {
    expect(toE164Algeria('05 55 12 34 56')).toBe('+213555123456')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/phone.test.ts`
Expected: FAIL — `Cannot find module './phone'`

- [ ] **Step 3: Write the implementation**

```typescript
// Algerian mobile numbers: 05/06/07 followed by 8 digits (10 digits total).
export function isValidAlgerianPhone(phone: string): boolean {
  return /^(0[5-7])\d{8}$/.test(phone.replace(/\s/g, ''))
}

// '0555123456' -> '+213555123456'. Caller must already have validated the
// phone with isValidAlgerianPhone.
export function toE164Algeria(phone: string): string {
  const digits = phone.replace(/\s/g, '')
  return `+213${digits.slice(1)}`
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/phone.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/phone.ts src/lib/phone.test.ts
git commit -m "feat: add Algerian phone validation + E.164 helper"
```

---

### Task 3: Telegram Gateway client

**Files:**
- Create: `src/lib/telegram-gateway.ts`
- Test: `src/lib/telegram-gateway.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { checkSendAbility, sendVerificationMessage, checkVerificationStatus } from './telegram-gateway'

beforeEach(() => {
  process.env.TELEGRAM_GATEWAY_API_TOKEN = 'test-token'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('checkSendAbility', () => {
  it('reports deliverable and returns the request id on ok:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { request_id: 'req-1', phone_number: '+213555123456' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkSendAbility('+213555123456')

    expect(result).toEqual({ deliverable: true, requestId: 'req-1' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gatewayapi.telegram.org/checkSendAbility')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(opts.body)).toEqual({ phone_number: '+213555123456' })
  })

  it('reports not deliverable on ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'PHONE_NUMBER_INVALID' }),
    }))

    expect(await checkSendAbility('+213000000000')).toEqual({ deliverable: false })
  })
})

describe('sendVerificationMessage', () => {
  it('sends the request_id from checkSendAbility to make the call free', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: { request_id: 'req-2', phone_number: '+213555123456', verification_status: { status: 'code_sent', code_length: 6 } },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendVerificationMessage('+213555123456', 'req-1')

    expect(result).toEqual({ requestId: 'req-2', codeLength: 6 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ phone_number: '+213555123456', code_length: 6, ttl: 600, request_id: 'req-1' })
  })

  it('omits request_id when none was given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { request_id: 'req-3', phone_number: 'x' } }),
    }))

    await sendVerificationMessage('+213555123456')

    const fetchMock = vi.mocked(fetch)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('request_id')
  })

  it('returns null on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'nope' }) }))
    expect(await sendVerificationMessage('+213555123456')).toBeNull()
  })
})

describe('checkVerificationStatus', () => {
  it('returns code_valid on a matching code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'code_valid' } } }),
    }))
    expect(await checkVerificationStatus('req-1', '123456')).toBe('code_valid')
  })

  it('returns expired when Telegram reports expiry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'expired' } } }),
    }))
    expect(await checkVerificationStatus('req-1', '123456')).toBe('expired')
  })

  it('returns code_invalid on a wrong code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'code_invalid' } } }),
    }))
    expect(await checkVerificationStatus('req-1', '000000')).toBe('code_invalid')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/telegram-gateway.test.ts`
Expected: FAIL — `Cannot find module './telegram-gateway'`

- [ ] **Step 3: Write the implementation**

```typescript
// ============================================================
// Telegram Gateway — official verification-code API (core.telegram.org/gateway),
// NOT the Telegram Bot API. Platform-owned: one shared
// TELEGRAM_GATEWAY_API_TOKEN, distinct from the existing TELEGRAM_BOT_TOKEN
// (that one is an admin-notifications bot, unrelated).
// ============================================================

const BASE_URL = 'https://gatewayapi.telegram.org'

interface GatewayResponse {
  ok: boolean
  result?: {
    request_id: string
    phone_number: string
    request_cost?: number
    delivery_status?: { status: string }
    verification_status?: { status: string; code_length?: number }
  }
  error?: string
}

async function callGateway(method: string, body: Record<string, unknown>): Promise<GatewayResponse> {
  const token = process.env.TELEGRAM_GATEWAY_API_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_GATEWAY_API_TOKEN not configured' }

  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// Free call. Tells us up-front whether `e164Phone` can receive a Telegram
// verification message, without charging anything.
export async function checkSendAbility(e164Phone: string): Promise<{ deliverable: boolean; requestId?: string }> {
  const data = await callGateway('checkSendAbility', { phone_number: e164Phone })
  if (!data.ok || !data.result) return { deliverable: false }
  return { deliverable: true, requestId: data.result.request_id }
}

// Sends the code. Pass the request_id from checkSendAbility to make this
// call free (already known-deliverable). ttl=600s: Telegram auto-refunds
// the fee if the code isn't delivered within 10 minutes.
export async function sendVerificationMessage(
  e164Phone: string,
  requestId?: string
): Promise<{ requestId: string; codeLength: number } | null> {
  const body: Record<string, unknown> = { phone_number: e164Phone, code_length: 6, ttl: 600 }
  if (requestId) body.request_id = requestId

  const data = await callGateway('sendVerificationMessage', body)
  if (!data.ok || !data.result) return null
  return {
    requestId: data.result.request_id,
    codeLength: data.result.verification_status?.code_length ?? 6,
  }
}

export type VerificationCheckResult = 'code_valid' | 'code_invalid' | 'expired'

export async function checkVerificationStatus(requestId: string, code: string): Promise<VerificationCheckResult> {
  const data = await callGateway('checkVerificationStatus', { request_id: requestId, code })
  const status = data.result?.verification_status?.status
  if (status === 'code_valid') return 'code_valid'
  if (status === 'expired' || status === 'code_max_attempts_exceeded') return 'expired'
  return 'code_invalid'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/telegram-gateway.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram-gateway.ts src/lib/telegram-gateway.test.ts
git commit -m "feat: add Telegram Gateway API client"
```

---

### Task 4: Environment variable

**Files:**
- Modify: `env.example:96-98`

- [ ] **Step 1: Add the new var after the existing Telegram admin-notifications block**

Find this block in `env.example`:

```
# ============================================================
# TELEGRAM (admin notifications) — optional feature. Message @BotFather for
# the token, message your bot once then check
# https://api.telegram.org/bot<token>/getUpdates for your numeric chat id.
# ============================================================
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=
```

Replace it with:

```
# ============================================================
# TELEGRAM (admin notifications) — optional feature. Message @BotFather for
# the token, message your bot once then check
# https://api.telegram.org/bot<token>/getUpdates for your numeric chat id.
# ============================================================
TELEGRAM_BOT_TOKEN=
TELEGRAM_ADMIN_CHAT_ID=

# ============================================================
# TELEGRAM GATEWAY (phone verification at signup) — distinct from the admin
# bot above. Create an account and get your token at
# https://gateway.telegram.org/
# ============================================================
TELEGRAM_GATEWAY_API_TOKEN=
```

- [ ] **Step 2: Commit**

```bash
git add env.example
git commit -m "docs: document TELEGRAM_GATEWAY_API_TOKEN env var"
```

---

### Task 5: i18n strings

**Files:**
- Modify: `src/lib/i18n/dictionaries/fr.ts`
- Modify: `src/lib/i18n/dictionaries/ar.ts`
- Modify: `src/lib/i18n/dictionaries/types.ts`

- [ ] **Step 1: Update `fr.ts`**

Find the `register` block (and the closing of the `auth` object right after it):

```typescript
    register: {
      title: 'Créez votre boutique',
      subtitle: "Lancez votre e-commerce en quelques minutes",
      benefit1: 'Configuration en 5 min',
      benefit2: 'Boutique en ligne',
      benefit3: 'IA intégrée',
      email: 'Adresse e-mail',
      phone: 'Téléphone',
      phoneOptional: '(optionnel)',
      phoneHint: "Pour être notifié dès l'activation de votre boutique.",
      password: 'Mot de passe',
      passwordHint: 'Minimum 8 caractères',
      confirmPassword: 'Confirmer le mot de passe',
      createAccount: 'Créer mon compte',
      orSignUpWith: "ou s'inscrire avec",
      alreadyHaveAccount: 'Déjà un compte ?',
      signIn: 'Se connecter',
      checkEmail: 'Vérifiez vos emails',
      confirmationSentTo: 'Un lien de confirmation a été envoyé à',
      confirmationInstructions: "Cliquez sur le lien dans l'email pour activer votre compte et accéder à votre tableau de bord.",
      backToLogin: 'Retour à la connexion',
    },
  },
```

Replace with:

```typescript
    register: {
      title: 'Créez votre boutique',
      subtitle: "Lancez votre e-commerce en quelques minutes",
      benefit1: 'Configuration en 5 min',
      benefit2: 'Boutique en ligne',
      benefit3: 'IA intégrée',
      email: 'Adresse e-mail',
      phone: 'Téléphone',
      phoneHint: "Nous l'utilisons pour vérifier votre compte via Telegram.",
      phoneInvalid: 'Numéro de téléphone invalide (ex : 05 55 12 34 56).',
      password: 'Mot de passe',
      passwordHint: 'Minimum 8 caractères',
      confirmPassword: 'Confirmer le mot de passe',
      createAccount: 'Créer mon compte',
      orSignUpWith: "ou s'inscrire avec",
      alreadyHaveAccount: 'Déjà un compte ?',
      signIn: 'Se connecter',
      checkEmail: 'Vérifiez vos emails',
      confirmationSentTo: 'Un lien de confirmation a été envoyé à',
      confirmationInstructions: "Cliquez sur le lien dans l'email pour activer votre compte et accéder à votre tableau de bord.",
      backToLogin: 'Retour à la connexion',
    },
    verifyPhone: {
      title: 'Vérifiez votre numéro',
      subtitleWithPhone: 'Nous avons envoyé un code de vérification sur Telegram au',
      enterPhoneTitle: 'Quel est votre numéro ?',
      enterPhoneSubtitle: 'Nous vous enverrons un code de vérification via Telegram.',
      phonePlaceholder: '05 55 12 34 56',
      codePlaceholder: '123456',
      verifyButton: 'Vérifier',
      resendButton: 'Renvoyer le code',
      resendCountdown: 'Renvoyer dans {seconds}s',
      editNumber: 'Modifier le numéro',
      wrongCode: 'Code invalide. Réessayez.',
      codeExpired: 'Ce code a expiré. Demandez-en un nouveau.',
      sendError: "Impossible d'envoyer le code pour le moment. Réessayez.",
      noTelegramTitle: 'Vérifiez votre compte avec Telegram',
      noTelegramBody: "Nous n'avons pas trouvé Telegram sur ce numéro. Installez l'application — c'est gratuit et ça prend 30 secondes — pour vérifier votre compte et rejoindre notre communauté Krenix : support réactif, astuces e-commerce, et les nouveautés de la plateforme en avant-première.",
      installTelegram: 'Installer Telegram',
      retryAfterInstall: "J'ai installé Telegram, réessayer",
    },
  },
```

- [ ] **Step 2: Update `ar.ts`**

Find:

```typescript
    register: {
      title: 'أنشئ متجرك',
      subtitle: 'أطلق متجرك الإلكتروني في دقائق معدودة',
      benefit1: 'إعداد خلال 5 دقائق',
      benefit2: 'متجر إلكتروني',
      benefit3: 'ذكاء اصطناعي مدمج',
      email: 'البريد الإلكتروني',
      phone: 'الهاتف',
      phoneOptional: '(اختياري)',
      phoneHint: 'لإعلامك فور تفعيل متجرك.',
      password: 'كلمة المرور',
      passwordHint: '8 أحرف على الأقل',
      confirmPassword: 'تأكيد كلمة المرور',
      createAccount: 'إنشاء حسابي',
      orSignUpWith: 'أو أنشئ حساباً باستخدام',
      alreadyHaveAccount: 'لديك حساب بالفعل؟',
      signIn: 'تسجيل الدخول',
      checkEmail: 'تحقق من بريدك الإلكتروني',
      confirmationSentTo: 'تم إرسال رابط التأكيد إلى',
      confirmationInstructions: 'انقر على الرابط في البريد الإلكتروني لتفعيل حسابك والوصول إلى لوحة التحكم.',
      backToLogin: 'العودة لتسجيل الدخول',
    },
  },
```

Replace with:

```typescript
    register: {
      title: 'أنشئ متجرك',
      subtitle: 'أطلق متجرك الإلكتروني في دقائق معدودة',
      benefit1: 'إعداد خلال 5 دقائق',
      benefit2: 'متجر إلكتروني',
      benefit3: 'ذكاء اصطناعي مدمج',
      email: 'البريد الإلكتروني',
      phone: 'الهاتف',
      phoneHint: 'نستخدمه للتحقق من حسابك عبر تيليجرام.',
      phoneInvalid: 'رقم هاتف غير صالح (مثال: 05 55 12 34 56).',
      password: 'كلمة المرور',
      passwordHint: '8 أحرف على الأقل',
      confirmPassword: 'تأكيد كلمة المرور',
      createAccount: 'إنشاء حسابي',
      orSignUpWith: 'أو أنشئ حساباً باستخدام',
      alreadyHaveAccount: 'لديك حساب بالفعل؟',
      signIn: 'تسجيل الدخول',
      checkEmail: 'تحقق من بريدك الإلكتروني',
      confirmationSentTo: 'تم إرسال رابط التأكيد إلى',
      confirmationInstructions: 'انقر على الرابط في البريد الإلكتروني لتفعيل حسابك والوصول إلى لوحة التحكم.',
      backToLogin: 'العودة لتسجيل الدخول',
    },
    verifyPhone: {
      title: 'تحقق من رقم هاتفك',
      subtitleWithPhone: 'أرسلنا رمز تحقق عبر تيليجرام إلى',
      enterPhoneTitle: 'ما هو رقم هاتفك؟',
      enterPhoneSubtitle: 'سنرسل لك رمز تحقق عبر تيليجرام.',
      phonePlaceholder: '05 55 12 34 56',
      codePlaceholder: '123456',
      verifyButton: 'تحقق',
      resendButton: 'إعادة إرسال الرمز',
      resendCountdown: 'إعادة الإرسال خلال {seconds} ثانية',
      editNumber: 'تعديل الرقم',
      wrongCode: 'رمز غير صحيح. حاول مرة أخرى.',
      codeExpired: 'انتهت صلاحية هذا الرمز. اطلب رمزاً جديداً.',
      sendError: 'تعذر إرسال الرمز حالياً. حاول مرة أخرى.',
      noTelegramTitle: 'تحقق من حسابك عبر تيليجرام',
      noTelegramBody: 'لم نجد تيليجرام على هذا الرقم. ثبّت التطبيق — إنه مجاني ويستغرق 30 ثانية — للتحقق من حسابك والانضمام إلى مجتمع Krenix: دعم سريع، نصائح للتجارة الإلكترونية، وآخر مستجدات المنصة أولاً بأول.',
      installTelegram: 'تثبيت تيليجرام',
      retryAfterInstall: 'ثبّت تيليجرام، إعادة المحاولة',
    },
  },
```

- [ ] **Step 3: Update `types.ts`**

Find:

```typescript
    register: {
      title: string
      subtitle: string
      benefit1: string
      benefit2: string
      benefit3: string
      email: string
      phone: string
      phoneOptional: string
      phoneHint: string
      password: string
      passwordHint: string
      confirmPassword: string
      createAccount: string
      orSignUpWith: string
      alreadyHaveAccount: string
      signIn: string
      checkEmail: string
      confirmationSentTo: string
      confirmationInstructions: string
      backToLogin: string
    }
  }
```

Replace with:

```typescript
    register: {
      title: string
      subtitle: string
      benefit1: string
      benefit2: string
      benefit3: string
      email: string
      phone: string
      phoneHint: string
      phoneInvalid: string
      password: string
      passwordHint: string
      confirmPassword: string
      createAccount: string
      orSignUpWith: string
      alreadyHaveAccount: string
      signIn: string
      checkEmail: string
      confirmationSentTo: string
      confirmationInstructions: string
      backToLogin: string
    }
    verifyPhone: {
      title: string
      subtitleWithPhone: string
      enterPhoneTitle: string
      enterPhoneSubtitle: string
      phonePlaceholder: string
      codePlaceholder: string
      verifyButton: string
      resendButton: string
      resendCountdown: string
      editNumber: string
      wrongCode: string
      codeExpired: string
      sendError: string
      noTelegramTitle: string
      noTelegramBody: string
      installTelegram: string
      retryAfterInstall: string
    }
  }
```

- [ ] **Step 4: Verify the project still type-checks**

Run: `npx tsc --noEmit`
Expected: no new errors (the old `phoneOptional` reference in `register/page.tsx` will be removed in Task 6, so if this task runs first in isolation, a "Property 'phoneOptional' does not exist" error might appear there — that's expected and resolved by Task 6. If running tasks in order there is no intermediate breakage since Task 6 happens right after.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/dictionaries/fr.ts src/lib/i18n/dictionaries/ar.ts src/lib/i18n/dictionaries/types.ts
git commit -m "feat: add verify-phone translations, drop unused phoneOptional key"
```

---

### Task 6: Register page — required + validated phone

**Files:**
- Modify: `src/app/(platform)/auth/register/page.tsx`

- [ ] **Step 1: Add the phone validation import**

Find:

```typescript
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, ArrowRight, Loader2, Check, Mail } from 'lucide-react'
```

Replace with:

```typescript
import { createClient } from '@/lib/supabase/client'
import { isValidAlgerianPhone } from '@/lib/phone'
import { Eye, EyeOff, ArrowRight, Loader2, Check, Mail } from 'lucide-react'
```

- [ ] **Step 2: Require and validate phone before submit**

Find:

```typescript
  const handleRegister = async () => {
    if (!email || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
```

Replace with:

```typescript
  const handleRegister = async () => {
    if (!email || !phone || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs.')
      return
    }
    if (!isValidAlgerianPhone(phone)) {
      setError(t('auth.register.phoneInvalid'))
      return
    }
    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.')
      return
    }
```

- [ ] **Step 3: Stop writing phone into `user_metadata`**

Find:

```typescript
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: phone.trim() ? { phone: phone.trim() } : undefined,
      },
    })
```

Replace with:

```typescript
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
```

- [ ] **Step 4: Redirect to phone verification instead of onboarding**

Find:

```typescript
    // Session exists immediately (email confirmation disabled in Supabase) → go to onboarding
    if (data.session) {
      router.push('/onboarding/step-1')
      return
    }
```

Replace with:

```typescript
    // Session exists immediately (email confirmation disabled in Supabase) → go
    // verify the phone via Telegram before onboarding.
    if (data.session) {
      router.push(`/auth/verify-phone?phone=${encodeURIComponent(phone.trim())}`)
      return
    }
```

- [ ] **Step 5: Remove the "optional" label from the phone field**

Find:

```typescript
            <div>
              <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                {t('auth.register.phone')} <span className="normal-case text-dash-ink-faint">{t('auth.register.phoneOptional')}</span>
              </label>
```

Replace with:

```typescript
            <div>
              <label className="block text-xs font-medium text-dash-ink-soft mb-2 uppercase tracking-wider">
                {t('auth.register.phone')}
              </label>
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add "src/app/(platform)/auth/register/page.tsx"
git commit -m "feat: make phone required + validated at registration"
```

---

### Task 7: `/api/auth/verify-phone/send` route

**Files:**
- Create: `src/app/api/auth/verify-phone/send/route.ts`
- Test: `src/app/api/auth/verify-phone/send/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockUser: { current: { id: string } | null } = { current: { id: 'user-1' } }
let rateLimitOk = true
let sendAbility: { deliverable: boolean; requestId?: string } = { deliverable: true, requestId: 'ra-1' }
let sendResult: { requestId: string; codeLength: number } | null = { requestId: 'vr-1', codeLength: 6 }
const state: { row: Record<string, unknown> | null } = { row: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser.current } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'phone_verifications') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row }) }) }),
        upsert: async (payload: Record<string, unknown>) => {
          state.row = { ...(state.row ?? {}), ...payload }
          return { error: null }
        },
        update: (payload: Record<string, unknown>) => ({
          eq: async () => { state.row = { ...(state.row ?? {}), ...payload }; return { error: null } },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => rateLimitOk,
  requestIp: () => '1.2.3.4',
}))

vi.mock('@/lib/telegram-gateway', () => ({
  checkSendAbility: async () => sendAbility,
  sendVerificationMessage: async () => sendResult,
}))

beforeEach(() => {
  mockUser.current = { id: 'user-1' }
  rateLimitOk = true
  sendAbility = { deliverable: true, requestId: 'ra-1' }
  sendResult = { requestId: 'vr-1', codeLength: 6 }
  state.row = null
})

function callSend(body: unknown) {
  const req = new Request('http://test/api/auth/verify-phone/send', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(req as never)
}

describe('POST /api/auth/verify-phone/send', () => {
  it('rejects an unauthenticated caller', async () => {
    mockUser.current = null
    const res = await callSend({ phone: '0555123456' })
    expect(res.status).toBe(401)
  })

  it('rejects when rate limited', async () => {
    rateLimitOk = false
    const res = await callSend({ phone: '0555123456' })
    expect(res.status).toBe(429)
  })

  it('rejects an invalid Algerian phone format', async () => {
    const res = await callSend({ phone: '12345' })
    expect(res.status).toBe(400)
  })

  it('reports non-deliverable without sending a code — no charge incurred', async () => {
    sendAbility = { deliverable: false }
    const res = await callSend({ phone: '0555123456' })
    const data = await res.json()
    expect(data.deliverable).toBe(false)
    expect(state.row?.phone).toBe('+213555123456')
    expect(state.row?.telegram_request_id).toBeUndefined()
  })

  it('sends a code and stores the Telegram request id on success', async () => {
    const res = await callSend({ phone: '0555123456' })
    const data = await res.json()
    expect(data.deliverable).toBe(true)
    expect(data.codeLength).toBe(6)
    expect(data.phone).toBe('+213555123456')
    expect(state.row?.telegram_request_id).toBe('vr-1')
  })

  it('reuses the stored phone on resend when no phone is given', async () => {
    state.row = { phone: '+213555123456', phone_verified: false }
    const res = await callSend({})
    const data = await res.json()
    expect(data.phone).toBe('+213555123456')
  })

  it('errors when neither a phone is given nor one is on file', async () => {
    const res = await callSend({})
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/auth/verify-phone/send/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { isValidAlgerianPhone, toE164Algeria } from '@/lib/phone'
import { checkSendAbility, sendVerificationMessage } from '@/lib/telegram-gateway'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const ip = requestIp(request)
  const [userOk, ipOk] = await Promise.all([
    checkRateLimit(`verify-phone:send:user:${user.id}`, 3, 600),
    checkRateLimit(`verify-phone:send:ip:${ip}`, 10, 600),
  ])
  if (!userOk || !ipOk) {
    return NextResponse.json({ error: 'Trop de tentatives. Veuillez patienter avant de réessayer.' }, { status: 429 })
  }

  const { phone: bodyPhone } = await request.json().catch(() => ({})) as { phone?: string }
  const admin = createAdminClient()

  let e164: string
  if (bodyPhone?.trim()) {
    const phone = bodyPhone.trim()
    if (!isValidAlgerianPhone(phone)) {
      return NextResponse.json({ error: 'Numéro de téléphone invalide.' }, { status: 400 })
    }
    e164 = toE164Algeria(phone)
  } else {
    const { data: existing } = await admin
      .from('phone_verifications')
      .select('phone')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existing?.phone) {
      return NextResponse.json({ error: 'Numéro de téléphone manquant.' }, { status: 400 })
    }
    e164 = existing.phone as string
  }

  await admin.from('phone_verifications').upsert({
    user_id: user.id,
    phone: e164,
    phone_verified: false,
    updated_at: new Date().toISOString(),
  })

  const ability = await checkSendAbility(e164)
  if (!ability.deliverable) {
    return NextResponse.json({ deliverable: false, phone: e164 })
  }

  const sent = await sendVerificationMessage(e164, ability.requestId)
  if (!sent) {
    return NextResponse.json({ error: "Impossible d'envoyer le code pour le moment. Réessayez." }, { status: 502 })
  }

  await admin.from('phone_verifications').update({
    telegram_request_id: sent.requestId,
    updated_at: new Date().toISOString(),
  }).eq('user_id', user.id)

  return NextResponse.json({ deliverable: true, codeLength: sent.codeLength, phone: e164 })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/auth/verify-phone/send/route.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/verify-phone/send/route.ts src/app/api/auth/verify-phone/send/route.test.ts
git commit -m "feat: add POST /api/auth/verify-phone/send"
```

---

### Task 8: `/api/auth/verify-phone/check` route

**Files:**
- Create: `src/app/api/auth/verify-phone/check/route.ts`
- Test: `src/app/api/auth/verify-phone/check/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockUser: { current: { id: string } | null } = { current: { id: 'user-1' } }
let rateLimitOk = true
let checkResult: 'code_valid' | 'code_invalid' | 'expired' = 'code_valid'
const state: { row: Record<string, unknown> | null } = { row: { telegram_request_id: 'vr-1', phone_verified: false } }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser.current } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'phone_verifications') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => { state.row = { ...(state.row ?? {}), ...payload }; return { error: null } },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => rateLimitOk,
  requestIp: () => '1.2.3.4',
}))

vi.mock('@/lib/telegram-gateway', () => ({
  checkVerificationStatus: async () => checkResult,
}))

beforeEach(() => {
  mockUser.current = { id: 'user-1' }
  rateLimitOk = true
  checkResult = 'code_valid'
  state.row = { telegram_request_id: 'vr-1', phone_verified: false }
})

function callCheck(body: unknown) {
  const req = new Request('http://test/api/auth/verify-phone/check', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(req as never)
}

describe('POST /api/auth/verify-phone/check', () => {
  it('rejects an unauthenticated caller', async () => {
    mockUser.current = null
    const res = await callCheck({ code: '123456' })
    expect(res.status).toBe(401)
  })

  it('rejects when rate limited', async () => {
    rateLimitOk = false
    const res = await callCheck({ code: '123456' })
    expect(res.status).toBe(429)
  })

  it('rejects when there is no verification in progress', async () => {
    state.row = null
    const res = await callCheck({ code: '123456' })
    expect(res.status).toBe(400)
  })

  it('marks phone_verified on a valid code', async () => {
    const res = await callCheck({ code: '123456' })
    const data = await res.json()
    expect(data.status).toBe('code_valid')
    expect(state.row?.phone_verified).toBe(true)
    expect(state.row?.verified_at).toBeTruthy()
  })

  it('does not verify on an invalid code', async () => {
    checkResult = 'code_invalid'
    const res = await callCheck({ code: '000000' })
    const data = await res.json()
    expect(data.status).toBe('code_invalid')
    expect(state.row?.phone_verified).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/app/api/auth/verify-phone/check/route.test.ts`
Expected: FAIL — `Cannot find module './route'`

- [ ] **Step 3: Write the implementation**

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'
import { checkVerificationStatus } from '@/lib/telegram-gateway'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const ip = requestIp(request)
  const [userOk, ipOk] = await Promise.all([
    checkRateLimit(`verify-phone:check:user:${user.id}`, 5, 600),
    checkRateLimit(`verify-phone:check:ip:${ip}`, 20, 600),
  ])
  if (!userOk || !ipOk) {
    return NextResponse.json({ error: 'Trop de tentatives. Veuillez patienter avant de réessayer.' }, { status: 429 })
  }

  const { code } = await request.json().catch(() => ({})) as { code?: string }
  if (!code) {
    return NextResponse.json({ error: 'Code manquant.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: verification } = await admin
    .from('phone_verifications')
    .select('telegram_request_id, phone_verified')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!verification?.telegram_request_id) {
    return NextResponse.json({ error: 'Aucune vérification en cours. Demandez un nouveau code.' }, { status: 400 })
  }

  if (verification.phone_verified) {
    return NextResponse.json({ status: 'code_valid' })
  }

  const status = await checkVerificationStatus(verification.telegram_request_id as string, code)

  if (status === 'code_valid') {
    await admin.from('phone_verifications').update({
      phone_verified: true,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', user.id)
  }

  return NextResponse.json({ status })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/app/api/auth/verify-phone/check/route.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/verify-phone/check/route.ts src/app/api/auth/verify-phone/check/route.test.ts
git commit -m "feat: add POST /api/auth/verify-phone/check"
```

---

### Task 9: `/auth/verify-phone` page

**Files:**
- Create: `src/app/(platform)/auth/verify-phone/page.tsx`

- [ ] **Step 1: Write the page**

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Loader2, ShieldCheck, Send } from 'lucide-react'
import KrenixLogo from '@/components/ui/KrenixLogo'
import BackToHomeLink from '@/components/auth/BackToHomeLink'
import { useI18n } from '@/lib/i18n/LocaleProvider'
import LanguageSwitcher from '@/components/dashboard/ui/LanguageSwitcher'
import { isValidAlgerianPhone } from '@/lib/phone'

const EASE = [0.16, 1, 0.3, 1] as const
const RESEND_COOLDOWN = 60

type Phase = 'enter-phone' | 'code' | 'no-telegram'

// '+213555123456' -> '0555 •• •• 56'
function maskPhone(e164: string): string {
  const local = '0' + e164.slice(4)
  return `${local.slice(0, 4)} •• •• ${local.slice(-2)}`
}

export default function VerifyPhonePage() {
  const { t } = useI18n()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [phase, setPhase] = useState<Phase>('enter-phone')
  const [phoneInput, setPhoneInput] = useState('')
  const [maskedPhone, setMaskedPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  async function sendCode(phone?: string) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-phone/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phone ? { phone } : {}),
      })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('auth.verifyPhone.sendError'))
        setLoading(false)
        return
      }
      setMaskedPhone(maskPhone(data.phone))
      setCooldown(RESEND_COOLDOWN)
      setPhase(data.deliverable ? 'code' : 'no-telegram')
    } catch {
      setError(t('auth.verifyPhone.sendError'))
    }
    setLoading(false)
  }

  useEffect(() => {
    const phoneParam = searchParams.get('phone')
    if (phoneParam) sendCode(phoneParam)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  function submitPhone() {
    if (!isValidAlgerianPhone(phoneInput)) {
      setError(t('auth.register.phoneInvalid'))
      return
    }
    sendCode(phoneInput.trim())
  }

  async function submitCode() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/verify-phone/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      if (res.status === 401) {
        router.push('/auth/login')
        return
      }
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || t('auth.verifyPhone.wrongCode'))
        setLoading(false)
        return
      }
      if (data.status === 'code_valid') {
        router.push('/onboarding/step-1')
        return
      }
      setError(data.status === 'expired' ? t('auth.verifyPhone.codeExpired') : t('auth.verifyPhone.wrongCode'))
    } catch {
      setError(t('auth.verifyPhone.wrongCode'))
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dash-page flex items-center justify-center p-4 relative overflow-hidden dash-font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[620px] h-[420px] rounded-full blur-[130px]" style={{ background: 'var(--color-dash-accent-soft)' }} />
      </div>
      <BackToHomeLink label={t('common.backToHome')} />
      <div className="absolute top-4 end-4 z-10">
        <LanguageSwitcher />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-4">
            <KrenixLogo height={68} compact />
            <span className="font-heading text-[30px] font-extrabold text-dash-ink tracking-tight">Krenix</span>
          </div>
        </div>

        <div className="bg-dash-surface border border-dash-border rounded-[24px] p-8 shadow-[0_24px_60px_-24px_rgba(20,26,33,0.18)]">
          {error && (
            <div className="mb-5 bg-dash-danger-soft border border-dash-danger/20 text-dash-danger text-sm px-4 py-3 rounded-xl">
              {error}
            </div>
          )}

          {phase === 'enter-phone' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <ShieldCheck size={28} className="text-dash-accent mx-auto mb-3" />
                <h1 className="dash-font-heading text-[22px] font-medium text-dash-ink">{t('auth.verifyPhone.enterPhoneTitle')}</h1>
                <p className="text-dash-ink-soft text-sm mt-1">{t('auth.verifyPhone.enterPhoneSubtitle')}</p>
              </div>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitPhone()}
                placeholder={t('auth.verifyPhone.phonePlaceholder')}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-center"
              />
              <motion.button
                whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}
                onClick={submitPhone}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <>{t('auth.verifyPhone.verifyButton')} <Send size={16} /></>}
              </motion.button>
            </div>
          )}

          {phase === 'code' && (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <ShieldCheck size={28} className="text-dash-accent mx-auto mb-3" />
                <h1 className="dash-font-heading text-[22px] font-medium text-dash-ink">{t('auth.verifyPhone.title')}</h1>
                <p className="text-dash-ink-soft text-sm mt-1">
                  {t('auth.verifyPhone.subtitleWithPhone')} <span className="font-semibold text-dash-ink">{maskedPhone}</span>
                </p>
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && submitCode()}
                placeholder={t('auth.verifyPhone.codePlaceholder')}
                className="w-full px-4 py-3 rounded-xl bg-dash-surface-2 border border-dash-border text-dash-ink placeholder-dash-ink-faint outline-none focus:border-dash-accent/50 transition-all text-center text-lg tracking-[0.3em]"
              />
              <motion.button
                whileHover={{ y: -1 }} whileTap={{ scale: 0.99 }}
                onClick={submitCode}
                disabled={loading || code.length === 0}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors disabled:opacity-50"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : t('auth.verifyPhone.verifyButton')}
              </motion.button>
              <div className="flex items-center justify-between text-sm pt-2">
                <button
                  type="button"
                  onClick={() => { setPhase('enter-phone'); setPhoneInput(''); setCode(''); setError('') }}
                  className="text-dash-ink-faint hover:text-dash-ink transition-colors"
                >
                  {t('auth.verifyPhone.editNumber')}
                </button>
                <button
                  type="button"
                  onClick={() => sendCode()}
                  disabled={cooldown > 0 || loading}
                  className="text-dash-accent hover:text-dash-accent-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cooldown > 0 ? t('auth.verifyPhone.resendCountdown', { seconds: cooldown }) : t('auth.verifyPhone.resendButton')}
                </button>
              </div>
            </div>
          )}

          {phase === 'no-telegram' && (
            <div className="text-center space-y-4">
              <ShieldCheck size={28} className="text-dash-accent mx-auto" />
              <h1 className="dash-font-heading text-[22px] font-medium text-dash-ink">{t('auth.verifyPhone.noTelegramTitle')}</h1>
              <p className="text-dash-ink-soft text-sm leading-relaxed">{t('auth.verifyPhone.noTelegramBody')}</p>
              <div className="space-y-2 pt-2">
                <a
                  href="https://telegram.org/dl"
                  target="_blank" rel="noopener noreferrer"
                  className="block w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-dash-accent hover:bg-dash-accent-dark transition-colors"
                >
                  {t('auth.verifyPhone.installTelegram')}
                </a>
                <button
                  type="button"
                  onClick={() => { setPhase('enter-phone'); setError('') }}
                  className="block w-full py-3.5 rounded-xl font-semibold text-sm text-dash-ink border border-dash-border hover:bg-dash-surface-2 transition-all"
                >
                  {t('auth.verifyPhone.retryAfterInstall')}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
```

Note: `maskPhone` assumes a well-formed `+213XXXXXXXXX` input (always true here, since the server only ever returns `e164` values produced by `toE164Algeria`), so no defensive parsing is needed.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add "src/app/(platform)/auth/verify-phone/page.tsx"
git commit -m "feat: add /auth/verify-phone page"
```

---

### Task 10: Middleware gate

**Files:**
- Modify: `middleware.ts:193-202`

- [ ] **Step 1: Insert the phone-verification gate**

Find:

```typescript
  const { data: { user } } = await supabase.auth.getUser()
  
  // Not logged in — redirect to login
  if (!user) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  // Super admin protection
  if (pathname.startsWith('/super-admin')) {
```

Replace with:

```typescript
  const { data: { user } } = await supabase.auth.getUser()
  
  // Not logged in — redirect to login
  if (!user) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Phone verification gate — every platform route except /super-admin/* is
  // blocked until phone_verified=true. (/auth/* itself never reaches this
  // point — it's already returned NextResponse.next() by the isPublicRoute
  // check above.) A missing row means the user signed up before this
  // feature existed and is grandfathered in as verified.
  if (!pathname.startsWith('/super-admin')) {
    const { data: verification } = await supabase
      .from('phone_verifications')
      .select('phone_verified')
      .eq('user_id', user.id)
      .maybeSingle()

    if (verification && !verification.phone_verified) {
      return NextResponse.redirect(new URL('/auth/verify-phone', request.url))
    }
  }
  
  // Super admin protection
  if (pathname.startsWith('/super-admin')) {
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add middleware.ts
git commit -m "feat: gate platform routes on phone verification"
```

---

### Task 11: Full test suite + manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full automated test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `phone.test.ts`, `telegram-gateway.test.ts`, `send/route.test.ts`, `check/route.test.ts`.

- [ ] **Step 2: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual QA checklist (requires `TELEGRAM_GATEWAY_API_TOKEN` set + a real test phone number)**

Using the dev server and a real Telegram-registered Algerian test number:
1. Register with a new email + that phone → redirected to `/auth/verify-phone`, code arrives on Telegram within a few seconds.
2. Enter the wrong code → French error shown, not redirected.
3. Enter the right code → redirected to `/onboarding/step-1`.
4. Try navigating directly to `/dashboard` mid-flow (before verifying) → redirected back to `/auth/verify-phone`.
5. Register with a phone NOT on Telegram (or a fake number) → the "install Telegram" advisory is shown, not a code screen; confirm the Telegram Gateway dashboard shows no charge for that attempt.
6. Click "Renvoyer le code" before the 60s cooldown ends → button stays disabled with the countdown; after it elapses, a second code arrives.
7. Sign up via Google OAuth (no phone collected) → after `/auth/callback`, land on `/auth/verify-phone` in the phone-entry phase; enter a phone → code flow proceeds normally.
8. Log in as an existing pre-migration account (no `phone_verifications` row) → reaches `/dashboard` directly, no verification prompt (grandfathered).
9. Log in to `/super-admin` as the platform owner with an unverified phone (or none at all) → not blocked.

- [ ] **Step 4: Report results to the user**

Summarize pass/fail for each manual QA step above; do not claim the feature is "done" until all 9 steps have been confirmed working against a live Telegram Gateway account.
