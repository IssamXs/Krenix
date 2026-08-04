import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'

const mockUser: { current: { id: string } | null } = { current: { id: 'user-1' } }
let rateLimitOk = true
let sendAbility: { deliverable: boolean; requestId?: string } = { deliverable: true, requestId: 'ra-1' }
let sendResult: { requestId: string; codeLength: number } | null = { requestId: 'vr-1', codeLength: 6 }
const state: { row: Record<string, unknown> | null } = { row: null }

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
        upsert: async (payload: Record<string, unknown>) => {
          state.row = { ...(state.row ?? {}), ...payload }
          return { error: null }
        },
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
  checkSendAbility: async () => sendAbility,
  sendVerificationMessage: async () => sendResult,
}))

beforeEach(() => {
  mockUser.current = { id: 'user-1' }
  rateLimitOk = true
  sendAbility = { deliverable: true, requestId: 'ra-1' }
  sendResult = { requestId: 'vr-1', codeLength: 6 }
  state.row = null
})

function callSend(body: unknown) {
  const req = new Request('http://test/api/auth/verify-phone/send', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return POST(req as never)
}

describe('POST /api/auth/verify-phone/send', () => {
  it('rejects an unauthenticated caller', async () => {
    mockUser.current = null
    const res = await callSend({ phone: '0555123456' })
    expect(res.status).toBe(401)
  })

  it('rejects when rate limited', async () => {
    rateLimitOk = false
    const res = await callSend({ phone: '0555123456' })
    expect(res.status).toBe(429)
  })

  it('rejects an invalid Algerian phone format', async () => {
    const res = await callSend({ phone: '12345' })
    expect(res.status).toBe(400)
  })

  it('reports non-deliverable without sending a code — no charge incurred', async () => {
    sendAbility = { deliverable: false }
    const res = await callSend({ phone: '0555123456' })
    const data = await res.json()
    expect(data.deliverable).toBe(false)
    expect(state.row?.phone).toBe('+213555123456')
    expect(state.row?.telegram_request_id).toBeUndefined()
  })

  it('sends a code and stores the Telegram request id on success', async () => {
    const res = await callSend({ phone: '0555123456' })
    const data = await res.json()
    expect(data.deliverable).toBe(true)
    expect(data.codeLength).toBe(6)
    expect(data.phone).toBe('+213555123456')
    expect(state.row?.telegram_request_id).toBe('vr-1')
  })

  it('returns 502 and persists no telegram_request_id when the Telegram send fails', async () => {
    sendResult = null
    const res = await callSend({ phone: '0555123456' })
    expect(res.status).toBe(502)
    expect(state.row?.telegram_request_id).toBeUndefined()
  })

  it('reuses the stored phone on resend when no phone is given', async () => {
    state.row = { phone: '+213555123456', phone_verified: false }
    const res = await callSend({})
    const data = await res.json()
    expect(data.phone).toBe('+213555123456')
  })

  it('errors when neither a phone is given nor one is on file', async () => {
    const res = await callSend({})
    expect(res.status).toBe(400)
  })
})
