import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockUser: { current: { id: string } | null } = { current: { id: 'user-1' } }
let rateLimitOk = true
let checkResult: 'code_valid' | 'code_invalid' | 'expired' | 'error' = 'code_valid'
const state: { row: Record<string, unknown> | null } = { row: { telegram_request_id: 'vr-1', phone_verified: false } }

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser.current } }) },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'phone_verifications') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: async () => { state.row = { ...(state.row ?? {}), ...payload }; return { error: null } },
        }),
      }
    },
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => rateLimitOk,
  requestIp: () => '1.2.3.4',
}))

vi.mock('@/lib/telegram-gateway', () => ({
  checkVerificationStatus: async () => checkResult,
}))

beforeEach(() => {
  mockUser.current = { id: 'user-1' }
  rateLimitOk = true
  checkResult = 'code_valid'
  state.row = { telegram_request_id: 'vr-1', phone_verified: false }
})

function callCheck(body: unknown) {
  const req = new Request('http://test/api/auth/verify-phone/check', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(req as never)
}

describe('POST /api/auth/verify-phone/check', () => {
  it('rejects an unauthenticated caller', async () => {
    mockUser.current = null
    const res = await callCheck({ code: '123456' })
    expect(res.status).toBe(401)
  })

  it('rejects when rate limited', async () => {
    rateLimitOk = false
    const res = await callCheck({ code: '123456' })
    expect(res.status).toBe(429)
  })

  it('rejects when there is no verification in progress', async () => {
    state.row = null
    const res = await callCheck({ code: '123456' })
    expect(res.status).toBe(400)
  })

  it('marks phone_verified on a valid code', async () => {
    const res = await callCheck({ code: '123456' })
    const data = await res.json()
    expect(data.status).toBe('code_valid')
    expect(state.row?.phone_verified).toBe(true)
    expect(state.row?.verified_at).toBeTruthy()
  })

  it('does not verify on an invalid code', async () => {
    checkResult = 'code_invalid'
    const res = await callCheck({ code: '000000' })
    const data = await res.json()
    expect(data.status).toBe('code_invalid')
    expect(state.row?.phone_verified).toBe(false)
  })

  it('does not verify and surfaces "error" distinctly when the check itself fails', async () => {
    checkResult = 'error'
    const res = await callCheck({ code: '123456' })
    const data = await res.json()
    expect(data.status).toBe('error')
    expect(state.row?.phone_verified).toBe(false)
  })
})
