import { describe, it, expect } from 'vitest'
import { isValidAlgerianPhone, toE164Algeria } from './phone'

describe('isValidAlgerianPhone', () => {
  it('accepts valid 05/06/07 numbers', () => {
    expect(isValidAlgerianPhone('0555123456')).toBe(true)
    expect(isValidAlgerianPhone('0655123456')).toBe(true)
    expect(isValidAlgerianPhone('0755123456')).toBe(true)
  })

  it('accepts numbers written with spaces', () => {
    expect(isValidAlgerianPhone('05 55 12 34 56')).toBe(true)
  })

  it('rejects a wrong prefix', () => {
    expect(isValidAlgerianPhone('0855123456')).toBe(false)
    expect(isValidAlgerianPhone('1555123456')).toBe(false)
  })

  it('rejects the wrong length', () => {
    expect(isValidAlgerianPhone('055512345')).toBe(false)
    expect(isValidAlgerianPhone('05551234567')).toBe(false)
  })

  it('rejects non-numeric characters', () => {
    expect(isValidAlgerianPhone('05551234ab')).toBe(false)
  })
})

describe('toE164Algeria', () => {
  it('converts domestic format to E.164', () => {
    expect(toE164Algeria('0555123456')).toBe('+213555123456')
  })

  it('strips spaces before converting', () => {
    expect(toE164Algeria('05 55 12 34 56')).toBe('+213555123456')
  })
})
