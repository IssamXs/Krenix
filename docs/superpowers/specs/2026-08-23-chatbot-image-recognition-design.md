# Chatbot image recognition (Messenger / Instagram)

**Date:** 2026-08-23
**Status:** Approved design — ready for implementation planning
**Scope:** Meta channels only (Messenger + Instagram DMs). The web widget stays text-only.

---

## Problem

A customer of Le Mirage Textile sent a product screenshot over DM. The chatbot said
nothing at all — not an error, not a fallback, complete silence.

The cause is a single guard in `src/app/api/webhooks/meta/route.ts`:

```ts
const text = ev.message?.text
if (!text || !senderId || ev.message?.is_echo) continue
```

A photo-only message has no `message.text`, so the event is dropped before the store
is resolved and before `handleInboundMessage()` is ever called. Nothing downstream
runs, so nothing is sent back.

Images are also unsupported further down the stack:

- `sendChatbotMessage()` in `src/lib/gemini.ts` builds text-only parts.
- `handleInboundMessage()` in `src/lib/chatbot-core.ts` takes a `text: string` only.

The model itself is not the blocker: `gemini-2.5-flash-lite` is multimodal, and the
codebase already sends `inlineData` image parts in `generateProductShot()`.

## Goals

1. A photo message never produces silence.
2. When the photo shows a product in the store's catalog, the bot identifies it and
   continues the existing order flow as if the customer had typed the product name.
3. When it cannot match confidently, it states its best guess and asks the customer to
   confirm — it never invents a product or a price.
4. Per-message cost and latency stay constant as the catalog grows.

## Non-goals

- No image upload in the storefront web widget (`ChatbotWidget.tsx` unchanged).
- No new plan gate. Vision ships wherever the chatbot already runs (Ultimate+).
- No storage of customer-sent images.
- No change to the ORDER_READY flow, order creation, delivery pricing, or Yalidine.

## Key insight

Algerian customers who "send a photo of a product" are usually screenshotting the
store's landing page or an ad, and that screenshot **contains the product name and
price as visible text**. Reading text out of the image is far more reliable than
visual comparison, so the prompt instructs the model to try text first and treat
visual matching as the fallback.

---

## Design

### 1. Webhook: accept attachments

`MetaMessagingEvent` in `src/app/api/webhooks/meta/route.ts` grows:

```ts
message?: {
  text?: string
  is_echo?: boolean
  sticker_id?: number
  attachments?: Array<{ type: string; payload?: { url?: string } }>
}
```

Classification, in order:

| Case | Handling |
|---|---|
| `is_echo` or no `senderId` | skip (unchanged) |
| `sticker_id` present | ignore attachments, pass `"👍"` as text |
| `attachments` with `type === 'image'` | image path; caption passed as text when present |
| other attachment types (`video`, `audio`, `file`, `share`, `story_mention`, `ig_reel`) | no image; canned French reply, never silence |
| text only | unchanged behaviour |
| neither text nor usable attachment | skip |

The new guard drops an event only when there is **neither** text **nor** a usable image.

Stickers matter because Messenger delivers the thumbs-up sticker as an `image`
attachment; treating it as a product photo would be nonsense. Story mentions matter
because they are constant on Instagram.

At most **2 images** per message are processed; extras are ignored.

Reply for unsupported attachment types (French, no Gemini call, does not consume
quota):

> "Je ne peux pas ouvrir ce type de fichier 🙏 Envoyez-moi une photo du produit ou
> dites-moi son nom, et je vous aide tout de suite."

### 2. Fetching the image: `fetchInboundImage()` in `src/lib/meta.ts`

Meta supplies a signed, short-lived CDN URL that is publicly fetchable — no page
access token required.

```ts
export async function fetchInboundImage(
  url: string
): Promise<{ base64: string; mimeType: string } | null>
```

Rules:

- 8 second timeout via `AbortController`.
- Reject any response whose `Content-Type` is not `image/*`.
- **5MB cap enforced while streaming** — `Content-Length` is attacker-controlled and
  may be absent, so the read is aborted once the cap is exceeded.
- Any failure returns `null`; the turn then degrades to text-only. It never throws.

### 3. Vision through the existing core

`sendChatbotMessage()` gains an optional parameter:

```ts
images?: Array<{ base64: string; mimeType: string }>
```

When present, the current turn is sent as `[...imageParts, { text }]` using the same
`inlineData` shape as `generateProductShot()`. Conversation history stays text-only.

`handleInboundMessage()` gains a matching optional `images` param and forwards it.

**No signatures break.** Both parameters are optional, so the web widget, the
`/api/ai/chatbot` route and every other caller are untouched.

The system prompt in `buildSystemPrompt()` gains a `PHOTO ENVOYÉE PAR LE CLIENT`
section, included only when images are present:

1. Read any text visible in the image first (product name, price) and match it
   against the catalog.
2. Otherwise compare the image against the catalog's visual descriptions.
3. On a confident match, name the product, its price and its available colours and
   sizes, then continue the normal order flow.
4. When unsure, state the best guess and ask the customer to confirm.
5. Never name a product that is not in the catalog. Never invent a price.

### 4. Visual index: lazy, batched, self-healing

Migration `061` adds two nullable columns to `products`:

