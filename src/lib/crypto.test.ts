import { describe, it, expect, beforeAll } from 'vitest'
import { encryptToken, decryptToken } from './crypto'

beforeAll(() => {
  // 32-byte key, base64
  process.env.TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString('base64')
})

describe('token crypto', () => {
  it('round-trips a value', () => {
    const secret = 'EAAJpageaccesstoken12345'
    const enc = encryptToken(secret)
    expect(enc).not.toContain(secret)
    expect(decryptToken(enc)).toBe(secret)
  })

  it('produces a different ciphertext each call (random iv)', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'))
  })

  it('rejects tampered ciphertext', () => {
    const enc = encryptToken('hello')
    const parts = enc.split(':')
    parts[2] = Buffer.from('tampered').toString('base64')
    expect(() => decryptToken(parts.join(':'))).toThrow()
  })
})
