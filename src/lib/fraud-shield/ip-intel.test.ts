import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupIpIntel } from './ip-intel'

describe('lookupIpIntel', () => {
  afterEach(() => vi.unstubAllGlobals())

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
    const result = await lookupIpIntel('1.2.3.4')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
  })

  it('fails open when the API reports non-success status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'fail' }),
    }))
    const result = await lookupIpIntel('bogus')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
  })

  it('returns no signal for an unknown/missing IP without calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const result = await lookupIpIntel('unknown')
    expect(result).toEqual({ country: null, isProxyOrHosting: false })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