```sql
alter table products add column if not exists visual_description text;
alter table products add column if not exists visual_description_source text;
```

`visual_description_source` stores the image URL the description was derived from, so
a changed photo invalidates its own description.

**Generation is lazy, not hooked into save.** Products are written client-side through
RLS from `dashboard/products/new`, `dashboard/products/[id]` and
`dashboard/products/import` — a save hook would mean touching three pages and would
still miss YouCan imports and seeded demo stores.

On a photo message, before calling the chatbot, the core takes the active in-stock
products it already fetches and selects, in JS, those where `visual_description` is
null **or** `visual_description_source !== images[0]` (a JS comparison, not SQL —
Postgres array indexing is 1-based and the products are already in memory). It then
describes the selected ones in **one batched Gemini call** that returns a JSON array. Results are written back with the
admin client (per the store-column security rules, service-role writes only).

Consequences:

- 13 products → one call, once, ever.
- Products added later are described on the next photo message.
- Replaced photos re-describe themselves.
- Nothing to backfill by hand.
- Steady-state cost per photo message is one call carrying only the customer's own
  image(s) — at most 2 — regardless of catalog size.

If the index call fails, the turn proceeds with names, prices and descriptions alone —
degraded, not broken.

The SQL is delivered to the operator as pasteable text, not as a file path reference.

### 5. History, quota, privacy, cost

- **History.** `ChatMessage.content` is a `string`. The user turn is persisted as
  `[photo]`, plus the caption when there is one. Previous images are never re-sent on
  later turns — the assistant's own reply names the matched product, so the context
  survives in text. Token cost and row size stay flat.
- **Quota.** A photo message counts as exactly 1 against `chatbot_daily_usage`,
  identical to a text message. No new counters. Unsupported-attachment replies are
  canned and consume nothing.
- **Privacy.** The customer image is sent to Gemini for that single turn and is never
  persisted by Krenix.
- **Cost.** On flash-lite an image is roughly 300–1,100 input tokens, about
  $0.0001 per message at $0.10/M input. Immaterial.

### 6. Non-product images

Explicit prompt rules, because these will occur in practice: payment or receipt
screenshots, screenshots of another conversation, memes, selfies, and photos that are
blurry, dark or badly cropped.

The bot acknowledges what it actually sees, does not force a catalog match, and
redirects to the products. For an unreadable image it asks for a clearer photo.

---

## Failure modes

| Failure | Behaviour |
|---|---|
| CDN fetch times out / 404 / non-image / over 5MB | `null` → text-only turn; bot asks the customer to resend or describe the product |
| Visual index call fails | turn proceeds on names + descriptions only |
| Gemini call fails on a photo turn | existing French technical-error reply in `chatbot-core.ts` |
| Product has no images | excluded from the index; still matchable by name text in the screenshot |
| Several near-identical products | bot asks for confirmation instead of guessing — accepted trade-off |
| Meta redelivers the same event | existing 10-minute duplicate-order guard still applies |

## Testing

Extending `src/lib/chatbot-core.test.ts` and adding a webhook test:

- image-only event is no longer skipped
- sticker event resolves to `"👍"`, not a product lookup
- non-image attachment produces a reply, never silence
- failed or oversized image fetch falls back to text-only without throwing
- visual index is built once, reused on a second message, refreshed when `images[0]`
  changes
- Gemini failure on a photo turn returns the existing graceful French reply

## Files touched

| File | Change |
|---|---|
| `src/app/api/webhooks/meta/route.ts` | attachment parsing, sticker handling, unsupported-type reply |
| `src/lib/meta.ts` | `fetchInboundImage()` |
| `src/lib/gemini.ts` | optional `images` on `sendChatbotMessage()`; photo section in `buildSystemPrompt()`; batched visual-description call |
| `src/lib/chatbot-core.ts` | optional `images` param; lazy visual-index refresh; `[photo]` history entry |
| `database/061_chatbot_vision.sql` | two `products` columns |
| `src/lib/chatbot-core.test.ts`, new webhook test | coverage above |

## Delivery phases

Shipped as two independent deployments. Phase 1 stops the bleeding on its own and is
valuable without Phase 2 ever landing.

**Phase 1 — never go silent.** Sections 1 and 2, plus the minimum of section 3 needed
to pass an image to Gemini. The bot receives the photo, sees it, and answers using the
catalog text it already has (names, prices, colours, sizes). Screenshots carrying a
visible product name — the common case — already match at this stage. No migration, no
visual index, no schema change. Deployable alone.

**Phase 2 — accurate visual matching.** Section 4 in full: the `061` migration, the
lazy batched visual index, and the prompt rules that lean on it. Improves raw photos
with no readable text, and near-identical products. Everything in Phase 1 keeps
working unchanged if Phase 2 is delayed.

Section 5 (history, quota, privacy) lands in Phase 1 since it is inherent to accepting
an image at all. Section 6 (non-product images) also lands in Phase 1 — it is prompt
text, not index-dependent.

## Open decisions already settled

- Meta channels only; web widget deferred. Sections 2–4 are shared, so adding the
  widget later is upload UI only.
- Identify-and-sell, not acknowledge-only.
- Lazy batched indexing, not a save hook and not per-message photo comparison.
