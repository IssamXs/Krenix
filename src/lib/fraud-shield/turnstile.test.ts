import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { verifyTurnstileToken } from './turnstile'

describe('verifyTurnstileToken', () => {
  const ORIGINAL_ENV = process.env.TURNSTILE_SECRET_KEY

  beforeEach(() => { process.env.TURNSTILE_SECRET_KEY = 'test-secret' })
  afterEach(() => {
    vi.unstubAllGlobals()
    process.env.TURNSTILE_SECRET_KEY = ORIGINAL_ENV
  })

  it('returns true when Cloudflare confirms the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true }) }))
    expect(await verifyTurnstileToken('good-token', '1.2.3.4')).toBe(true)
  })

  it('returns false when Cloudflare rejects the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: false }) }))
    expect(await verifyTurnstileToken('bad-token', '1.2.3.4')).toBe(false)
  })

  it('returns false when no token is provided', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await verifyTurnstileToken(null, '1.2.3.4')).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails open when TURNSTILE_SECRET_KEY is not configured', async () => {
    process.env.TURNSTILE_SECRET_KEY = ''
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    expect(await verifyTurnstileToken('any-token', '1.2.3.4')).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('fails open when the Cloudflare call errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    expect(await verifyTurnstileToken('good-token', '1.2.3.4')).toBe(true)
  })
})
