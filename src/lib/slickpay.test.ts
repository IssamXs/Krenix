import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isSlickpayConfigured, slickpayBaseUrl, verifyWebhookSignature,
  createInvoice, getInvoiceStatus,
} from './slickpay'

beforeEach(() => {
  process.env.SLICKPAY_PUBLIC_KEY = 'pk_test_123'
  process.env.SLICKPAY_MODE = 'sandbox'
  process.env.SLICKPAY_WEBHOOK_SIGNATURE = 'whsig_secret'
  process.env.SLICKPAY_ACCOUNT_UUID = 'acct-uuid-1'
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('config', () => {
  it('is configured when the key is set', () => {
    expect(isSlickpayConfigured()).toBe(true)
  })
  it('picks sandbox vs prod base url from SLICKPAY_MODE', () => {
    process.env.SLICKPAY_MODE = 'sandbox'
    expect(slickpayBaseUrl()).toBe('https://devapi.slick-pay.com/api/v2')
    process.env.SLICKPAY_MODE = 'live'
    expect(slickpayBaseUrl()).toBe('https://prodapi.slick-pay.com/api/v2')
  })
})

describe('verifyWebhookSignature', () => {
  it('accepts the exact configured signature', () => {
    expect(verifyWebhookSignature('whsig_secret')).toBe(true)
  })
  it('rejects a wrong or missing signature', () => {
    expect(verifyWebhookSignature('nope')).toBe(false)
    expect(verifyWebhookSignature(null)).toBe(false)
  })
})

describe('createInvoice', () => {
  it('posts amount, one item, fees:0, urls and returns paymentUrl + id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 3140458, url: 'https://cib.satim.dz/pay?mdOrder=X' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const res = await createInvoice({
      amountDzd: 3000,
      itemName: 'Krenix — Plan Pro',
      buyer: { firstname: 'A', lastname: 'B', email: 'a@b.dz' },
      returnUrl: 'https://site/return',
      webhookUrl: 'https://site/hook',
      metadata: { record_type: 'subscription', record_id: 'r1', store_id: 's1' },
    })

    expect(res).toEqual({ paymentUrl: 'https://cib.satim.dz/pay?mdOrder=X', invoiceId: 3140458 })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://devapi.slick-pay.com/api/v2/users/invoices')
    const body = JSON.parse(opts.body)
    expect(body.amount).toBe(3000)
    expect(body.fees).toBe(0)
    expect(body.items).toEqual([{ name: 'Krenix — Plan Pro', price: 3000, quantity: 1 }])
    expect(body.url).toBe('https://site/return')
    expect(body.webhook_url).toBe('https://site/hook')
    expect(body.webhook_meta_data).toEqual({ record_type: 'subscription', record_id: 'r1', store_id: 's1' })
    expect(opts.headers.Authorization).toBe('Bearer pk_test_123')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 422, json: async () => ({ message: 'The amount field is required.' }),
    }))
    await expect(createInvoice({
      amountDzd: 50, itemName: 'x', buyer: { firstname: 'A', lastname: 'B', email: 'a@b.dz' }, returnUrl: 'u',
    })).rejects.toThrow('The amount field is required.')
  })
})

describe('getInvoiceStatus', () => {
  it('maps completed:1 to paid', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: 1, completed: 1, data: { id: 1, completed: 1 } }),
    }))
    expect(await getInvoiceStatus(1)).toBe('paid')
  })
  it('maps completed:0 to pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: 1, completed: 0, data: { id: 1, completed: 0 } }),
    }))
    expect(await getInvoiceStatus(1)).toBe('pending')
  })
})
