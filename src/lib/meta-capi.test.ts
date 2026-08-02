import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'crypto'
import { isMetaCapiConfigured, normalizePhoneForMeta, sendPurchaseEvent } from './meta-capi'

beforeEach(() => {
  process.env.META_CAPI_ACCESS_TOKEN = 'test_token'
  process.env.META_CAPI_PIXEL_ID = '123456789'
})
afterEach(() => {
  delete process.env.META_CAPI_ACCESS_TOKEN
  delete process.env.META_CAPI_PIXEL_ID
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('isMetaCapiConfigured', () => {
  it('is true when both env vars are set', () => {
    expect(isMetaCapiConfigured()).toBe(true)
  })
  it('is false when either is missing', () => {
    delete process.env.META_CAPI_PIXEL_ID
    expect(isMetaCapiConfigured()).toBe(false)
  })
})

describe('normalizePhoneForMeta', () => {
  it('converts local Algerian format to 213-prefixed digits', () => {
    expect(normalizePhoneForMeta('0549494949')).toBe('213549494949')
    expect(normalizePhoneForMeta('05 49 49 49 49')).toBe('213549494949')
    expect(normalizePhoneForMeta('0654321098')).toBe('213654321098')
    expect(normalizePhoneForMeta('0712345678')).toBe('213712345678')
  })
  it('accepts already-prefixed 213 numbers', () => {
    expect(normalizePhoneForMeta('213549494949')).toBe('213549494949')
  })
  it('returns null for invalid input', () => {
    expect(normalizePhoneForMeta('12345')).toBeNull()
    expect(normalizePhoneForMeta('0123456789')).toBeNull()
    expect(normalizePhoneForMeta('')).toBeNull()
  })
})

describe('sendPurchaseEvent', () => {
  it('posts a Purchase event with hashed email+phone and value/currency', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendPurchaseEvent({ email: 'Test@Example.com', phone: '0549494949', valueDzd: 9000 })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://graph.facebook.com/v21.0/123456789/events')
    const body = JSON.parse(opts.body)
    expect(body.data[0].event_name).toBe('Purchase')
    expect(body.data[0].action_source).toBe('other')
    expect(body.data[0].custom_data).toEqual({ value: 9000, currency: 'DZD' })
    expect(body.data[0].user_data.em).toEqual([createHash('sha256').update('test@example.com').digest('hex')])
    expect(body.data[0].user_data.ph).toEqual([createHash('sha256').update('213549494949').digest('hex')])
    expect(body.access_token).toBe('test_token')
  })

  it('omits ph when phone is missing or invalid', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendPurchaseEvent({ email: 'a@b.com', phone: null, valueDzd: 3000 })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user_data).not.toHaveProperty('ph')
  })

  it('never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(sendPurchaseEvent({ email: 'a@b.com', valueDzd: 3000 })).resolves.toBeUndefined()
  })

  it('never throws when Meta returns a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ error: { message: 'bad token' } }),
    }))
    await expect(sendPurchaseEvent({ email: 'a@b.com', valueDzd: 3000 })).resolves.toBeUndefined()
  })

  it('no-ops when not configured', async () => {
    delete process.env.META_CAPI_ACCESS_TOKEN
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sendPurchaseEvent({ email: 'a@b.com', valueDzd: 3000 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('no-ops when neither email nor phone is usable', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sendPurchaseEvent({ email: '', phone: 'garbage', valueDzd: 3000 })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
