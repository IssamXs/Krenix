# Meta (Messenger + Instagram) Chatbot Channel — Design

**Date:** 2026-07-04
**Status:** Approved (design), pending spec review

## Overview

Connect the existing Krenix Gemini chatbot to **Facebook Messenger** and **Instagram Direct**, so a store owner's customers can chat with the same AI assistant from those inboxes and have orders auto-created — exactly as the on-site web widget does today.

Both channels run on Meta's **Messenger Platform** (Instagram DMs are the IG surface of the same webhook + Send API), so they are built as **one integration**.

## Goals

- A store owner on an ULTIMATE-tier plan can connect **their own** Facebook Page and/or Instagram professional account from the dashboard.
- Incoming Messenger / Instagram messages are answered by the same `sendChatbotMessage()` brain, using the store's products, tone, and instructions.
- `ORDER_READY` replies create orders identically to the web widget (`source` reflects the channel).
- The daily message limit is **shared across all channels** (web + Messenger + Instagram) via the existing `chatbot_daily_usage` counter — margin protection is preserved.
- All plan/limit checks happen server-side.

## Non-Goals

- **TikTok.** TikTok exposes no public API to read or auto-reply to DMs for third-party apps. It is explicitly out of scope; TikTok remains a traffic source (ads → landing pages / link in bio).
- **WhatsApp.** Not requested here; the existing free `wa.me` click-to-send order flow is unchanged.
- Building the Meta App itself, Business Verification, or passing App Review — those are external prerequisites (documented, not coded). See "External Prerequisites".

## Architecture

```
Customer (Messenger / IG DM)
        │
        ▼
Meta Messenger Platform  ──webhook POST──►  /api/webhooks/meta
                                                 │  verify X-Hub-Signature-256
                                                 │  resolve store by page_id / ig_id
                                                 ▼
                                        lib/chatbot-core.ts
                                        handleInboundMessage()
                                        (plan gate, daily limit,
                                         sendChatbotMessage, extractOrder,
                                         create order, persist session)
                                                 │  reply text
                                                 ▼
                                        Meta Send API (page token)
                                                 │
                                                 ▼
                                        Customer receives reply

Web widget ──POST──► /api/ai/chatbot ──► lib/chatbot-core.ts (same function)
```

### Design principle: one shared core

The order/limit/session logic currently lives inside `/api/ai/chatbot/route.ts`. It is **extracted** into a single reusable function so every channel behaves identically and there is one place to reason about margin protection.

## Components

### 1. `lib/chatbot-core.ts` (new — refactor)

Single entry point used by both the web route and the Meta webhook.

```
type ChannelSource = 'chatbot' | 'messenger' | 'instagram'

async function handleInboundMessage(args: {
  storeId: string
  sessionKey: string          // 'web:<uuid>' | 'messenger:<PSID>' | 'instagram:<IGSID>'
  text: string
  channel: ChannelSource
  history?: ChatMessage[]      // optional; when omitted, loaded from chatbot_sessions by sessionKey
}): Promise<{ reply: string; orderId: string | null; blocked: boolean }>
```

Responsibilities (moved verbatim from the current route, generalized over `channel`/`sessionKey`):
- Load store (`id, name, plan, chatbot_daily_limit, settings, is_suspended`); bail if suspended.
- Plan gate: `plan === 'ultimate' || chatbot_daily_limit > 0`; respect `settings.chatbot.enabled === false`.
- Daily limit check + increment against `chatbot_daily_usage` (shared counter — same as today).
- Load active in-stock products; call `sendChatbotMessage()`.
- `extractOrder()` → insert order with `source: channel`; persist/update `chatbot_sessions` keyed by `session_id = sessionKey`.
- Return the cleaned reply (ORDER_READY prefix stripped), `orderId`, and a `blocked` flag (limit reached / disabled) so callers can decide whether to still send a polite message.

`/api/ai/chatbot/route.ts` is rewritten to a thin adapter that calls `handleInboundMessage` with `channel: 'chatbot'`, `sessionKey: 'web:<sessionId>'`, and the client-supplied `history`. **Behavior for the web widget is unchanged.**

Session reuse: the existing `chatbot_sessions` table (UNIQUE `store_id, session_id`) is reused as-is; Meta sessions simply use a prefixed `session_id`. Meta conversation history is loaded from this table (Meta does not resend history), so `history` is optional.

### 2. `channel_connections` table (new — migration `015_channel_connections.sql`)

Server-only mapping of a connected Meta asset → store. Never read from the browser.

```
CREATE TABLE channel_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  platform           TEXT NOT NULL,          -- 'messenger' | 'instagram'
  page_id            TEXT,                    -- Facebook Page id (Messenger + IG both hang off a Page)
  ig_id              TEXT,                    -- linked Instagram business account id (nullable)
  page_access_token  TEXT NOT NULL,           -- long-lived page token (see Security)
  page_name          TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page_id),
  UNIQUE(ig_id)
);
CREATE INDEX idx_channel_connections_store ON channel_connections(store_id);
```

RLS (migration adds to `002_rls` pattern): **no client policies** — access is service-role only (API routes). The dashboard reads a redacted view (page name + enabled flag) through a dedicated server route, never the token.

### 3. Connect flow (dashboard)

New "Canaux de messagerie" card on `/dashboard/settings/chatbot` (gated identically to the chatbot — ULTIMATE plans). Locked state for lower tiers shows the standard "Passer à Ultimate" badge.

