# Fraud Shield — Design Spec

Date: 2026-07-30
Status: Approved by user, pending implementation plan

## Background

A friend of the user runs an e-commerce store currently trialing JustSell (an
Algerian competitor to Krenix). His store is being flooded with fake
cash-on-delivery orders by an automated bot: dozens of orders arriving at
suspiciously regular intervals (~2-4 min apart), rotating source IPs (observed
switching from French to Algerian ranges), from a single operator sabotaging
his business. Shopify, YouCan, and prior custom-dev attempts have failed to
stop it.

The plan: build a fraud-detection feature into Krenix as a reason for him to
migrate his store here, gated so it is invisible to every other tenant. If it
proves effective, it may later be offered as an Ultimate-plan-and-above
feature.

## Non-goals / explicit constraints

- **Not a "self-evolving AI vs AI" system.** No system (including this one)
  can guarantee fake orders become impossible. The realistic goal is to stack
  independent signals so bypassing all of them is expensive enough to
  discourage the attacker, and to surface suspicious orders for fast human
  review — not to promise a 100% block rate.
- **No auto-blocking.** Flagged orders are never rejected or hidden
  automatically — false positives on a real customer's order are worse than
  a missed fake one. The store owner always makes the final call.
- **No Telegram/email/SMS alerting.** Dashboard-only; the owner checks the
  Fraud Shield page directly.
- **No paid third-party fraud APIs.** FingerprintJS Pro, Cloudflare Bot
  Management etc. were explicitly ruled out on cost grounds. Only free/open
  building blocks are used: the open-source `fingerprintjs` npm library
  (self-hosted, unlimited, no billing) and Cloudflare Turnstile (free,
  unlimited).
- **Exclusive to one store initially.** Everything is gated behind a single
  per-store flag. It must not affect behavior, schema exposure, or
  performance for any other store.

## Architecture

### 1. Feature flag

New column: `stores.fraud_shield_enabled boolean default false`.

Only settable by super-admin (consistent with the existing
plan/credits column-locking pattern — see migration 025 in prior work).
All client script injection, server-side scoring, and dashboard nav entries
check this flag before activating.

### 2. Client-side signal capture (storefront order form)

Active only when `fraud_shield_enabled` is true for the store being viewed.

- Loads the open-source `fingerprintjs` library and computes a device hash
  (canvas, screen, fonts, timezone, etc. combined into one identifier).
- Records lightweight behavioral signals during the order form session:
  time elapsed between page load and submit, whether any mouse/touch
  movement event fired, and form-fill speed (time between first and last
  field input).
- Cloudflare Turnstile widget is added to the order form as a first line of
  defense. It runs invisibly for most visitors and only presents an
  interactive challenge when it cannot verify automatically.
- All of this — fingerprint hash, behavior signals, Turnstile token — rides
  along with the existing order submission payload to the orders API route.

### 3. Server-side risk scoring (on order creation)

Runs inside the existing order-creation API route, only when the target
store has the flag enabled.

- Verifies the Turnstile token server-side before accepting the order.
- Captures the request IP and checks it against known VPN/datacenter/proxy
  ranges via a free IP-intelligence source.
- Computes a 0–100 risk score from weighted rules combining:
  - Device fingerprint reuse: same fingerprint seen on other orders for this
    store within a recent time window.
  - IP reputation: known proxy/VPN/datacenter range.
  - Timing-interval regularity: abnormally low variance in the
    seconds-between-orders across the store's recent order history (the
    signature observed in the original screenshot).
  - Absent human behavior: no mouse/touch movement recorded and/or
    sub-1.5-second form fill time.
  - IP geolocation mismatch (country ≠ Algeria) — weighted low, since
    legitimate customers using VPNs exist.
- Order is saved through the normal orders flow with three new columns:
  - `fraud_risk_score integer` (0–100)
  - `fraud_signals jsonb` (breakdown of which rules fired and their point
    contribution, for transparency in the dashboard)
  - `fraud_label text` (`pending` / `confirmed_fake` / `confirmed_real`,
    default `pending`)
- No blocking, no hiding — the order proceeds through the normal pipeline
  regardless of score.

### 4. Dashboard — Fraud Shield page

New page, e.g. `/dashboard/fraud-shield`, visible in nav only when the
store's flag is enabled.

- Lists orders sorted/filterable by `fraud_risk_score`, showing the
  `fraud_signals` breakdown per order (which rules fired, in French per the
  project's UI language rules) using the existing Éclat dashboard tokens
  (`dash-*`) and shared UI atoms (Card, StatusBadge, etc.) per the project's
  design system.
- The owner marks each flagged order `confirmed_fake` or `confirmed_real`.
  This is the sole alerting/review mechanism, and doubles as the labeled
  training data for step 5.

### 5. v1 → v2 scoring upgrade path

- **v1 (ships first):** hand-tuned rule weights as listed in section 3.
  Needs no historical data and is fully explainable.
- **Bootstrap data:** the user will provide a Google Sheets export of the
  friend's historical confirmed-fake orders from JustSell (matching the
  pattern in the original screenshot: sequential orders at ~2-4 minute
  intervals). This seeds the `confirmed_fake` label set before Krenix has
  any order history of its own.
- **v2 (after enough labeled data accumulates):** a lightweight model
  (logistic regression or gradient-boosted trees) is trained offline on the
  same engineered features, using labels from the bootstrap export plus
  ongoing dashboard confirmations. Trained weights replace the hand-tuned
  ones via a scheduled retraining script — no standalone ML service is
  introduced; retraining is a periodic job, inference stays inline in the
  existing order-creation route.

### 6. Future extension (not part of this build)

If the feature proves effective for this one store, `fraud_shield_enabled`
could later be auto-derived from plan tier (e.g. Ultimate and above) instead
of being a manually-set super-admin-only flag. This is explicitly a later
decision, not part of the current scope.

## Data model changes

- `stores.fraud_shield_enabled boolean default false` (super-admin writable
  only, following the existing column-locking trigger pattern)
- `orders.fraud_risk_score integer`
- `orders.fraud_signals jsonb`
- `orders.fraud_label text default 'pending'`
- New table for fingerprint/IP history needed for the "reuse across recent
  orders" and "timing regularity across recent orders" checks — exact shape
  to be defined in the implementation plan (must include `store_id` per the
  project's multi-tenancy rule).

## Open items for the implementation plan

- Exact free IP-intelligence source/list to use for VPN/datacenter
  detection.
- Exact shape of the fingerprint/order-history table and retention window
  for the "reuse" and "timing regularity" checks.
- Format the user's Google Sheets export needs to arrive in for the bootstrap
  import (columns available appear limited to timestamps in the screenshot
  shared — needs confirmation of what else is exportable, e.g. phone number,
  product, IP if JustSell exposes it).
- Cloudflare Turnstile site/secret key provisioning (new env vars).
- Retraining job scheduling mechanism for the v2 model swap.
