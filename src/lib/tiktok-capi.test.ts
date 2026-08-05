import { describe, it, expect, afterEach, vi } from 'vitest'
import { createHash } from 'crypto'
import { sendTikTokEvent, readCookie } from './tiktok-capi'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('readCookie', () => {
  it('extracts a named cookie value from a cookie header', () => {
    expect(readCookie('a=1; ttclid=abc123; _ttp=xyz', 'ttclid')).toBe('abc123')
    expect(readCookie('a=1; ttclid=abc123; _ttp=xyz', '_ttp')).toBe('xyz')
  })
  it('returns null when the cookie is absent', () => {
    expect(readCookie('a=1; b=2', 'ttclid')).toBeNull()
    expect(readCookie('', 'ttclid')).toBeNull()
  })
  it('URL-decodes the value', () => {
    expect(readCookie('_ttp=a%2Fb', '_ttp')).toBe('a/b')
  })
})

describe('sendTikTokEvent', () => {
  const BASE = {
    pixelCode: 'PIXEL123',
    accessToken: 'token-abc',
    ip: '41.200.1.1',
    userAgent: 'Mozilla/5.0',
  }

  it('posts to the TikTok Events API v1.3 endpoint with the access token header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({
      ...BASE,
      event: 'CompletePayment',
      eventId: 'order-1-pay',
      value: 5000,
      currency: 'DZD',
    })

    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/event/track/')
    expect(opts.headers['Access-Token']).toBe('token-abc')
    const body = JSON.parse(opts.body)
    expect(body.event_source).toBe('web')
    expect(body.event_source_id).toBe('PIXEL123')
    expect(body.data[0].event).toBe('CompletePayment')
    expect(body.data[0].event_id).toBe('order-1-pay')
    expect(body.data[0].user.ip).toBe('41.200.1.1')
    expect(body.data[0].user.user_agent).toBe('Mozilla/5.0')
    expect(body.data[0].properties.value).toBe(5000)
    expect(body.data[0].properties.currency).toBe('DZD')
  })

  it('hashes a normalized Algerian phone number', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({ ...BASE, event: 'PlaceAnOrder', eventId: 'e1', value: 100, phone: '0549494949' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user.phone_number).toEqual([
      createHash('sha256').update('213549494949').digest('hex'),
    ])
  })

  it('omits phone_number when the phone does not match Algerian format', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({ ...BASE, event: 'PlaceAnOrder', eventId: 'e1', value: 100, phone: 'garbage' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user.phone_number).toBeUndefined()
  })

  it('includes ttclid and ttp when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({ ...BASE, event: 'ViewContent', eventId: 'e1', value: 0, ttclid: 'tt-1', ttp: 'tp-1' })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].user.ttclid).toBe('tt-1')
    expect(body.data[0].user.ttp).toBe('tp-1')
  })

  it('includes contents when contentId is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await sendTikTokEvent({
      ...BASE, event: 'InitiateCheckout', eventId: 'e1', value: 2000,
      contentId: 'prod-1', contentName: 'T-Shirt', quantity: 2,
    })

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.data[0].properties.contents).toEqual([{
      content_id: 'prod-1', content_type: 'product', content_name: 'T-Shirt', quantity: 2, price: 2000,
    }])
  })

  it('never throws when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    await expect(sendTikTokEvent({ ...BASE, event: 'ViewContent', eventId: 'e1', value: 0 })).resolves.toBeUndefined()
  })

  it('never throws and logs when TikTok returns a non-ok response', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 400, json: async () => ({ message: 'bad token' }),
    }))
    await expect(sendTikTokEvent({ ...BASE, event: 'ViewContent', eventId: 'e1', value: 0 })).resolves.toBeUndefined()
    expect(errSpy).toHaveBeenCalled()
  })
})
