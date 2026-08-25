import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// State the fake admin client serves back to the route.
let linkRow: Record<string, unknown> | null = null
let recipientCount = 0
let existingRecipient: { id: string } | null = null
let burnWins = true
const upserted: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'telegram_link_codes') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: linkRow }) }) }),
          // .update().eq().is().select().maybeSingle() — the atomic code burn
          update: () => ({
            eq: () => ({
              is: () => ({
                select: () => ({
                  maybeSingle: async () => ({ data: burnWins ? { code: 'code-1' } : null }),
                }),
              }),
            }),
          }),
        }
      }
      if (table === 'telegram_recipients') {
        return {
          select: (_c: string, opts?: { count?: string; head?: boolean }) => ({
            eq: () =>
              opts?.head
                ? Promise.resolve({ count: recipientCount })
                : { eq: () => ({ maybeSingle: async () => ({ data: existingRecipient }) }) },
          }),
          upsert: async (row: Record<string, unknown>) => { upserted.push(row); return { error: null } },
        }
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Ma Boutique' } }) }) }) }
    },
  }),
}))

import { POST } from './route'

const SECRET = 'hook-secret'

function req(body: unknown, secret?: string) {
  return new Request('https://krenix.store/api/webhooks/telegram', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(secret ? { 'x-telegram-bot-api-secret-token': secret } : {}),
    },
    body: JSON.stringify(body),
  })
}

const start = (code: string, chatId: number | string = 555) => ({
  message: { chat: { id: chatId }, text: `/start ${code}` },
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  process.env.TELEGRAM_ORDERS_WEBHOOK_SECRET = SECRET
  process.env.TELEGRAM_ORDERS_BOT_TOKEN = 'bot-token'
  linkRow = {
    code: 'code-1',
    store_id: 'store-1',
    label: 'Yacine',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    used_at: null,
  }
  recipientCount = 0
  existingRecipient = null
  burnWins = true
  upserted.length = 0
  fetchMock = vi.fn().mockResolvedValue({ ok: true })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.TELEGRAM_ORDERS_WEBHOOK_SECRET
  delete process.env.TELEGRAM_ORDERS_BOT_TOKEN
})

describe('telegram webhook — auth gate', () => {
  it('rejects a request with no secret header', async () => {
    const res = await POST(req(start('code-1')))
    expect(res.status).toBe(403)
    expect(upserted).toHaveLength(0)
  })

  it('rejects a request with the wrong secret', async () => {
    const res = await POST(req(start('code-1'), 'not-the-secret'))
    expect(res.status).toBe(403)
    expect(upserted).toHaveLength(0)
  })

  it('processes nothing at all when no secret is configured', async () => {
    delete process.env.TELEGRAM_ORDERS_WEBHOOK_SECRET
    const res = await POST(req(start('code-1'), SECRET))
    expect(res.status).toBe(200)
    expect(upserted).toHaveLength(0)
  })
})

describe('telegram webhook — redemption', () => {
  it('records the chat id and label on a valid code', async () => {
    const res = await POST(req(start('code-1', 98765), SECRET))

    expect(res.status).toBe(200)
    expect(upserted).toEqual([{ store_id: 'store-1', chat_id: '98765', label: 'Yacine' }])
    // Confirmation message goes back to the chat that just linked.
    const body = JSON.parse(fetchMock.mock.calls.at(-1)![1].body)
    expect(body.chat_id).toBe('98765')
    expect(body.text).toContain('Connecté')
  })

  it('refuses an already-used code', async () => {
    linkRow = { ...linkRow!, used_at: new Date().toISOString() }
    await POST(req(start('code-1'), SECRET))
    expect(upserted).toHaveLength(0)
  })

  it('refuses an expired code', async () => {
    linkRow = { ...linkRow!, expires_at: new Date(Date.now() - 1000).toISOString() }
    await POST(req(start('code-1'), SECRET))
    expect(upserted).toHaveLength(0)
  })

  it('refuses an unknown code', async () => {
    linkRow = null
    await POST(req(start('nope'), SECRET))
    expect(upserted).toHaveLength(0)
  })

  it('refuses a new recipient once the store is at the cap', async () => {
    recipientCount = 3
    await POST(req(start('code-1'), SECRET))
    expect(upserted).toHaveLength(0)
  })

  it('still allows re-linking a chat that is already connected at the cap', async () => {
    recipientCount = 3
    existingRecipient = { id: 'rec-1' }
    await POST(req(start('code-1'), SECRET))
    expect(upserted).toHaveLength(1)
  })

  it('drops the redemption that loses the race to burn the code', async () => {
    burnWins = false
    await POST(req(start('code-1'), SECRET))
    expect(upserted).toHaveLength(0)
  })

  it('ignores a bare /start with no code', async () => {
    await POST(req({ message: { chat: { id: 1 }, text: '/start' } }, SECRET))
    expect(upserted).toHaveLength(0)
    // ...but still greets the person so they are not left staring at silence.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('ignores ordinary chat messages', async () => {
    await POST(req({ message: { chat: { id: 1 }, text: 'bonjour' } }, SECRET))
    expect(upserted).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
