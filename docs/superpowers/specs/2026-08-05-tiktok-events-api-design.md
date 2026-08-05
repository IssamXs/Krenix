# TikTok Events API (server-side CAPI) — Design

## Problem

Client reported 120 TikTok ad clicks, 0 attributed TikTok orders, despite 6 real orders
landing in Krenix. Root-caused (see conversation) to 100%-client-side pixel tracking:
`analytics.tiktok.com` is blocked by tracker-blocklists (mobile browsers, Brave, privacy
DNS) at a much higher rate than Meta's `connect.facebook.net`, which explains why Meta
tracking is reportedly fine and TikTok isn't. Per CLAUDE.md, server-side CAPI for
TikTok/Meta is a `GROWTH_PLANS` feature that was never built (confirmed: zero CAPI code
in the repo before this change).

## Scope

- TikTok only (Meta client-side pixel is confirmed working — no evidence it needs this).
- Full event parity with the existing client pixel: `ViewContent`, `InitiateCheckout`,
  `SubmitForm` (lead), `PlaceAnOrder`, `CompletePayment`.
- Gated to `GROWTH_PLANS` (matches CLAUDE.md's existing feature-gate table).
- Dual-fire: server-side calls run *alongside* the existing client `ttq.track()` calls,
  never replacing them, using matching `event_id` values so TikTok deduplicates. This is
  TikTok's own recommended pattern — it maximizes match rate rather than swapping one
  imperfect signal for another.

## Architecture

Two different mechanisms depending on whether the event already has a server round-trip:

| Event(s) | Server-side trigger | Rationale |
|---|---|---|
| `PlaceAnOrder`, `CompletePayment` | Inline in `POST /api/orders` right after the order row is inserted | Order creation is already a mandatory server call — every order that exists in Krenix gets 100% guaranteed server-side firing, no extra network hop the browser could drop |
| `ViewContent`, `InitiateCheckout`, `SubmitForm` | New relay endpoint `POST /api/storefront/event`, called from the client alongside `ttq.track()` | No natural server touchpoint exists for a page view — needs a dedicated call |

**Endpoint naming:** the relay is deliberately named `/api/storefront/event`, not anything
containing "pixel"/"track"/"tiktok" — URL-pattern-based blocklist rules (EasyPrivacy etc.)
block by path substring regardless of domain, which would silently defeat a same-origin
relay if named carelessly.

## Components

1. **`src/lib/tiktok-capi.ts`** (new, server-only)
   - `sendTikTokEvent(input)`: calls `POST https://business-api.tiktok.com/open_api/v1.3/event/track/`
     with header `Access-Token: <store's token>`, body `{ event_source: 'web', event_source_id: pixelCode, data: [{ event, event_id, event_time, user: { ip, user_agent, phone (sha256), email (sha256), ttclid, ttp }, properties: { contents, value, currency } }] }`.
   - Fire-and-forget: wrapped in try/catch, logs failures via `console.error` (never silent —
     silence is exactly what let the original bug hide for weeks) and never throws to the caller.
   - Reads `ttclid` and `_ttp` cookies directly off the incoming `Request` where available
     (both are same-origin since TikTok's own pixel loader sets `_ttp` on our domain).

2. **`src/app/api/orders/route.ts`** (edit)
   - After successful insert: if `store.plan` is in `GROWTH_PLANS` and
     `store.settings.tiktokPixelId` + `store.settings.tiktokAccessToken` are both set, fire
     `PlaceAnOrder` + `CompletePayment` via `sendTikTokEvent`, using event ids
     `${order.id}-place` / `${order.id}-pay` — identical to what the client already sends,
     so TikTok dedupes correctly.
   - Fire-and-forget (`.catch()`'d promise, not awaited into the response).

3. **`src/app/api/storefront/event/route.ts`** (new)
   - `POST`, public (no auth — called from anonymous storefront visitors).
   - Rate-limited via existing `checkRateLimit`/`requestIp` (`src/lib/rate-limit.ts`), e.g.
     60 requests / 10 min per IP — looser than the orders endpoint since ViewContent fires
     more often.
   - Body: `{ store_id, event: 'ViewContent' | 'InitiateCheckout' | 'SubmitForm', event_id, data: { productId?, productName?, price, quantity?, currency }, phone?, email? }`.
   - Validates: store exists, not suspended, `subscription_status === 'active'`, plan in
     `GROWTH_PLANS`, both TikTok credentials present. Any failure → `{ ok: false }` 200
     (never a hard error the client needs to branch on — this call is best-effort).
   - Delegates to `sendTikTokEvent`.

4. **`src/lib/pixel-events.ts`** (edit)
   - `trackViewContent`, `trackInitiateCheckout`, `trackLead` gain a `storeId: string`
     parameter.
   - Each additionally does `fetch('/api/storefront/event', { method: 'POST', keepalive: true, ... })`
     (fire-and-forget, `keepalive` so the request survives page navigation) using the SAME
     `event_id` passed to `ttq.track()`.
   - `trackPurchase` is unchanged — its dedup partner now lives server-side in the orders route.

5. **Call-site updates** (small ripple, 3 files):
   - `src/components/store/ViewContentTracker.tsx` — new `storeId` prop, passed through to `trackViewContent`.
   - `src/app/store/p/[slug]/page.tsx` — passes `store.id` into `<ViewContentTracker>` (store is already loaded there).
   - `src/components/store/OrderFormFields.tsx` — `store.id` already in scope at both `trackInitiateCheckout`/`trackLead` call sites; just thread it through.

6. **Settings UI** — `src/app/(platform)/dashboard/integrations/gtm/page.tsx`
   - Extend the existing TikTok card with a second field, "Access Token" (`tiktokAccessToken`
     in `store.settings`, same save/remove pattern as the existing Pixel ID field).
   - Only rendered/enabled for `GROWTH_PLANS` stores; below-Growth stores see a
     `LockedFeatureCard` (existing shared component, same pattern used for Yalidine/CRM/SMS/etc.)
     in its place.
   - French hint text: where to generate the token in TikTok Ads Manager (Assets → Events →
     Website → select pixel → Generate Access Token).

## Data storage

No migration. `tiktokAccessToken` is a new key in the existing `store.settings` JSONB
column, exactly like `tiktokPixelId` today.

## Error handling

- Every TikTok API call is fire-and-forget and never blocks order creation or page
  rendering.
- Every failure path logs via `console.error` with enough context (store id, event,
  status) to be greppable later — the original bug's root problem was total silence on
  failure, both in `/auth/callback`'s swallowed errors and (by architecture) in
  client-only pixel tracking. Not repeating that pattern here.

## Known open question (not addressed in this build)

TikTok Ads Manager's DZD currency support is unverified — can't confirm without live
account access. Currency handling is unchanged from the existing client pixel (already
shares this risk with the "working" Meta pixel), so it's out of scope here. Flag for the
client to check in Events Manager after testing.

## Testing

Can't hit TikTok's real API without live credentials. Verification covers:
- `/api/storefront/event` validation/rate-limiting/no-op branches (unit-level, mocked store).
- `/api/orders` firing logic gated correctly by plan + credential presence (mocked store).
- Manual browser check: `ttq.track()` and the relay `fetch()` both fire with matching
  `event_id`s on a test landing page.
- Real end-to-end confirmation requires the client to paste in their Access Token and
  check TikTok Events Manager after a test order.
