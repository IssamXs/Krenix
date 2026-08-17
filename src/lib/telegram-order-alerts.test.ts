import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { notifyStoreNewOrder, escapeTelegramHtml, type TelegramOrderPayload } from './telegram'

// Minimal stand-in for the Supabase admin client: only the two chains
// notifyStoreNewOrder actually walks — stores→maybeSingle and
// telegram_recipients→eq. Anything else would be a change in behaviour worth
// failing on.
function makeAdmin(store: unknown, recipients: unknown[]) {
  return {
    from(table: string) {
      if (table === 'stores') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: store }) }) }),
        }
      }
      return {
        select: () => ({ eq: async () => ({ data: recipients }) }),
      }
    },
  } as never
}

const ORDER: TelegramOrderPayload = {
  order_number: 42,
  customer_name: 'Amine B.',
  customer_phone: '0555123456',
  wilaya: 'Alger',
  commune: 'Bab Ezzouar',
  quantity: 2,
  total_price: 7400,
}

beforeEach(() => {
  process.env.TELEGRAM_ORDERS_BOT_TOKEN = 'test-token'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  delete process.env.TELEGRAM_ORDERS_BOT_TOKEN
})

describe('notifyStoreNewOrder', () => {
  it('sends one message per connected recipient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await notifyStoreNewOrder(
      makeAdmin({ name: 'Ma Boutique', plan: 'ultimate', settings: {} }, [{ chat_id: '111' }, { chat_id: '222' }]),
      'store-1',
      ORDER,
    )

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const bodies = fetchMock.mock.calls.map(c => JSON.parse(c[1].body))
    expect(bodies.map(b => b.chat_id)).toEqual(['111', '222'])
    expect(bodies[0].text).toContain('Nouvelle commande')
    expect(bodies[0].text).toContain('Amine B.')
    expect(bodies[0].text).toContain('0555123456')
    expect(bodies[0].text).toContain('Alger, Bab Ezzouar')
  })

  it('does not send for a plan below Ultimate', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await notifyStoreNewOrder(
      makeAdmin({ name: 'Ma Boutique', plan: 'pro', settings: {} }, [{ chat_id: '111' }]),
      'store-1',
      ORDER,
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send when the store toggled alerts off', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await notifyStoreNewOrder(
      makeAdmin({ name: 'Ma Boutique', plan: 'ultimate', settings: { notifyTelegramOrders: false } }, [{ chat_id: '111' }]),
      'store-1',
      ORDER,
    )

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an absent toggle as enabled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await notifyStoreNewOrder(
      makeAdmin({ name: 'Ma Boutique', plan: 'enterprise', settings: {} }, [{ chat_id: '111' }]),
      'store-1',
      ORDER,
    )

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no recipient is connected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await notifyStoreNewOrder(makeAdmin({ name: 'B', plan: 'ultimate', settings: {} }, []), 'store-1', ORDER)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not throw when Telegram is unreachable — the order is already saved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

    await expect(
      notifyStoreNewOrder(makeAdmin({ name: 'B', plan: 'ultimate', settings: {} }, [{ chat_id: '111' }]), 'store-1', ORDER),
    ).resolves.toBeUndefined()
  })

  it('escapes customer-supplied text so a crafted name cannot inject HTML', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)

    await notifyStoreNewOrder(
      makeAdmin({ name: 'B', plan: 'ultimate', settings: {} }, [{ chat_id: '111' }]),
      'store-1',
      { ...ORDER, customer_name: '<b>hack</b> & co' },
    )

    const text = JSON.parse(fetchMock.mock.calls[0][1].body).text
    expect(text).toContain('&lt;b&gt;hack&lt;/b&gt; &amp; co')
    expect(text).not.toContain('<b>hack</b>')
  })
})

describe('escapeTelegramHtml', () => {
  it('escapes &, < and > and leaves everything else alone', () => {
    expect(escapeTelegramHtml('a & b <i>c</i>')).toBe('a &amp; b &lt;i&gt;c&lt;/i&gt;')
    expect(escapeTelegramHtml('Amine B. — Alger')).toBe('Amine B. — Alger')
  })
})
