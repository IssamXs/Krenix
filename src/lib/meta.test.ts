import { describe, it, expect } from 'vitest'
import { createHmac } from 'crypto'
import { verifyMetaSignature } from './meta'

const SECRET = 'app-secret'
const body = JSON.stringify({ hello: 'world' })
const goodSig = 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex')

describe('verifyMetaSignature', () => {
  it('accepts a valid signature', () => {
    expect(verifyMetaSignature(body, goodSig, SECRET)).toBe(true)
  })
  it('rejects a wrong signature', () => {
    expect(verifyMetaSignature(body, 'sha256=deadbeef', SECRET)).toBe(false)
  })
  it('rejects a missing/blank header', () => {
    expect(verifyMetaSignature(body, '', SECRET)).toBe(false)
    expect(verifyMetaSignature(body, undefined, SECRET)).toBe(false)
  })
  it('rejects a header without the sha256= prefix', () => {
    const raw = createHmac('sha256', SECRET).update(body).digest('hex')
    expect(verifyMetaSignature(body, raw, SECRET)).toBe(false)
  })
})
