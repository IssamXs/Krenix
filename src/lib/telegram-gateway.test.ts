import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { checkSendAbility, sendVerificationMessage, checkVerificationStatus } from './telegram-gateway'

beforeEach(() => {
  process.env.TELEGRAM_GATEWAY_API_TOKEN = 'test-token'
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('checkSendAbility', () => {
  it('reports deliverable and returns the request id on ok:true', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { request_id: 'req-1', phone_number: '+213555123456' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await checkSendAbility('+213555123456')

    expect(result).toEqual({ deliverable: true, requestId: 'req-1' })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://gatewayapi.telegram.org/checkSendAbility')
    expect(opts.headers.Authorization).toBe('Bearer test-token')
    expect(JSON.parse(opts.body)).toEqual({ phone_number: '+213555123456' })
  })

  it('reports not deliverable on ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'PHONE_NUMBER_INVALID' }),
    }))

    expect(await checkSendAbility('+213000000000')).toEqual({ deliverable: false })
  })

  it('handles a thrown fetch rejection gracefully instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))

    await expect(checkSendAbility('+213555123456')).resolves.toEqual({ deliverable: false })
  })
})

describe('sendVerificationMessage', () => {
  it('sends the request_id from checkSendAbility to make the call free', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        result: { request_id: 'req-2', phone_number: '+213555123456', verification_status: { status: 'code_sent', code_length: 6 } },
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendVerificationMessage('+213555123456', 'req-1')

    expect(result).toEqual({ requestId: 'req-2', codeLength: 6 })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ phone_number: '+213555123456', code_length: 6, ttl: 600, request_id: 'req-1' })
  })

  it('omits request_id when none was given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { request_id: 'req-3', phone_number: 'x' } }),
    }))

    await sendVerificationMessage('+213555123456')

    const fetchMock = vi.mocked(fetch)
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).not.toHaveProperty('request_id')
  })

  it('returns null on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: false, error: 'nope' }) }))
    expect(await sendVerificationMessage('+213555123456')).toBeNull()
  })
})

describe('checkVerificationStatus', () => {
  it('returns code_valid on a matching code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'code_valid' } } }),
    }))
    expect(await checkVerificationStatus('req-1', '123456')).toBe('code_valid')
  })

  it('returns expired when Telegram reports expiry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'expired' } } }),
    }))
    expect(await checkVerificationStatus('req-1', '123456')).toBe('expired')
  })

  it('returns code_invalid on a wrong code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: { verification_status: { status: 'code_invalid' } } }),
    }))
    expect(await checkVerificationStatus('req-1', '000000')).toBe('code_invalid')
  })

  it('returns error (not code_invalid) when the token is missing', async () => {
    delete process.env.TELEGRAM_GATEWAY_API_TOKEN
    vi.stubGlobal('fetch', vi.fn())
    expect(await checkVerificationStatus('req-1', '123456')).toBe('error')
  })

  it('returns error (not code_invalid) on a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')))
    expect(await checkVerificationStatus('req-1', '123456')).toBe('error')
  })

  it('returns error (not code_invalid) when the Gateway responds ok:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: false, error: 'REQUEST_ID_INVALID' }),
    }))
    expect(await checkVerificationStatus('req-1', '123456')).toBe('error')
  })
})