- **Connect button** → Facebook Login dialog (Meta OAuth) requesting `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`, `business_management`.
- Callback route `/api/channels/meta/connect`:
  1. Exchange the returned user token for a **long-lived** token.
  2. `GET /me/accounts` → list Pages; if one Page, auto-select, else return the list for the owner to pick.
  3. For the chosen Page: store the **page access token**, `page_id`, `page_name`, and (via `GET /{page_id}?fields=instagram_business_account`) the linked `ig_id`.
  4. Subscribe the Page to the app's webhook fields: `POST /{page_id}/subscribed_apps` with `messages, messaging_postbacks` (and IG message fields).
  5. Upsert `channel_connections`.
- **Disconnect** → `DELETE /{page_id}/subscribed_apps` + delete row.
- **Enable/disable toggle** → flips `enabled` without disconnecting.

### 4. `/api/webhooks/meta` (new)

- `GET`: Meta verification handshake — compare `hub.verify_token` to `META_VERIFY_TOKEN`, echo `hub.challenge`.
- `POST`:
  1. **Verify `X-Hub-Signature-256`** = `sha256` HMAC of the raw body with `META_APP_SECRET`. Reject on mismatch.
  2. Parse `entry[].messaging[]` (Messenger) and IG message entries. Ignore echoes, delivery/read receipts, and messages the bot itself sent.
  3. Resolve the store: Messenger event → by `recipient.id` (= `page_id`); Instagram event → by `ig_id`. If no enabled connection, drop.
  4. Call `handleInboundMessage({ channel, sessionKey: '<channel>:<senderId>', text })`.
  5. Send the reply via `POST /me/messages` on the Graph API using the connection's `page_access_token`. Respond `200` quickly to Meta regardless (ack), doing send work within the handler.

### 5. `lib/meta.ts` (new)

Thin Graph API helpers: `exchangeLongLivedToken`, `listPages`, `getLinkedInstagram`, `subscribePage`, `unsubscribePage`, `sendMessage(pageToken, recipientId, text)`, `verifySignature(raw, header)`. Keeps HTTP details isolated from routes.

## Data Flow (inbound message)

1. Customer sends "c'est combien la robe?" on Messenger.
2. Meta POSTs to `/api/webhooks/meta`; signature verified.
3. Store resolved by `page_id`; `enabled` connection found.
4. `handleInboundMessage`: plan OK, under daily limit → history loaded from `chatbot_sessions` (`messenger:<PSID>`) → Gemini answers with product data → session upserted, counter incremented.
5. Reply sent via Send API using the store's page token. If `ORDER_READY` fired, an order (`source: 'messenger'`) was created and appears in the dashboard like any other.

## Feature Gating

- Connect UI + webhook processing require the store to pass the same chatbot gate (`ULTIMATE_PLANS` or `chatbot_daily_limit > 0`). A downgrade below the gate stops processing (polite drop) without deleting the connection row — matching the "freeze, don't delete" rule.
- Daily limit is one shared `chatbot_daily_usage` count across web + Messenger + Instagram.

## Security

- Webhook POSTs are rejected unless `X-Hub-Signature-256` validates against `META_APP_SECRET` (constant-time compare).
- `channel_connections` (incl. `page_access_token`) is service-role only; never queried from the browser, never returned to the client. The dashboard sees only `page_name` + `enabled` via a server route.
- Tokens are long-lived page tokens, **encrypted at rest** with app-level AES-256-GCM using `TOKEN_ENC_KEY` (decrypted only in server routes when calling the Send API). This is layered on top of the service-role-only access, so a DB read alone never yields a usable token.
- No secrets hardcoded — all via env.

## Environment Variables (new)

```
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=          # arbitrary string we choose; entered in Meta webhook config
NEXT_PUBLIC_META_APP_ID=    # for the Facebook Login button
TOKEN_ENC_KEY=             # if app-level token encryption is chosen
```

Added to `.env.example`.

## Error Handling

- Graph API send failures: log, mark nothing fatal to Meta (still 200 the webhook); surface repeated failures on the connection card as "reconnexion requise".
- Expired/invalid page token → connection flagged `enabled=false` with a reconnect prompt.
- Unknown/unmapped page or IG id → silently drop (not our tenant).
- Gemini/order errors reuse the existing web-widget handling (polite fallback message).

## Testing

- **Unit:** `verifySignature` (valid/invalid/missing header); `handleInboundMessage` limit-reached path; session-key routing; order extraction → order insert with correct `source`.
- **Unit:** web adapter still maps to `handleInboundMessage` with unchanged output shape (regression guard for the widget).
- **Integration (dev-mode Meta app):** connect own Page → send a real Messenger message → assert reply delivered + session row + counter increment; repeat for Instagram.
- **Manual:** verification handshake via Meta dashboard.

## External Prerequisites (yours, not code)

Delivered as a short `docs/meta-setup.md` guide:
1. Create a Meta App (type: Business) → add Messenger + Instagram products.
2. Add webhook callback URL (`https://<deployed-domain>/api/webhooks/meta`) + verify token; subscribe to `messages`, `messaging_postbacks`, IG messaging fields.
3. Add yourself as a tester/developer → test in **Development mode** with your own Page/IG (no App Review needed).
4. For public launch: Business Verification + App Review for `pages_messaging` / `instagram_manage_messages`, with a privacy policy URL and a screen recording of the flow.

**Deployment note:** Meta cannot call `localhost`; live testing needs the app deployed to a public HTTPS domain (or a temporary tunnel for dev).

## Build Scope (this project)

In code now: `lib/chatbot-core.ts` (+ web route refactor), migration `015_channel_connections.sql`, `lib/meta.ts`, connect routes, `/api/webhooks/meta`, dashboard "Canaux" card, `.env.example` + `docs/meta-setup.md`. **Not** in code: TikTok, the Meta App/review.
