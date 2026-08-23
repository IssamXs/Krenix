# Chatbot Image Recognition — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A customer who sends a photo over Messenger or Instagram DM always gets an answer, and when the photo carries a readable product name the bot identifies it and continues the normal order flow.

**Architecture:** The Meta webhook currently drops any event without `message.text`, which is why photo DMs produce silence. We add a pure classifier module that turns one raw Meta messaging event into a typed decision (`text` / `image` / `unsupported` / `skip`), a hardened CDN image fetcher in `lib/meta.ts`, and an optional `images` parameter threaded through `chatbot-core.ts` into the existing Gemini call as `inlineData` parts. Every new parameter is optional, so the web widget and `/api/ai/chatbot` are untouched.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, Vitest (`environment: 'node'`, `@` → `./src`), `@google/generative-ai` (`gemini-2.5-flash-lite`, already multimodal), Supabase admin client.

**Spec:** `docs/superpowers/specs/2026-08-23-chatbot-image-recognition-design.md` — Phase 1 covers spec sections 1, 2, 3, 5 and 6. Section 4 (the product visual index and migration `061`) is Phase 2 and is explicitly **out of scope here**.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/meta-inbound.ts` | **Create.** Pure, I/O-free classification of one inbound Meta message, plus the French canned replies. Pure so the webhook's branching is testable without mocking Graph, Supabase or Gemini. |
| `src/lib/meta-inbound.test.ts` | **Create.** Unit tests for the classifier. |
| `src/lib/meta.ts` | **Modify.** Add `fetchInboundImage()` — network I/O against Meta's attachment CDN. |
| `src/lib/meta.test.ts` | **Modify.** Add `fetchInboundImage()` tests with a stubbed global `fetch`. |
| `src/lib/gemini.ts` | **Modify.** Optional `images` on `sendChatbotMessage()`; `PHOTO ENVOYÉE PAR LE CLIENT` block in `buildSystemPrompt()`. |
| `src/lib/gemini.test.ts` | **Create.** Assert the photo block appears only when images are present. |
| `src/lib/chatbot-core.ts` | **Modify.** Optional `images` param forwarded to Gemini; exported `buildHistoryText()` for the `[photo]` placeholder. |
| `src/lib/chatbot-core.test.ts` | **Modify.** Tests for `buildHistoryText()`. |
| `src/app/api/webhooks/meta/route.ts` | **Modify.** Use the classifier, fetch images, share one `deliver()` helper for sending + invalid-token handling. |

---

## Task 1: Pure inbound classifier

**Files:**
- Create: `src/lib/meta-inbound.ts`
- Test: `src/lib/meta-inbound.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/meta-inbound.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { classifyInboundMessage, MAX_INBOUND_IMAGES } from './meta-inbound'

const imageAttachment = (url: string) => ({ type: 'image', payload: { url } })

