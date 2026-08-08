import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupIpIntel } from './ip-intel'

describe('lookupIpIntel', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

  it('returns proxy/hosting flag and country on a successful lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', countryCode: 'FR', proxy: true, hosting: false }),
    }))
    const result = await lookupIpIntel('1.2.3.4')
    expect(result).toEqual({ country: 'FR', isProxyOrHosting: true })
  })

  it('fails open (no signal) when the lookup errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const result = await lookupIpIntel('2.2.2.2')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
  })

  it('fails open when the API reports non-success status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'fail' }),
    }))
    const result = await lookupIpIntel('3.3.3.3')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
  })

  it('returns no signal for an unknown/missing IP without calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await lookupIpIntel('unknown')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses IPQualityScore when IPQUALITYSCORE_API_KEY is configured', async () => {
    vi.stubEnv('IPQUALITYSCORE_API_KEY', 'test-key')
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, country_code: 'DZ', proxy: false, vpn: true, fraud_score: 40 }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await lookupIpIntel('9.9.9.9')
    expect(result).toEqual({ country: 'DZ', isProxyOrHosting: true })
    expect(fetchSpy.mock.calls[0][0]).toContain('ipqualityscore.com')
  })

  it('flags a high fraud_score as proxy/hosting-equivalent even with no explicit flags', async () => {
    vi.stubEnv('IPQUALITYSCORE_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, country_code: 'FR', proxy: false, vpn: false, tor: false, fraud_score: 90 }),
    }))
    const result = await lookupIpIntel('9.9.9.10')
    expect(result).toEqual({ country: 'FR', isProxyOrHosting: true })
  })

  it('flags a datacenter/hosting IP (hosting:true) as proxy/hosting-equivalent', async () => {
    vi.stubEnv('IPQUALITYSCORE_API_KEY', 'test-key')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, country_code: 'US', proxy: false, vpn: false, tor: false, hosting: true, fraud_score: 20 }),
    }))
    const result = await lookupIpIntel('35.229.9.101')
    expect(result).toEqual({ country: 'US', isProxyOrHosting: true })
  })

  it('falls back to ip-api.com when IPQualityScore fails', async () => {
    vi.stubEnv('IPQUALITYSCORE_API_KEY', 'test-key')
    const fetchSpy = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'success', countryCode: 'DZ', proxy: false, hosting: false }) })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await lookupIpIntel('9.9.9.11')
    expect(result).toEqual({ country: 'DZ', isProxyOrHosting: false })
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('uses ip-api.com directly when no API key is configured', async () => {
    vi.stubEnv('IPQUALITYSCORE_API_KEY', '')
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'success', countryCode: 'DZ', proxy: false, hosting: false }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const result = await lookupIpIntel('9.9.9.12')
    expect(result).toEqual({ country: 'DZ', isProxyOrHosting: false })
    expect(fetchSpy.mock.calls[0][0]).toContain('ip-api.com')
  })
})
