# Meta (Messenger + Instagram) Chatbot Channel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let ULTIMATE-tier store owners connect their Facebook Page + Instagram account so customers chatting on Messenger/Instagram DM get answered by the same Gemini chatbot, with orders auto-created — reusing one shared core.

**Architecture:** Extract the chatbot order/limit/session logic into `lib/chatbot-core.ts#handleInboundMessage`, used by both the existing web route and a new Meta webhook. Per-store Meta connections (page token, page/IG ids) live in a service-role-only `channel_connections` table with tokens AES-256-GCM encrypted. A single `/api/webhooks/meta` route verifies Meta's signature, resolves the store, calls the core, and replies via the Graph Send API.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (service-role admin client), Gemini (`gemini-2.5-flash-lite`), Meta Graph API v21.0, Node `crypto`. Vitest for pure-logic unit tests.

**Spec:** `docs/superpowers/specs/2026-07-04-meta-messenger-instagram-chatbot-design.md`

---

## Pre-flight notes for the engineer

- **Git:** this repo is **not** under version control yet. Either run `git init` once before starting, or treat every "Commit" step as a checkpoint. Commit messages are given regardless.
- **Verification convention in this project:** there is no pre-existing test runner. The established checks are `npx tsc --noEmit -p tsconfig.json` (must be clean) and `npx eslint <files>` (0 errors; pre-existing `@next/next/no-img-element` warnings are acceptable). Browser-observable changes are verified via the `preview_*` tools against the running dev server on port 3000. This plan adds **vitest** solely for the two security-sensitive pure modules (`lib/crypto.ts`, signature check in `lib/meta.ts`); everything else uses typecheck + lint + dev-mode manual verification, matching the project.
- **The chatbot brain is already channel-agnostic:** `sendChatbotMessage()`, `extractOrder()`, `ORDER_READY_PREFIX` in `src/lib/gemini.ts` are reused unchanged.
- **Existing reference for the logic being extracted:** `src/app/api/ai/chatbot/route.ts` (whole file).

## File Structure

**Create:**
- `src/lib/crypto.ts` — AES-256-GCM `encryptToken`/`decryptToken` for page tokens.
- `src/lib/meta.ts` — Graph API helpers + `verifyMetaSignature`.
- `src/lib/chatbot-core.ts` — `handleInboundMessage()` shared by all channels.
- `Database/015_channel_connections.sql` — new table + RLS + index.
- `src/app/api/channels/meta/connect/route.ts` — OAuth callback: exchange token, list pages, store connection, subscribe webhook.
- `src/app/api/channels/meta/route.ts` — `GET` redacted list for dashboard; `DELETE` disconnect; `PATCH` enable/disable.
- `src/app/api/webhooks/meta/route.ts` — `GET` verify handshake; `POST` inbound handler.
- `src/components/dashboard/MessagingChannels.tsx` — "Canaux de messagerie" card.
- `docs/meta-setup.md` — external setup + App Review guide.
- `vitest.config.ts`, `src/lib/crypto.test.ts`, `src/lib/meta.test.ts`.

**Modify:**
- `src/app/api/ai/chatbot/route.ts` — thin adapter over `handleInboundMessage`.
- `src/types/database.ts` — add `ChannelConnection`, `ChannelPlatform`, `ChannelSource`.
- `src/app/(platform)/dashboard/settings/chatbot/page.tsx` — render `<MessagingChannels>`.
- `.env.example` — new Meta + token-encryption vars.
- `package.json` — `test` script + vitest devDeps.

---

## Task 1: Test harness + token encryption (`lib/crypto.ts`)

**Files:**
- Create: `vitest.config.ts`, `src/lib/crypto.ts`, `src/lib/crypto.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

Run: `npm i -D vitest@^2`
Then add to `package.json` `scripts`: `"test": "vitest run"`.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Write the failing test** — `src/lib/crypto.test.ts`

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken } from './crypto'

beforeAll(() => {
  // 32-byte key, base64
  process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('token crypto', () => {
  it('round-trips a value', () => {
    const secret = 'EAAJpageaccesstoken12345'
    const enc = encryptToken(secret)
    expect(enc).not.toContain(secret)
    expect(decryptToken(enc)).toBe(secret)
  })

  it('produces a different ciphertext each call (random iv)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('rejects tampered ciphertext', () => {
    const enc = encryptToken('hello')
    const parts = enc.split(':')
    parts[2] = Buffer.from('tampered').toString('base64')
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: FAIL — cannot find module `./crypto`.

- [ ] **Step 5: Implement `src/lib/crypto.ts`**

```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

