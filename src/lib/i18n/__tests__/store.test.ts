import { describe, it, expect } from 'vitest'
import { getStoreLocale, isStoreRTL } from '../store'

describe('getStoreLocale', () => {
  it('defaults to fr when storeLanguage is absent', () => {
    expect(getStoreLocale({ settings: {} })).toBe('fr')
    expect(getStoreLocale({ settings: null })).toBe('fr')
  })
  it('returns ar when set to ar', () => {
    expect(getStoreLocale({ settings: { storeLanguage: 'ar' } })).toBe('ar')
  })
  it('treats unknown values as fr (defensive)', () => {
    expect(getStoreLocale({ settings: { storeLanguage: 'xx' as never } })).toBe('fr')
  })
})

describe('isStoreRTL', () => {
  it('true only for ar', () => {
    expect(isStoreRTL({ settings: { storeLanguage: 'ar' } })).toBe(true)
    expect(isStoreRTL({ settings: {} })).toBe(false)
  })
})
