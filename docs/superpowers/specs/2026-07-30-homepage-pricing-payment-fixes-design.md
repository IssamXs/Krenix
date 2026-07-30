# Homepage/Pricing Polish + Chargily + Payment Telegram Alerts — Design

**Date:** 2026-07-30
**Status:** Approved

## Goal

A batch of visual/behavioral fixes to the homepage and `/pricing`, a second BYO-key
online payment provider (Chargily) for the store-to-customer checkout feature, and
Telegram alerts for platform revenue that currently goes unreported.

## 1. Logo consistency

`src/components/ui/KrenixLogo.tsx` renders the wordmark as a separate blue image
(`krenix-wordmark.png`). The homepage (`src/app/page.tsx`) instead renders "KRENIX" as
plain bold black text next to the same phoenix icon. Every other page (`/pricing`,
dashboard, auth/onboarding, super-admin) uses `KrenixLogo` and therefore shows the
mismatched version — confirmed by the user via the `/pricing` page reached from the
homepage's "sur mesure" link.

**Fix:** change `KrenixLogo.tsx`'s non-compact branch to render the wordmark as text
(`font-heading font-extrabold`, near-black ink color) instead of the
`krenix-wordmark.png` image. One component change fixes every consuming page at once.

## 2. `/pricing` — Ultimate becomes the recommended plan

In `src/app/(platform)/pricing/page.tsx`:
- `STANDARD_PLANS`: move `badge: 'Recommandé'` and `highlight: true` from `pro` to
  `ultimate`. `pro` becomes `badge: null, highlight: false`.
- `SUR_MESURE_PACKAGES`: change `business`'s badge from `'Meilleure valeur'`
  (`isGold: true`) to a plain badge (e.g. `'Populaire'`, `isGold: false`) so it no longer
  visually reads as the top pick.

## 3. Growth becomes self-serve; Business/Agency/Enterprise stay Sur Mesure

Still in `pricing/page.tsx`: the `growth` entry in `SUR_MESURE_PACKAGES` keeps its
current card position, but its action changes from the `handleCommander` → WhatsApp
button to a `Link href="/auth/register"` styled like the standard-plan CTAs (`ArrowRight`
icon, "Choisir Growth" label). `business`, `agency`, `enterprise` keep `handleCommander`
unchanged — that matches the documented Sur Mesure (custom quote, DM negotiation) model
for those three tiers.

## 4. iPhone mockup — realistic proportions

`PhoneScrollMockup` in `src/app/page.tsx` (~line 286) uses `width: 232` with inner
`screenH: 300` — approximately 1.4:1, reading as a stubby box rather than a phone. Real
iPhones run ~19.5:9. Fix: raise `screenH` to ~460 (width unchanged), and scale
`scrollDist` and the notification-row content proportionally so the auto-scroll
animation still looks natural filling the taller frame. Verify visually in the browser
after the change — this is a proportion tweak, not a rewrite.

## 5. Order detail modal — icon/header overlap