// AES-256-GCM at-rest encryption for third-party tokens (Meta page tokens).
// TOKEN_ENC_KEY must be a base64-encoded 32-byte key.
function key(): Buffer {
  const raw = process.env.TOKEN_ENC_KEY
  if (!raw) throw new Error('TOKEN_ENC_KEY is not set')
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new Error('TOKEN_ENC_KEY must decode to 32 bytes')
  return buf
}

// Format: iv:authTag:ciphertext (each base64).
export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':')
}

export function decryptToken(encoded: string): string {
  const [ivB64, tagB64, dataB64] = encoded.split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Malformed encrypted token')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/crypto.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/lib/crypto.ts src/lib/crypto.test.ts package.json package-lock.json
git commit -m "feat(chatbot): add AES-256-GCM token encryption + vitest harness"
```

---

## Task 2: Meta Graph helpers + signature verification (`lib/meta.ts`)

**Files:**
- Create: `src/lib/meta.ts`, `src/lib/meta.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/meta.test.ts`

```ts
import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyMetaSignature } from './meta'

const SECRET = 'app-secret'
const body = JSON.stringify({ hello: 'world' })
const goodSig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')

describe('verifyMetaSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyMetaSignature(body, goodSig, SECRET)).toBe(true)
  })
  it('rejects a wrong signature', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', SECRET)).toBe(false)
  })
  it('rejects a missing/blank header', () => {
    expect(verifyMetaSignature(body, '', SECRET)).toBe(false)
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false)
  })
  it('rejects a header without the sha256= prefix', () => {
    const raw = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(verifyMetaSignature(body, raw, SECRET)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/meta.test.ts`
Expected: FAIL — cannot find module `./meta`.

- [ ] **Step 3: Implement `src/lib/meta.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto'

const GRAPH = 'https://graph.facebook.com/v21.0'

// ---- Webhook signature (pure, unit-tested) ----
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | undefined | null,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex')
  const got = signatureHeader.slice('sha256='.length)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(got, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---- OAuth / Pages ----
export interface MetaPage {
  id: string
  name: string
  access_token: string
  instagram_business_account?: { id: string }
}

export async function exchangeLongLivedToken(shortToken: string): Promise<string> {
  const url = new URL(`${GRAPH}/oauth/access_token`)
  url.searchParams.set('grant_type', 'fb_exchange_token')
  url.searchParams.set('client_id', process.env.META_APP_ID!)
  url.searchParams.set('client_secret', process.env.META_APP_SECRET!)
  url.searchParams.set('fb_exchange_token', shortToken)
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (!res.ok || !json.access_token) throw new Error(json.error?.message ?? 'Token exchange failed')
  return json.access_token as string
}

export async function listPages(userToken: string): Promise<MetaPage[]> {
  const url = new URL(`${GRAPH}/me/accounts`)
  url.searchParams.set('fields', 'id,name,access_token,instagram_business_account')
  url.searchParams.set('access_token', userToken)
  const res = await fetch(url, { method: 'GET' })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error?.message ?? 'Failed to list pages')
  return (json.data ?? []) as MetaPage[]
}

export async function subscribePage(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`)
  url.searchParams.set('subscribed_fields', 'messages,messaging_postbacks')
  url.searchParams.set('access_token', pageToken)
  const res = await fetch(url, { method: 'POST' })
  const json = await res.json()
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Failed to subscribe page')
}

export async function unsubscribePage(pageId: string, pageToken: string): Promise<void> {
  const url = new URL(`${GRAPH}/${pageId}/subscribed_apps`)
  url.searchParams.set('access_token', pageToken)
  const res = await fetch(url, { method: 'DELETE' })
  // Best-effort: ignore failures on disconnect (token may already be invalid).
  await res.json().catch(() => null)
}

// ---- Send API ----
export async function sendMetaMessage(
  pageToken: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const url = new URL(`${GRAPH}/me/messages`)
  url.searchParams.set('access_token', pageToken)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text },
    }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error?.message ?? `Send failed (${res.status})`)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/meta.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean (no output).

- [ ] **Step 6: Commit**

```bash
git add src/lib/meta.ts src/lib/meta.test.ts
git commit -m "feat(chatbot): add Meta Graph helpers + webhook signature verification"
```

---

## Task 3: Database migration + types

**Files:**
- Create: `Database/015_channel_connections.sql`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Create `Database/015_channel_connections.sql`**

```sql
-- ============================================================
-- CHANNEL CONNECTIONS
-- Per-store Meta (Messenger / Instagram) connection.
-- Service-role only: page_access_token is AES-256-GCM encrypted at the app
-- layer and must never be exposed to the browser.
-- ============================================================
CREATE TABLE IF NOT EXISTS channel_connections (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID REFERENCES stores(id) ON DELETE CASCADE NOT NULL,
  platform           TEXT NOT NULL CHECK (platform IN ('messenger', 'instagram')),
  page_id            TEXT,
  ig_id              TEXT,
  page_access_token  TEXT NOT NULL,
  page_name          TEXT,
  enabled            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_page ON channel_connections(page_id) WHERE page_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_connections_ig   ON channel_connections(ig_id)   WHERE ig_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_channel_connections_store ON channel_connections(store_id);

-- RLS: enabled, but NO policies for anon/authenticated → only the service role
-- (used by API routes) can read/write. Tokens never reach the client.
ALTER TABLE channel_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_channel_connections_updated_at
  BEFORE UPDATE ON channel_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

- [ ] **Step 2: Apply the migration in Supabase**

Run the SQL in the Supabase SQL editor (or `supabase db` if wired). Verify:
`select * from channel_connections;` returns 0 rows with the expected columns.

- [ ] **Step 3: Add types to `src/types/database.ts`**

Append near the other domain types:

```ts
// ============================================================
// MESSAGING CHANNELS
// ============================================================
export type ChannelPlatform = 'messenger' | 'instagram'

// Order `source` values across all chatbot surfaces.
export type ChannelSource = 'chatbot' | 'messenger' | 'instagram'

export interface ChannelConnection {
  id: string
  store_id: string
  platform: ChannelPlatform
  page_id: string | null
  ig_id: string | null
  page_access_token: string // encrypted at rest
  page_name: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add Database/015_channel_connections.sql src/types/database.ts
git commit -m "feat(chatbot): add channel_connections table + types"
```

---

## Task 4: Shared core `handleInboundMessage` + web route refactor

**Files:**
- Create: `src/lib/chatbot-core.ts`
- Modify: `src/app/api/ai/chatbot/route.ts`

This extracts the existing logic verbatim (see `route.ts` lines 13–149) and generalizes it over channel + session key. The web widget's response shape (`{ reply, orderId }`) must not change.

- [ ] **Step 1: Implement `src/lib/chatbot-core.ts`**

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import { sendChatbotMessage, extractOrder, ORDER_READY_PREFIX } from '@/lib/gemini'
import type { ChatMessage, ChannelSource } from '@/types/database'

export interface InboundResult {
  reply: string
  orderId: string | null
  blocked: boolean // limit reached or chatbot disabled: caller may skip sending
}

// One entry point for every chatbot surface (web widget, Messenger, Instagram).
export async function handleInboundMessage(args: {
  storeId: string
  sessionKey: string          // 'web:<uuid>' | 'messenger:<PSID>' | 'instagram:<IGSID>'
  text: string
  channel: ChannelSource
  history?: ChatMessage[]      // when omitted, loaded from chatbot_sessions by sessionKey
}): Promise<InboundResult> {
  const { storeId, sessionKey, text, channel } = args
  const admin = createAdminClient()

  const { data: store } = await admin
    .from('stores')
    .select('id, name, plan, chatbot_daily_limit, settings, is_suspended')
    .eq('id', storeId)
    .single()

  if (!store || store.is_suspended) {
    return { reply: 'Boutique indisponible.', orderId: null, blocked: true }
  }

  const hasChatbot = store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0
  if (!hasChatbot || store.settings?.chatbot?.enabled === false) {
    return {
      reply: 'Le chatbot est momentanément indisponible. Contactez-nous directement. 🙏',
      orderId: null,
      blocked: true,
    }
  }

  // Daily limit (shared across all channels via chatbot_daily_usage)
  const today = new Date().toISOString().slice(0, 10)
  const { data: usage } = await admin
    .from('chatbot_daily_usage')
    .select('id, message_count')
    .eq('store_id', storeId)
    .eq('date', today)
    .single()

  const dailyLimit = store.chatbot_daily_limit > 0 ? store.chatbot_daily_limit : 150
  const currentCount = usage?.message_count ?? 0
  if (currentCount >= dailyLimit) {
    return {
      reply: 'Désolé, la limite de messages quotidiens est atteinte. Revenez demain ou contactez-nous directement. 🙏',
      orderId: null,
      blocked: true,
    }
  }

  // Load history: provided by caller (web) or from the session store (Meta)
  let history: ChatMessage[] = args.history ?? []
  const { data: session } = await admin
    .from('chatbot_sessions')
    .select('id, messages')
    .eq('store_id', storeId)
    .eq('session_id', sessionKey)
    .single()
  if (!args.history && session?.messages) history = session.messages as ChatMessage[]

  const { data: products } = await admin
    .from('products')
    .select('*')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .gt('stock', 0)

  const reply = await sendChatbotMessage({
    storeName: store.name,
    products: products ?? [],
    storeSettings: {
      deliveryPrice: store.settings?.deliveryPrice,
      welcomeMessage: store.settings?.welcomeMessage,
      tone: store.settings?.chatbot?.tone,
      instructions: store.settings?.chatbot?.instructions,
    },
    conversationHistory: history,
    userMessage: text,
  })

  // Increment shared daily counter
  if (usage) {
    await admin.from('chatbot_daily_usage').update({ message_count: currentCount + 1 }).eq('id', usage.id)
  } else {
    await admin.from('chatbot_daily_usage').insert({ store_id: storeId, date: today, message_count: 1 })
  }

  const cleanReply = reply.includes(ORDER_READY_PREFIX)
    ? reply.substring(0, reply.indexOf(ORDER_READY_PREFIX)).trim()
    : reply

  // Persist the turn for every channel (web previously only persisted on order;
  // persisting always is required so Meta history survives across webhook calls).
  const turn: ChatMessage[] = [
    ...history,
    { role: 'user', content: text, timestamp: new Date().toISOString() },
    { role: 'assistant', content: cleanReply, timestamp: new Date().toISOString() },
  ]

  const orderData = extractOrder(reply)
  let orderId: string | null = null

  if (orderData) {
    const deliveryPrice = Number(store.settings?.deliveryPrice ?? 0)
    const total = orderData.unit_price * orderData.quantity + deliveryPrice
    const { data: newOrder } = await admin.from('orders').insert({
      store_id: storeId,
      product_id: orderData.product_id,
      customer_name: orderData.customer_name,
      customer_phone: orderData.customer_phone,
      wilaya: orderData.wilaya,
      commune: orderData.commune,
      quantity: orderData.quantity,
      color: orderData.color ?? null,
      size: orderData.size ?? null,
      unit_price: orderData.unit_price,
      delivery_price: deliveryPrice,
      total_price: total,
      status: 'pending',
      source: channel,
    }).select('id').single()
    orderId = newOrder?.id ?? null
  }

  if (session) {
    await admin.from('chatbot_sessions').update({
      messages: turn,
      ...(orderId ? { order_id: orderId } : {}),
      ...(orderData ? { customer_phone: orderData.customer_phone } : {}),
      updated_at: new Date().toISOString(),
    }).eq('id', session.id)
  } else {
    await admin.from('chatbot_sessions').insert({
      store_id: storeId,
      session_id: sessionKey,
      messages: turn,
      order_id: orderId,
      customer_phone: orderData?.customer_phone ?? null,
    })
  }

  return { reply: cleanReply, orderId, blocked: false }
}
```

- [ ] **Step 2: Refactor `src/app/api/ai/chatbot/route.ts` to the thin adapter**

Replace the entire file with:

```ts
import { NextResponse } from 'next/server'
import { handleInboundMessage } from '@/lib/chatbot-core'
import type { ChatMessage } from '@/types/database'

export async function POST(request: Request) {
  try {
    const { storeId, sessionId, message, history } = await request.json()
    if (!storeId || !sessionId || !message) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 })
    }

    const { reply, orderId } = await handleInboundMessage({
      storeId,
      sessionKey: `web:${sessionId}`,
      text: message,
      channel: 'chatbot',
      history: (history ?? []) as ChatMessage[],
    })

    return NextResponse.json({ reply, orderId })
  } catch (error) {
    console.error('Chatbot error:', error)
    return NextResponse.json({ error: 'Erreur interne' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx eslint "src/lib/chatbot-core.ts" "src/app/api/ai/chatbot/route.ts"`
Expected: clean / 0 errors.

- [ ] **Step 4: Manual regression — web widget unchanged**

With `preview_start` (novalux) running, open a store with an ULTIMATE plan and the chatbot widget, send a message, confirm a reply renders and (if you complete an order) an order appears. This proves the extraction preserved behavior.

> Note: the web widget now persists conversation turns on every message (previously only when an order completed). This is intentional and required for Meta; it also improves web session history. No client change needed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatbot-core.ts src/app/api/ai/chatbot/route.ts
git commit -m "refactor(chatbot): extract handleInboundMessage shared core; web route uses it"
```

---

## Task 5: Meta connect / disconnect routes

**Files:**
- Create: `src/app/api/channels/meta/connect/route.ts`
- Create: `src/app/api/channels/meta/route.ts`

Auth model: these run with the **user** Supabase server client to resolve the caller's store (owner), then use the **admin** client to write `channel_connections`.

- [ ] **Step 1: Implement `src/app/api/channels/meta/connect/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeLongLivedToken, listPages, subscribePage } from '@/lib/meta'
import { encryptToken } from '@/lib/crypto'

// Body: { userToken: string, pageId?: string }
// Step 1 (no pageId): return the caller's pages so the UI can present a picker.
// Step 2 (pageId): store + subscribe the chosen page.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { data: store } = await supabase
      .from('stores')
      .select('id, plan, chatbot_daily_limit')
      .eq('owner_id', user.id)
      .single()
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const hasChatbot = store.plan === 'ultimate' || (store.chatbot_daily_limit ?? 0) > 0
    if (!hasChatbot) return NextResponse.json({ error: 'Réservé au plan Ultimate' }, { status: 403 })

    const { userToken, pageId } = await request.json()
    if (!userToken) return NextResponse.json({ error: 'Token manquant' }, { status: 400 })

    const longToken = await exchangeLongLivedToken(userToken)
    const pages = await listPages(longToken)

    if (!pageId) {
      // Return a minimal picker list (no tokens leak to the client).
      return NextResponse.json({
        pages: pages.map(p => ({ id: p.id, name: p.name, hasInstagram: !!p.instagram_business_account })),
      })
    }

    const page = pages.find(p => p.id === pageId)
    if (!page) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

    await subscribePage(page.id, page.access_token)

    const admin = createAdminClient()
    const encToken = encryptToken(page.access_token)
    const igId = page.instagram_business_account?.id ?? null

    // Upsert a messenger row; if an IG account is linked, upsert an instagram row too.
    const rows = [
      { platform: 'messenger' as const, page_id: page.id, ig_id: null },
      ...(igId ? [{ platform: 'instagram' as const, page_id: page.id, ig_id: igId }] : []),
    ]

    for (const r of rows) {
      // Remove any stale rows for this page then insert fresh (idempotent connect).
      await admin.from('channel_connections')
        .delete()
        .eq('store_id', store.id)
        .eq('platform', r.platform)
      await admin.from('channel_connections').insert({
        store_id: store.id,
        platform: r.platform,
        page_id: r.page_id,
        ig_id: r.ig_id,
        page_access_token: encToken,
        page_name: page.name,
        enabled: true,
      })
    }

    return NextResponse.json({
      connected: true,
      pageName: page.name,
      instagram: !!igId,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur de connexion'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 2: Implement `src/app/api/channels/meta/route.ts`** (list / disconnect / toggle)

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { decryptToken } from '@/lib/crypto'
import { unsubscribePage } from '@/lib/meta'

async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single()
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { storeId: store.id as string }
}

// GET → redacted connection list (no tokens)
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data } = await admin
    .from('channel_connections')
    .select('id, platform, page_name, enabled')
    .eq('store_id', s.storeId)
    .order('platform')
  return NextResponse.json({ connections: data ?? [] })
}

// PATCH { id, enabled } → toggle
export async function PATCH(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const { id, enabled } = await request.json()
  const admin = createAdminClient()
  await admin.from('channel_connections')
    .update({ enabled: !!enabled })
    .eq('id', id)
    .eq('store_id', s.storeId)
  return NextResponse.json({ ok: true })
}

// DELETE { pageId } → unsubscribe at Meta then delete all rows for that page
export async function DELETE(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const { pageId } = await request.json()
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('channel_connections')
    .select('page_access_token')
    .eq('store_id', s.storeId)
    .eq('page_id', pageId)
    .limit(1)
  if (rows?.[0]) {
    try { await unsubscribePage(pageId, decryptToken(rows[0].page_access_token)) } catch { /* best effort */ }
  }
  await admin.from('channel_connections').delete().eq('store_id', s.storeId).eq('page_id', pageId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx eslint "src/app/api/channels/**/*.ts"`
Expected: clean / 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/channels
git commit -m "feat(chatbot): Meta connect/disconnect/toggle routes"
```

---

## Task 6: Meta webhook

**Files:**
- Create: `src/app/api/webhooks/meta/route.ts`

- [ ] **Step 1: Implement `src/app/api/webhooks/meta/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleInboundMessage } from '@/lib/chatbot-core'
import { verifyMetaSignature, sendMetaMessage } from '@/lib/meta'
import { decryptToken } from '@/lib/crypto'
import type { ChannelPlatform } from '@/types/database'

// GET → Meta verification handshake
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

interface MetaMessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  message?: { text?: string; is_echo?: boolean }
}

export async function POST(request: Request) {
  const raw = await request.text()
  const sig = request.headers.get('x-hub-signature-256')
  if (!verifyMetaSignature(raw, sig, process.env.META_APP_SECRET ?? '')) {
    return new Response('Invalid signature', { status: 403 })
  }

  let body: { object?: string; entry?: Array<{ id: string; messaging?: MetaMessagingEvent[] }> }
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ ok: true }) }

  // `object` is 'page' for Messenger and 'instagram' for IG.
  const platform: ChannelPlatform = body.object === 'instagram' ? 'instagram' : 'messenger'
  const admin = createAdminClient()

  for (const entry of body.entry ?? []) {
    for (const ev of entry.messaging ?? []) {
      const text = ev.message?.text
      const senderId = ev.sender?.id
      // Skip echoes, non-text, and malformed events.
      if (!text || !senderId || ev.message?.is_echo) continue

      // Resolve the store's connection. For messenger the page id is entry.id /
      // recipient.id; for instagram the ig id is entry.id / recipient.id.
      const assetId = ev.recipient?.id ?? entry.id
      const column = platform === 'instagram' ? 'ig_id' : 'page_id'
      const { data: conn } = await admin
        .from('channel_connections')
        .select('store_id, page_access_token, enabled')
        .eq('platform', platform)
        .eq(column, assetId)
        .single()

      if (!conn || !conn.enabled) continue

      try {
        const { reply } = await handleInboundMessage({
          storeId: conn.store_id,
          sessionKey: `${platform}:${senderId}`,
          text,
          channel: platform,
        })
        await sendMetaMessage(decryptToken(conn.page_access_token), senderId, reply)
      } catch (err) {
        console.error('Meta webhook handling error:', err)
        // Swallow — always 200 so Meta does not retry-storm.
      }
    }
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx eslint "src/app/api/webhooks/meta/route.ts"`
Expected: clean / 0 errors.

- [ ] **Step 3: Local handshake smoke test**

With the dev server on port 3000:
Run: `curl -s "http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=$META_VERIFY_TOKEN&hub.challenge=42"`
Expected: prints `42`. (Set `META_VERIFY_TOKEN` in `.env.local` first.)

Run: `curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/api/webhooks/meta" -H "Content-Type: application/json" -d '{"object":"page","entry":[]}'`
Expected: `403` (missing/invalid signature) — proves signature gating is active.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/webhooks/meta
git commit -m "feat(chatbot): Meta webhook (verify + inbound message handling)"
```

---

## Task 7: Dashboard "Canaux de messagerie" card

**Files:**
- Create: `src/components/dashboard/MessagingChannels.tsx`
- Modify: `src/app/(platform)/dashboard/settings/chatbot/page.tsx`

Loads the Facebook JS SDK on demand, runs `FB.login`, posts the returned user token to `/api/channels/meta/connect`, shows the page picker if needed, then persists.

- [ ] **Step 1: Implement `src/components/dashboard/MessagingChannels.tsx`**

```tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { MessageCircle, Instagram, Loader2, Plus, Trash2, Check } from 'lucide-react'

interface Connection { id: string; platform: 'messenger' | 'instagram'; page_name: string | null; enabled: boolean }
interface PageOption { id: string; name: string; hasInstagram: boolean }

// Minimal typing for the Facebook JS SDK we use.
declare global {
  interface Window {
    FB?: {
      init: (o: Record<string, unknown>) => void
      login: (cb: (r: { authResponse?: { accessToken?: string } }) => void, o: Record<string, unknown>) => void
    }
    fbAsyncInit?: () => void
  }
}

const FB_SCOPES = 'pages_show_list,pages_messaging,pages_manage_metadata,instagram_basic,instagram_manage_messages,business_management'

export default function MessagingChannels({ locked }: { locked: boolean }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pages, setPages] = useState<PageOption[] | null>(null)
  const [userToken, setUserToken] = useState('')

  const refresh = useCallback(async () => {
    const res = await fetch('/api/channels/meta')
    const json = await res.json()
    setConnections(json.connections ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (locked) { setLoading(false); return }
    refresh()
    // Load FB SDK once.
    if (!document.getElementById('fb-sdk')) {
      window.fbAsyncInit = () => {
        window.FB?.init({ appId: process.env.NEXT_PUBLIC_META_APP_ID, cookie: true, xfbml: false, version: 'v21.0' })
      }
      const s = document.createElement('script')
      s.id = 'fb-sdk'
      s.src = 'https://connect.facebook.net/en_US/sdk.js'
      s.async = true
      document.body.appendChild(s)
    }
  }, [locked, refresh])

  const startLogin = () => {
    setError('')
    if (!window.FB) { setError('SDK Facebook non chargé. Réessayez dans un instant.'); return }
    window.FB.login(async (resp) => {
      const token = resp.authResponse?.accessToken
      if (!token) { setError('Connexion annulée.'); return }
      setUserToken(token)
      setBusy(true)
      try {
        const res = await fetch('/api/channels/meta/connect', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userToken: token }),
        })
        const json = await res.json()
        if (!res.ok) { setError(json.error ?? 'Erreur'); return }
        setPages(json.pages ?? [])
      } finally { setBusy(false) }
    }, { scope: FB_SCOPES })
  }

  const choosePage = async (pageId: string) => {
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/channels/meta/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userToken, pageId }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Erreur'); return }
      setPages(null); setUserToken('')
      await refresh()
    } finally { setBusy(false) }
  }

  const toggle = async (c: Connection) => {
    await fetch('/api/channels/meta', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, enabled: !c.enabled }),
    })
    refresh()
  }

  const disconnect = async () => {
    if (!confirm('Déconnecter cette page ? Le chatbot cessera de répondre sur Messenger/Instagram.')) return
    setBusy(true)
    // All rows for a store share one page; DELETE by pageId is derived server-side per row,
    // so we send the page via a dedicated fetch per platform-less disconnect.
    await fetch('/api/channels/meta', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId: 'ALL' }),
    })
    setBusy(false)
    refresh()
  }

  if (locked) {
    return (
      <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 flex items-center gap-4 opacity-60">
        <MessageCircle size={20} className="text-gray-500 flex-shrink-0" />
        <div>
          <p className="text-white text-sm font-semibold">Messenger & Instagram</p>
          <p className="text-gray-500 text-xs">Répondez automatiquement à vos DM — disponible sur le plan Ultimate</p>
        </div>
        <a href="/dashboard/billing/upgrade" className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg"
           style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>Passer à Ultimate</a>
      </div>
    )
  }

  return (
    <div className="bg-[#111118] border border-white/5 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle size={16} className="text-[#3B82F6]" />
        <h3 className="text-white font-semibold text-sm">Canaux de messagerie</h3>
      </div>
      <p className="text-gray-500 text-xs">
        Connectez votre page Facebook pour que le chatbot réponde sur Messenger et Instagram Direct.
      </p>

      {error && <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-xl">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-[#3B82F6]" size={20} /></div>
      ) : pages ? (
        <div className="space-y-2">
          <p className="text-white text-xs font-medium">Choisissez la page à connecter :</p>
          {pages.length === 0 && <p className="text-gray-500 text-xs">Aucune page trouvée sur ce compte.</p>}
          {pages.map(p => (
            <button key={p.id} onClick={() => choosePage(p.id)} disabled={busy}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#3B82F6]/50 transition-all text-left disabled:opacity-60">
              <span className="text-white text-sm">{p.name}</span>
              <span className="flex items-center gap-2 text-xs text-gray-500">
                {p.hasInstagram && <Instagram size={13} />}
                {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              </span>
            </button>
          ))}
        </div>
      ) : connections.length === 0 ? (
        <button onClick={startLogin} disabled={busy}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: '#1877F2' }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <MessageCircle size={15} />}
          Connecter Facebook / Instagram
        </button>
      ) : (
        <div className="space-y-2">
          {connections.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10">
              {c.platform === 'instagram' ? <Instagram size={15} className="text-pink-400" /> : <MessageCircle size={15} className="text-[#1877F2]" />}
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm truncate">{c.page_name ?? '—'}</p>
                <p className="text-gray-500 text-xs capitalize">{c.platform}</p>
              </div>
              <button onClick={() => toggle(c)}
                className={`text-xs px-2 py-1 rounded-lg font-medium ${c.enabled ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-500'}`}>
                {c.enabled ? <span className="flex items-center gap-1"><Check size={11} />Actif</span> : 'Inactif'}
              </button>
            </div>
          ))}
          <button onClick={disconnect} disabled={busy}
            className="flex items-center gap-1.5 text-xs text-red-500/70 hover:text-red-400 transition-colors pt-1">
            <Trash2 size={12} /> Déconnecter
          </button>
        </div>
      )}
    </div>
  )
}
```

> **Note on DELETE:** the connect flow stores one page per store, so the "Déconnecter" button removes the store's connection. Adjust the `DELETE` route (Task 5) to treat `pageId: 'ALL'` as "delete all rows for this store" — replace its body's final two operations with: look up the store's rows, unsubscribe using the first row's decrypted token, then `delete().eq('store_id', s.storeId)`. Include this adjustment when implementing Task 5 so the two match. (Type consistency: both use `pageId` in the JSON body.)

- [ ] **Step 2: Render it in the chatbot settings page**

In `src/app/(platform)/dashboard/settings/chatbot/page.tsx`, import and render the card, passing whether the plan lacks the chatbot. Add near the top imports:

```tsx
import MessagingChannels from '@/components/dashboard/MessagingChannels'
```

Then, where the page renders its sections (after the existing chatbot settings block), add:

```tsx
<MessagingChannels locked={!(store?.plan === 'ultimate' || (store?.chatbot_daily_limit ?? 0) > 0)} />
```

(Use the page's existing `store` state variable; if the settings page does not already load `plan` and `chatbot_daily_limit`, extend its `select('...')` to include them.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Run: `npx eslint "src/components/dashboard/MessagingChannels.tsx" "src/app/(platform)/dashboard/settings/chatbot/page.tsx"`
Expected: clean / 0 errors.

- [ ] **Step 4: Manual verify (locked + unlocked)**

With `preview_start` running: visit `/dashboard/settings/chatbot`. On a non-Ultimate store the card shows the locked "Passer à Ultimate" state; on an Ultimate store it shows the "Connecter Facebook / Instagram" button. (Full OAuth needs the Meta app + `NEXT_PUBLIC_META_APP_ID` — covered in Task 8 / external setup.)

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/MessagingChannels.tsx "src/app/(platform)/dashboard/settings/chatbot/page.tsx"
git commit -m "feat(chatbot): dashboard Messenger/Instagram connection card"
```