describe('classifyInboundMessage', () => {
  it('classifies a photo-only message as an image (the silence regression)', () => {
    // A photo DM has no message.text. The old webhook guard dropped this event
    // before any handler ran, so the customer got nothing back at all.
    const result = classifyInboundMessage({ attachments: [imageAttachment('https://cdn/1.jpg')] })
    expect(result).toEqual({ kind: 'image', text: '', imageUrls: ['https://cdn/1.jpg'] })
  })

  it('keeps the caption when a photo is sent with text', () => {
    const result = classifyInboundMessage({
      text: '  combien ?  ',
      attachments: [imageAttachment('https://cdn/1.jpg')],
    })
    expect(result).toEqual({ kind: 'image', text: 'combien ?', imageUrls: ['https://cdn/1.jpg'] })
  })

  it(`caps the number of images at ${MAX_INBOUND_IMAGES}`, () => {
    const result = classifyInboundMessage({
      attachments: [
        imageAttachment('https://cdn/1.jpg'),
        imageAttachment('https://cdn/2.jpg'),
        imageAttachment('https://cdn/3.jpg'),
      ],
    })
    expect(result).toEqual({
      kind: 'image',
      text: '',
      imageUrls: ['https://cdn/1.jpg', 'https://cdn/2.jpg'],
    })
  })

  it('treats a sticker as text, never as a product photo', () => {
    // Messenger delivers the thumbs-up sticker as an image attachment.
    const result = classifyInboundMessage({
      sticker_id: 369239263222822,
      attachments: [imageAttachment('https://cdn/thumbsup.png')],
    })
    expect(result).toEqual({ kind: 'text', text: '👍' })
  })

  it('flags an unreadable attachment type instead of dropping it', () => {
    // Instagram story mentions and shared reels arrive constantly.
    expect(classifyInboundMessage({ attachments: [{ type: 'story_mention', payload: {} }] }))
      .toEqual({ kind: 'unsupported' })
    expect(classifyInboundMessage({ attachments: [{ type: 'video', payload: { url: 'https://cdn/v.mp4' } }] }))
      .toEqual({ kind: 'unsupported' })
  })

  it('answers the text of a video sent with a caption rather than calling it unsupported', () => {
    const result = classifyInboundMessage({
      text: 'vous avez ça ?',
      attachments: [{ type: 'video', payload: { url: 'https://cdn/v.mp4' } }],
    })
    expect(result).toEqual({ kind: 'text', text: 'vous avez ça ?' })
  })

  it('classifies a plain text message as text', () => {
    expect(classifyInboundMessage({ text: 'bonjour' })).toEqual({ kind: 'text', text: 'bonjour' })
  })

  it('skips echoes, empty messages and undefined', () => {
    expect(classifyInboundMessage({ text: 'sent by the page', is_echo: true })).toEqual({ kind: 'skip' })
    expect(classifyInboundMessage({})).toEqual({ kind: 'skip' })
    expect(classifyInboundMessage({ text: '   ' })).toEqual({ kind: 'skip' })
    expect(classifyInboundMessage(undefined)).toEqual({ kind: 'skip' })
  })

  it('ignores an image attachment whose payload has no url', () => {
    expect(classifyInboundMessage({ attachments: [{ type: 'image', payload: {} }] }))
      .toEqual({ kind: 'unsupported' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/meta-inbound.test.ts
```

Expected: FAIL — `Failed to resolve import "./meta-inbound"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/meta-inbound.ts`:

```ts
// ============================================================
// KRENIX — Inbound Meta message classification
// Pure and I/O-free on purpose: the webhook's branching logic is the part that
// broke (a photo-only DM was dropped before any handler ran), and it is only
// cheaply testable if it does not touch Graph, Supabase or Gemini.
// ============================================================

// Gemini is billed per image and a customer rarely needs more than a couple of
// shots to be understood, so extra attachments are ignored rather than sent.
export const MAX_INBOUND_IMAGES = 2

export const UNSUPPORTED_ATTACHMENT_REPLY =
  "Je ne peux pas ouvrir ce type de fichier 🙏 Envoyez-moi une photo du produit ou dites-moi son nom, et je vous aide tout de suite."

export const IMAGE_FETCH_FAILED_REPLY =
  "Je n'ai pas réussi à ouvrir votre photo 🙏 Pouvez-vous la renvoyer, ou me donner le nom du produit ?"

export interface MetaInboundMessage {
  text?: string
  is_echo?: boolean
  sticker_id?: number
  attachments?: Array<{ type?: string; payload?: { url?: string } }>
}

export type InboundEvent =
  | { kind: 'skip' }
  | { kind: 'text'; text: string }
  | { kind: 'image'; text: string; imageUrls: string[] }
  | { kind: 'unsupported' }

export function classifyInboundMessage(message: MetaInboundMessage | undefined): InboundEvent {
  if (!message || message.is_echo) return { kind: 'skip' }

  const text = message.text?.trim() ?? ''

  // Messenger delivers the thumbs-up sticker as an image attachment. Feeding it
  // to the vision model as a product photo would be nonsense.
  if (message.sticker_id !== undefined) {
    return { kind: 'text', text: text || '👍' }
  }

  const attachments = message.attachments ?? []
  const imageUrls = attachments
    .filter(a => a.type === 'image' && typeof a.payload?.url === 'string' && a.payload.url.length > 0)
    .map(a => a.payload!.url as string)
    .slice(0, MAX_INBOUND_IMAGES)

  if (imageUrls.length > 0) return { kind: 'image', text, imageUrls }

  // Text wins over an attachment we cannot read: the customer told us what they
  // want, so answer that instead of complaining about the file.
  if (text) return { kind: 'text', text }

  // An attachment we cannot read and nothing else (video, audio, file, share,
  // story_mention, ig_reel). Must still produce a reply — never silence.
  if (attachments.length > 0) return { kind: 'unsupported' }

  return { kind: 'skip' }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/meta-inbound.test.ts
```

Expected: PASS — 9 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta-inbound.ts src/lib/meta-inbound.test.ts && git commit -m "feat(chatbot): classify inbound Meta messages incl. image attachments"
```

---

## Task 2: Fetch the image from Meta's CDN

**Files:**
- Modify: `src/lib/meta.ts` (append at end of file, after `sendMetaMessage`)
- Test: `src/lib/meta.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/meta.test.ts`:

```ts
import { vi, afterEach } from 'vitest'
import { fetchInboundImage } from './meta'

function imageResponse(bytes: Uint8Array, contentType = 'image/jpeg', status = 200) {
  return new Response(bytes, { status, headers: { 'content-type': contentType } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchInboundImage', () => {
  it('returns base64 + mime type for a normal image', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(bytes)))

    const result = await fetchInboundImage('https://cdn.fbsbx.com/photo.jpg')

    expect(result).toEqual({
      base64: Buffer.from(bytes).toString('base64'),
      mimeType: 'image/jpeg',
    })
  })

  it('strips charset parameters from the content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]), 'image/png; charset=binary')))

    const result = await fetchInboundImage('https://cdn.fbsbx.com/photo.png')

    expect(result?.mimeType).toBe('image/png')
  })

  it('returns null for a non-image content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]), 'text/html')))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/oops')).toBeNull()
  })

  it('returns null for a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]), 'image/jpeg', 404)))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/gone.jpg')).toBeNull()
  })

  it('returns null for an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([]))))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/empty.jpg')).toBeNull()
  })

  it('aborts and returns null past the 5MB cap even when Content-Length lies', async () => {
    // Content-Length is optional and attacker-controlled, so the cap has to be
    // enforced on the bytes actually read.
    const big = new Uint8Array(6 * 1024 * 1024)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(big, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '10' } })
    ))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/huge.jpg')).toBeNull()
  })

  it('returns null instead of throwing when the fetch itself fails', async () => {
    // A thrown error here would kill the whole webhook batch.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/photo.jpg')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/meta.test.ts
```

Expected: FAIL — `fetchInboundImage is not a function` / no matching export.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/meta.ts`:

```ts
// ---- Inbound attachments ----

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_FETCH_TIMEOUT_MS = 8_000

export interface InboundImage {
  base64: string
  mimeType: string
}

// Meta serves inbound attachments from a signed, short-lived CDN URL that needs
// no page token. Returns null on ANY failure: a photo we cannot read must
// degrade to a text-only turn, never throw and take the webhook batch down with
// it.
export async function fetchInboundImage(url: string): Promise<InboundImage | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) return null

    const mimeType = (res.headers.get('content-type') ?? '').split(';')[0].trim()
    if (!mimeType.startsWith('image/')) return null

    const reader = res.body?.getReader()
    if (!reader) return null

    // Cap on bytes actually read — Content-Length may be absent or a lie.
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {})
        return null
      }
      chunks.push(value)
    }
    if (total === 0) return null

    return { base64: Buffer.concat(chunks).toString('base64'), mimeType }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/meta.test.ts
```

Expected: PASS — the 4 pre-existing `verifyMetaSignature` tests plus 7 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta.ts src/lib/meta.test.ts && git commit -m "feat(chatbot): fetch inbound Meta image attachments with size + type guards"
```

---

## Task 3: Gemini vision + the photo prompt block

**Files:**
- Modify: `src/lib/gemini.ts` (`buildSystemPrompt`, `ChatbotParams`, `sendChatbotMessage`)
- Test: `src/lib/gemini.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/gemini.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import type { Product } from '@/types/database'

// gemini.ts constructs the Gemini client at module load from the env var, so it
// must exist before the import is evaluated.
process.env.GOOGLE_GENERATIVE_AI_API_KEY ??= 'test-key'
const { buildSystemPrompt } = await import('./gemini')

const product = {
  id: 'prod-1',
  name: 'Robe Satinée Noire',
  price: 4500,
  colors: ['Noir', 'Beige'],
  sizes: ['M', 'L'],
  is_active: true,
} as unknown as Product

describe('buildSystemPrompt photo section', () => {
  it('omits the photo section for a normal text conversation', () => {
    const prompt = buildSystemPrompt('Le Mirage Textile', [product])
    expect(prompt).not.toContain('PHOTO ENVOYÉE PAR LE CLIENT')
  })

  it('adds the photo section when the customer sent an image', () => {
    const prompt = buildSystemPrompt('Le Mirage Textile', [product], undefined, { hasImages: true })
    expect(prompt).toContain('PHOTO ENVOYÉE PAR LE CLIENT')
    // Reading text inside the screenshot is the most reliable signal and must be
    // instruction #1, ahead of visual comparison.
    expect(prompt).toContain('LIS D\'ABORD le texte visible')
    // Hallucination guards.
    expect(prompt).toContain('Ne nomme JAMAIS un produit qui n\'est pas dans la liste')
  })

  it('still lists the catalog alongside the photo section', () => {
    const prompt = buildSystemPrompt('Le Mirage Textile', [product], undefined, { hasImages: true })
    expect(prompt).toContain('Robe Satinée Noire')
    expect(prompt).toContain('prod-1')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/gemini.test.ts
```

Expected: FAIL — `Expected 3 arguments, but got 4` at build time, or the assertion on `PHOTO ENVOYÉE PAR LE CLIENT` fails.

- [ ] **Step 3: Add the photo block to `buildSystemPrompt`**

In `src/lib/gemini.ts`, add this constant immediately above `export function buildSystemPrompt`:

```ts
// Injected only on turns that actually carry an image. Ordering matters: most
// customers screenshot our own landing page or ad, so the product name and price
// are usually readable IN the image — far more reliable than visual comparison.
const PHOTO_INSTRUCTIONS = `
PHOTO ENVOYÉE PAR LE CLIENT:
Le client vient d'envoyer une ou plusieurs images. Procède DANS CET ORDRE:
1. LIS D'ABORD le texte visible dans l'image (nom du produit, prix, capture d'écran de notre page ou d'une publicité). Si un nom de produit de la liste ci-dessus y apparaît, c'est ce produit.
2. Sinon, compare l'image aux produits de la liste (type d'article, couleur, motif, matière).
3. Si tu es sûr: nomme le produit, son prix, ses couleurs et tailles disponibles, puis continue normalement le processus de commande.
4. Si tu n'es PAS sûr: donne ton hypothèse la plus probable et demande confirmation. Exemple: "Je pense que c'est [produit] — c'est bien celui-là ?"
5. Ne nomme JAMAIS un produit qui n'est pas dans la liste. N'invente JAMAIS un prix.
6. Si l'image n'est pas un produit (capture d'une conversation, reçu de paiement, photo personnelle, mème): réagis brièvement et poliment à ce que tu vois, ne force aucune correspondance, et ramène la conversation vers nos produits.
7. Si l'image est floue, sombre ou illisible: demande gentiment une photo plus nette.
`
```

Change the signature of `buildSystemPrompt` from:

```ts
export function buildSystemPrompt(
  storeName: string,
  products: Product[],
  settings?: ChatbotStoreSettings
): string {
```

to:

```ts
export function buildSystemPrompt(
  storeName: string,
  products: Product[],
  settings?: ChatbotStoreSettings,
  opts?: { hasImages?: boolean }
): string {
```

Inside the same function, immediately after the existing `const instructionsBlock = ...` assignment, add:

```ts
  const photoBlock = opts?.hasImages ? PHOTO_INSTRUCTIONS : ''
```

Then in the returned template literal, insert `${photoBlock}` on its own line directly after the `${buildDeliveryBlock(settings)}` line, so the section reads:

```
${buildDeliveryBlock(settings)}
${photoBlock}
TON RÔLE:
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/gemini.test.ts
```

Expected: PASS — 3 tests passed.

- [ ] **Step 5: Send the image parts to Gemini**

Still in `src/lib/gemini.ts`, add the field to the `ChatbotParams` interface (after `userMessage`):

```ts
  images?: Array<{ base64: string; mimeType: string }>
```

Then update `sendChatbotMessage`. Add `images` to the destructured parameters, pass the flag to the prompt builder, and send image parts alongside the text. Replace the body from the `getGenerativeModel` call through `const result = ...` with:

```ts
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    systemInstruction: buildSystemPrompt(storeName, products, storeSettings, {
      hasImages: (images?.length ?? 0) > 0,
    }),
  })

  // Convert history to Gemini format. History stays text-only on purpose: past
  // images are never re-sent, the assistant's own reply carries the context.
  const history = conversationHistory.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))

  const chat = model.startChat({ history })

  // Same inlineData shape already used by generateProductShot below.
  const parts = [
    ...(images ?? []).map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
    { text: userMessage },
  ]

  const result = await chat.sendMessage(parts)
```

- [ ] **Step 6: Verify the file typechecks**

```bash
npx tsc --noEmit
```

Expected: no errors referencing `gemini.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/gemini.ts src/lib/gemini.test.ts && git commit -m "feat(chatbot): accept image parts in Gemini chat turns + photo prompt rules"
```

---

## Task 4: Thread images through `chatbot-core`

**Files:**
- Modify: `src/lib/chatbot-core.ts`
- Test: `src/lib/chatbot-core.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/chatbot-core.test.ts`:

```ts
import { buildHistoryText } from '@/lib/chatbot-core'

describe('buildHistoryText', () => {
  it('marks a photo-only turn so the stored transcript is not blank', () => {
    // ChatMessage.content is a plain string and images are never persisted, so
    // the turn needs a readable placeholder in the session history.
    expect(buildHistoryText('', true)).toBe('[photo]')
  })

  it('keeps the caption alongside the photo marker', () => {
    expect(buildHistoryText('combien ?', true)).toBe('[photo] combien ?')
  })

  it('leaves a text-only turn untouched', () => {
    expect(buildHistoryText('bonjour', false)).toBe('bonjour')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run src/lib/chatbot-core.test.ts
```

Expected: FAIL — `buildHistoryText is not a function` / no matching export.

- [ ] **Step 3: Implement `buildHistoryText` and the `images` parameter**

In `src/lib/chatbot-core.ts`, add this export directly below the `hasChatbotAccess` function:

```ts
// Images are never persisted (privacy, and ChatMessage.content is a string), so
// a photo turn is stored with a readable marker instead of an empty bubble.
export function buildHistoryText(text: string, hasImages: boolean): string {
  if (!hasImages) return text
  return text ? `[photo] ${text}` : '[photo]'
}
```

Add the parameter to the `handleInboundMessage` args type, after `history`:

```ts
  images?: Array<{ base64: string; mimeType: string }>   // current turn only, never persisted
```

Change the destructuring line from:

```ts
  const { storeId, sessionKey, text, channel } = args
```

to:

```ts
  const { storeId, sessionKey, text, channel, images } = args
```

In the `sendChatbotMessage({ ... })` call, replace the `userMessage: text,` line with:

```ts
      userMessage: text || '(Le client a envoyé une photo, sans texte.)',
      images,
```

In the `turn` array, replace the user message line:

```ts
    { role: 'user', content: text, timestamp: new Date().toISOString() },
```

with:

```ts
    { role: 'user', content: buildHistoryText(text, (images?.length ?? 0) > 0), timestamp: new Date().toISOString() },
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run src/lib/chatbot-core.test.ts
```

Expected: PASS — the 5 pre-existing `hasChatbotAccess` tests plus 3 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/chatbot-core.ts src/lib/chatbot-core.test.ts && git commit -m "feat(chatbot): forward inbound images to Gemini and mark photo turns in history"
```

---

## Task 5: Wire the webhook

**Files:**
- Modify: `src/app/api/webhooks/meta/route.ts`

No new unit test here — the branching logic under test lives in `meta-inbound.ts` (Task 1) and the fetching in `meta.ts` (Task 2). This task is wiring, verified by typecheck plus the manual smoke test in Task 6.

- [ ] **Step 1: Update the imports**

Replace the existing import of `@/lib/meta` with:

```ts
import { verifyMetaSignature, sendMetaMessage, isInvalidTokenError, fetchInboundImage, type InboundImage } from '@/lib/meta'
import {
  classifyInboundMessage,
  UNSUPPORTED_ATTACHMENT_REPLY,
  IMAGE_FETCH_FAILED_REPLY,
  type MetaInboundMessage,
} from '@/lib/meta-inbound'
```

- [ ] **Step 2: Point the event type at the shared message type**

Replace the local `MetaMessagingEvent` interface with:

```ts
interface MetaMessagingEvent {
  sender?: { id: string }
  recipient?: { id: string }
  message?: MetaInboundMessage
}
```

- [ ] **Step 3: Replace the event loop body**

Inside `for (const ev of entry.messaging ?? [])`, replace everything from `const text = ev.message?.text` down to the end of that loop iteration with:

```ts
      const senderId = ev.sender?.id
      const inbound = classifyInboundMessage(ev.message)
      if (!senderId || inbound.kind === 'skip') continue

      // Resolve the store's connection. For messenger the page id is entry.id /
      // recipient.id; for instagram the ig id is entry.id / recipient.id.
      const assetId = ev.recipient?.id ?? entry.id
      const column = platform === 'instagram' ? 'ig_id' : 'page_id'
      const { data: conn } = await admin
        .from('channel_connections')
        .select('store_id, page_access_token, page_name, enabled')
        .eq('platform', platform)
        .eq(column, assetId)
        .single()

      if (!conn || !conn.enabled) continue

      // One send path for every branch below, so the invalid-token handling is
      // never accidentally skipped on a new reply type.
      const deliver = async (message: string) => {
        try {
          await sendMetaMessage(decryptToken(conn.page_access_token), senderId, message)
        } catch (err) {
          console.error('Meta send error:', err)
          // An invalid/expired token will fail on EVERY message, silently,
          // forever. Disable the connection so we stop trying (and stop hiding
          // the outage behind server logs no one is watching), and alert once.
          if (isInvalidTokenError(err)) {
            await admin.from('channel_connections').update({ enabled: false }).eq('store_id', conn.store_id).eq('platform', platform)
            await notifyChannelDisconnected(admin, conn.store_id, platform, conn.page_name ?? null)
          }
        }
      }

      // Video, audio, files, story mentions, shared reels: we cannot read them,
      // but staying silent is what lost the customer in the first place.
      if (inbound.kind === 'unsupported') {
        await deliver(UNSUPPORTED_ATTACHMENT_REPLY)
        continue
      }

      let images: InboundImage[] | undefined
      if (inbound.kind === 'image') {
        const fetched = await Promise.all(inbound.imageUrls.map(url => fetchInboundImage(url)))
        const usable = fetched.filter((img): img is InboundImage => img !== null)
        if (usable.length > 0) {
          images = usable
        } else if (!inbound.text) {
          // Nothing readable at all — ask for a resend rather than sending an
          // empty turn to Gemini.
          await deliver(IMAGE_FETCH_FAILED_REPLY)
          continue
        }
      }

      let reply: string
      try {
        ;({ reply } = await handleInboundMessage({
          storeId: conn.store_id,
          sessionKey: `${platform}:${senderId}`,
          text: inbound.text,
          channel: platform,
          images,
        }))
      } catch (err) {
        console.error('Meta webhook handling error:', err)
        continue // Swallow — always 200 so Meta does not retry-storm.
      }

      await deliver(reply)
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Lint**

```bash
npx eslint src/app/api/webhooks/meta/route.ts
```

Expected: no errors. (Warnings about pre-existing rules elsewhere are fine.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/webhooks/meta/route.ts && git commit -m "fix(chatbot): answer photo and attachment DMs instead of dropping them"
```

---

## Task 6: Full verification

**Files:** none modified except `dev-notes/Index.md`.

- [ ] **Step 1: Run the whole test suite**

```bash
npm test
```

Expected: PASS, including the 22 tests added by this plan (9 + 7 + 3 + 3). If an unrelated suite was already failing before this work, note it — do not claim it as a new pass or failure.

- [ ] **Step 2: Typecheck the whole project**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: build succeeds. This is the real check that the webhook route still compiles as a route handler.

- [ ] **Step 4: Manual smoke test against a connected page**

This needs a publicly reachable webhook URL (deploy preview or tunnel) and a store with an enabled `channel_connections` row on an Ultimate+ active account. From a personal Facebook or Instagram account, send the connected page:

1. A **photo of a product with the name visible** (screenshot one of your own landing pages) → expect the bot to name the product and its price and continue the order flow.
2. A **photo with no text** → expect either an identification or a best-guess-plus-confirmation question. Never silence, never an invented product.
3. A **thumbs-up sticker** → expect a normal conversational reply, not a product identification.
4. A **video or a story mention** → expect `UNSUPPORTED_ATTACHMENT_REPLY`.
5. A **plain text message** → expect unchanged behaviour.

Then confirm in the dashboard that the conversation's stored history shows `[photo]` for the image turns, and that `chatbot_daily_usage.message_count` advanced by exactly one per answered message.

- [ ] **Step 5: Record the session note**

Append a 1-3 line entry, newest-first under `## Log`, to `dev-notes/Index.md` (gitignored, local only) covering: photo DMs on Messenger/IG now reach Gemini; the silence came from the text-only guard in the Meta webhook; Phase 2 (product visual index, migration 061) still pending.

- [ ] **Step 6: Confirm the tree is clean**

```bash
git status --short
```

`dev-notes/` is gitignored, so nothing new should be staged. The working tree carries unrelated pre-existing modifications (logo, pixel and GTM files) — leave them alone; never `git add -A`. If Steps 1-3 forced a code fix, commit only the files you actually changed.

---

## Out of scope — Phase 2

Do **not** implement these here; they belong to the Phase 2 plan:

- `database/061_chatbot_vision.sql` and the `products.visual_description` / `visual_description_source` columns
- The lazy batched visual-description Gemini call and its refresh check
- Any change to `ChatbotWidget.tsx` (the storefront web widget stays text-only)