Reproduce live first (dashboard → Orders → open a detail modal, including at a narrow
viewport) rather than guessing. The modal (`src/app/(platform)/dashboard/orders/page.tsx`,
~line 440 onward) has a `sticky top-0 z-10` header immediately followed by the timeline's
first status icon (`w-9 h-9 rounded-xl`, `STATUS_ICON.chez_livreur` = `Package`). Diagnose
the actual stacking/spacing cause once reproduced (most likely candidates: insufficient
header height reservation under the sticky positioning, or a z-index/margin collision
introduced by the modal's enter animation) and fix precisely — no guessing at the CSS
before seeing it render.

## 6. Chargily as a second store-level payment provider

Extends the existing store-to-customer BYO-key feature
(`src/app/(platform)/dashboard/integrations/payment/page.tsx`,
`src/app/api/integrations/payment/route.ts`, `payment_integrations` table), which
currently only supports SlickPay.

- **Migration** (new number after 040): widen the `payment_integrations.provider` CHECK
  constraint from `IN ('slickpay')` to `IN ('slickpay', 'chargily')`.
- **`src/lib/chargily.ts`** (new — the old platform-only version was retired; this is a
  fresh BYO-key version modeled exactly on the current `src/lib/slickpay.ts` pattern):
  `isChargilyConfigured()`, `validateChargilyKey(key)` (lightweight auth check against
  Chargily's API), `createCheckout(input)` (accepts an optional per-call `key`, mirroring
  `slickpay.ts`'s `key?` param — omit for none, since Chargily here is always store-owned),
  `verifyChargilySignature(rawBody, signature, key)`, `getCheckoutStatus(id, key)`.
- **`src/app/api/integrations/payment/route.ts`**: accept `provider: 'slickpay' |
  'chargily'` in the POST/PATCH/DELETE bodies (default `'slickpay'` for backward
  compatibility with the existing UI calls); validate/store/toggle per-provider.
- **`dashboard/integrations/payment/page.tsx`**: add a provider picker (radio/segmented
  control) above the connect form. A store may have both providers connected; only one
  is shown live on the storefront (`stores.online_payment_enabled` stays a single
  boolean — the "active" provider is whichever the store toggles on; connecting a second
  provider doesn't affect the currently-live one).
- **`src/app/api/orders/pay/route.ts`, `src/app/api/webhooks/store-payment/route.ts`,
  `src/app/(store)/paiement/retour/page.tsx`**: branch on the store's active provider
  (already read from `payment_integrations`) to call either `lib/slickpay.ts` or the new
  `lib/chargily.ts`.

**Live verification (not a claim without evidence):** using the sandbox/test credentials
already in `.env.local` (`CHARGILY_SECRET_KEY`, `SLICKPAY_PUBLIC_KEY`), connect both
providers to the ZAHRA Beauté demo store's BYO integration and run each through one real
sandbox checkout end-to-end — create invoice/checkout → open the hosted payment page →
confirm the webhook and/or return route correctly marks the order paid. Report exactly
what each API returned; don't mark this item done without having seen it.

## 7. Telegram alert for platform payments received online

The platform-billing SlickPay flow (store owners paying Issam to activate/renew/top-up —
`src/app/api/webhooks/slickpay/route.ts`, `src/app/api/payments/slickpay/return/route.ts`,
`src/lib/activation.ts`'s `confirmAndActivate`) is already fully built on this branch.
Manually-submitted payments already ping Telegram via `/api/notify/admin-event`
(`new_payment`/`new_topup`); automatic online confirmations currently don't.

- New helper, `notifyPlatformPaymentConfirmed(admin, recordType, recordId, storeId)` in
  `src/lib/telegram.ts` (or a thin wrapper colocated with `confirmAndActivate`): fetches
  store name/slug and either `{plan, amount_dzd}` (subscription) or
  `{kind, quantity, amount_dzd}` (credit_purchase), and calls `sendTelegramMessage` with a
  message parallel to the existing manual ones but marked as auto-confirmed (e.g.
  `✅ Paiement en ligne confirmé\n{store} ({slug})\nPlan {X} — {amount} DZD`).
- Call it from both `webhooks/slickpay/route.ts` and `payments/slickpay/return/route.ts`,
  **only when `confirmAndActivate(...)` returns `true`** — this is what makes it safe
  against webhook retries and the webhook/return race (only the call that actually flips
  `pending → confirmed` notifies).
- Scope is platform revenue only (money reaching Issam). Store-to-customer payments via
  the item-6 Chargily/SlickPay storefront feature are the store owner's own revenue and
  are explicitly out of scope for this notification.
- Verify live: trigger a real sandbox SlickPay platform-billing payment and confirm the
  Telegram message actually arrives.

## Out of scope

- Platform-billing support for Chargily (item 6's Chargily is store-level only, per the
  user's explicit choice).
- Any change to the manual/offline (BaridiMob proof upload) confirmation flow — it stays
  exactly as-is.