---

## Task 8: Env vars + Meta setup guide

**Files:**
- Modify: `.env.example`
- Create: `docs/meta-setup.md`

- [ ] **Step 1: Append to `.env.example`**

```
# --- Meta (Messenger + Instagram) chatbot channel ---
META_APP_ID=
META_APP_SECRET=
META_VERIFY_TOKEN=            # any string you choose; entered in Meta webhook config
NEXT_PUBLIC_META_APP_ID=      # same as META_APP_ID; used by the Facebook Login button
TOKEN_ENC_KEY=               # base64 of 32 random bytes: `openssl rand -base64 32`
```

- [ ] **Step 2: Create `docs/meta-setup.md`**

```markdown
# Connecting Novalux to Facebook Messenger & Instagram

## 1. Generate the token-encryption key
Run `openssl rand -base64 32` and put the result in `TOKEN_ENC_KEY` (in `.env.local` and your host).

## 2. Create the Meta App
1. https://developers.facebook.com → My Apps → Create App → type **Business**.
2. Add products: **Messenger** and **Instagram**.
3. Copy the App ID / App Secret into `META_APP_ID`, `META_APP_SECRET`, `NEXT_PUBLIC_META_APP_ID`.
4. Choose any `META_VERIFY_TOKEN` string (e.g. another `openssl rand -hex 16`).

## 3. Configure the webhook
- Callback URL: `https://<your-deployed-domain>/api/webhooks/meta`
- Verify token: your `META_VERIFY_TOKEN`
- Subscribe to fields: `messages`, `messaging_postbacks` (Messenger) and the Instagram `messages` field.
- Meta cannot reach `localhost`; for local testing use a tunnel (e.g. a public HTTPS tunnel) pointing at port 3000.

