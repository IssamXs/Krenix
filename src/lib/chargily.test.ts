import { describe, it, expect, afterEach, vi } from 'vitest'
import crypto from 'crypto'
import { chargilyBaseUrl, verifyChargilySignature, createCheckout, getCheckoutStatus, validateChargilyKey } from './chargily'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('chargilyBaseUrl', () => {
  it('picks test vs live url from the mode', () => {
    expect(chargilyBaseUrl('test')).toBe('https://pay.chargily.net/test/api/v2')
    expect(chargilyBaseUrl('live')).toBe('https://pay.chargily.net/api/v2')
    expect(chargilyBaseUrl(undefined)).toBe('https://pay.chargily.net/test/api/v2')
  })
})

describe('verifyChargilySignature', () => {
  it('accepts a signature computed from the same key', () => {
    const sig = crypto.createHmac('sha256', 'sk_test_abc').update('{"a":1}', 'utf8').digest('hex')
    expect(verifyChargilySignature('{"a":1}', sig, 'sk_test_abc')).toBe(true)
  })
  it('rejects a wrong signature or missing key/signature', () => {
    expect(verifyChargilySignature('{"a":1}', 'nope', 'sk_test_abc')).toBe(false)
    expect(verifyChargilySignature('{"a":1}', null, 'sk_test_abc')).toBe(false)
    expect(verifyChargilySignature('{"a":1}', 'nope', '')).toBe(false)
  })
})

describe('validateChargilyKey', () => {
  it('returns true on a successful /balance response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
    expect(await validateChargilyKey('sk_test_abc')).toBe(true)
  })
  it('returns false on a failed response or empty key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await validateChargilyKey('sk_test_abc')).toBe(false)
    expect(await validateChargilyKey('')).toBe(false)
  })
})

describe('createCheckout', () => {
  it('posts amount, urls, metadata and returns checkoutUrl + id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'chk_1', checkout_url: 'https://pay.chargily.net/checkout/chk_1' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createCheckout({
      amountDzd: 3000,
      itemName: 'Krenix — Plan Pro',
      successUrl: 'https://site/return',
      webhookUrl: 'https://site/hook',
      metadata: { record_type: 'subscription', record_id: 'r1' },
      key: 'sk_test_abc',
    })

    expect(res).toEqual({ checkoutUrl: 'https://pay.chargily.net/checkout/chk_1', id: 'chk_1' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://pay.chargily.net/test/api/v2/checkouts')
    const body = JSON.parse(opts.body)
    expect(body.amount).toBe(3000)
    expect(body.currency).toBe('dzd')
    expect(body.success_url).toBe('https://site/return')
    expect(body.webhook_endpoint).toBe('https://site/hook')
    expect(opts.headers.Authorization).toBe('Bearer sk_test_abc')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ message: 'The amount field is required.' }),
    }))
    await expect(createCheckout({
      amountDzd: 50, itemName: 'x', successUrl: 'u', key: 'sk_test_abc',
    })).rejects.toThrow('The amount field is required.')
  })
})

describe('getCheckoutStatus', () => {
  it('maps status:"paid" to paid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'paid' }) }))
    expect(await getCheckoutStatus('chk_1', 'sk_test_abc')).toBe('paid')
  })
  it('maps any other status to pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'pending' }) }))
    expect(await getCheckoutStatus('chk_1', 'sk_test_abc')).toBe('pending')
  })
})
