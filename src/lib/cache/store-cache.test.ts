import { describe, it, expect } from 'vitest'
import { redactStoreSecrets } from './store-cache'

describe('redactStoreSecrets', () => {
  it('strips tiktokAccessToken while preserving every other settings field', () => {
    const store = {
      id: 'store-1',
      settings: { tiktokAccessToken: 'super-secret', tiktokPixelId: 'PIXEL1', gtmId: 'GTM-X' },
    }
    const result = redactStoreSecrets(store)
    expect(result.settings).not.toHaveProperty('tiktokAccessToken')
    expect(result.settings).toEqual({ tiktokPixelId: 'PIXEL1', gtmId: 'GTM-X' })
    expect(result.id).toBe('store-1')
  })

  it('does not mutate the original object', () => {
    const store = { id: 'store-1', settings: { tiktokAccessToken: 'super-secret' } }
    redactStoreSecrets(store)
    expect(store.settings.tiktokAccessToken).toBe('super-secret')
  })

  it('is a no-op when settings has no tiktokAccessToken', () => {
    const store = { id: 'store-1', settings: { gtmId: 'GTM-X' } }
    expect(redactStoreSecrets(store).settings).toEqual({ gtmId: 'GTM-X' })
  })

  it('passes through unchanged when settings is missing or null', () => {
    expect(redactStoreSecrets({ id: 'store-1', settings: null }).settings).toBeNull()
    const noSettings: { id: string; settings?: Record<string, unknown> | null } = { id: 'store-1' }
    expect(redactStoreSecrets(noSettings)).toEqual({ id: 'store-1' })
  })
})