## 4. Test in Development mode (no App Review needed)
- Under App Roles, add yourself as Admin/Developer/Tester.
- Connect your own Facebook Page (linked to an Instagram professional account) from
  Novalux → Dashboard → Paramètres → Chatbot → "Connecter Facebook / Instagram".
- DM your Page on Messenger and your IG account; the chatbot should reply.

## 5. Go live (App Review)
Required only to let *other* store owners connect their pages:
- Complete **Business Verification**.
- Submit for **App Review** requesting `pages_messaging` and `instagram_manage_messages`
  (plus `pages_show_list`, `pages_manage_metadata`, `instagram_basic`), with a privacy
  policy URL and a screen recording of the connect + reply flow.
```

- [ ] **Step 3: Commit**

```bash
git add .env.example docs/meta-setup.md
git commit -m "docs(chatbot): Meta env vars + setup/App Review guide"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Shared core `handleInboundMessage` → Task 4. ✅
- `channel_connections` table + service-role-only RLS → Task 3. ✅
- Connect flow (OAuth, page pick, subscribe, store) → Tasks 5 + 7. ✅
- Webhook (verify + inbound + Send API) → Task 6. ✅
- `lib/meta.ts` helpers + signature verify → Task 2. ✅
- Token encryption (AES-256-GCM) → Task 1. ✅
- Feature gating (ULTIMATE) → Tasks 5, 7 (server + UI). ✅
- Shared daily limit → Task 4 (single `chatbot_daily_usage`). ✅
- Env vars + external guide → Task 8. ✅
- Web widget unchanged (regression) → Task 4 Step 4. ✅
- Non-goal TikTok → not present. ✅

**Type consistency:** `ChannelSource` ('chatbot'|'messenger'|'instagram') and `ChannelPlatform` ('messenger'|'instagram') defined in Task 3, used consistently in Tasks 4/6. `handleInboundMessage` signature identical across callers (Tasks 4, 6). Connect/DELETE both use `pageId` in the JSON body (Task 7 note reconciles the 'ALL' semantics with Task 5). `sendMetaMessage(pageToken, recipientId, text)` and `verifyMetaSignature(rawBody, header, appSecret)` match their call sites.

**Placeholder scan:** no TBD/TODO; every code step contains complete code. The one cross-task adjustment (DELETE `'ALL'` semantics) is spelled out explicitly in the Task 7 note.
```
