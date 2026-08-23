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

import { vi, afterEach } from 'vitest'
import { fetchInboundImage } from './meta'

function imageResponse(bytes: Uint8Array, contentType = 'image/jpeg', status = 200) {
  // @types/node's global Uint8Array augmentation types plain array literals as
  // Uint8Array<ArrayBufferLike>, which lib.dom's BodyInit (expecting
  // ArrayBufferView<ArrayBuffer>) rejects under TS 5.9 — a real runtime match,
  // just a version-mismatch typing gap. Cast to bridge it.
  return new Response(bytes as BodyInit, { status, headers: { 'content-type': contentType } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchInboundImage', () => {
  it('returns base64 + mime type for a normal image', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4])
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(bytes)))

    const result = await fetchInboundImage('https://cdn.fbsbx.com/photo.jpg')

    expect(result).toEqual({
      base64: Buffer.from(bytes).toString('base64'),
      mimeType: 'image/jpeg',
    })
  })

  it('strips charset parameters from the content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]), 'image/png; charset=binary')))

    const result = await fetchInboundImage('https://cdn.fbsbx.com/photo.png')

    expect(result?.mimeType).toBe('image/png')
  })

  it('returns null for a non-image content type', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]), 'text/html')))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/oops')).toBeNull()
  })

  it('returns null for a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([1]), 'image/jpeg', 404)))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/gone.jpg')).toBeNull()
  })

  it('returns null for an empty body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imageResponse(new Uint8Array([]))))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/empty.jpg')).toBeNull()
  })

  it('aborts and returns null past the 5MB cap even when Content-Length lies', async () => {
    // Content-Length is optional and attacker-controlled, so the cap has to be
    // enforced on the bytes actually read.
    const big = new Uint8Array(6 * 1024 * 1024)
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(big, { status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': '10' } })
    ))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/huge.jpg')).toBeNull()
  })

  it('returns null instead of throwing when the fetch itself fails', async () => {
    // A thrown error here would kill the whole webhook batch.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down') }))

    expect(await fetchInboundImage('https://cdn.fbsbx.com/photo.jpg')).toBeNull()
  })
})
