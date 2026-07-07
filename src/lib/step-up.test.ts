import { describe, it, expect, beforeEach } from 'vitest'
import { signStepUp, verifyStepUp } from './step-up'

beforeEach(() => { process.env.SUPERADMIN_STEPUP_SECRET = 'test-secret-123' })

describe('step-up cookie', () => {
  it('round-trips for the same user within TTL', () => {
    const token = signStepUp('user-1')
    expect(verifyStepUp(token, 'user-1')).toBe(true)
  })
  it('rejects a different user', () => {
    expect(verifyStepUp(signStepUp('user-1'), 'user-2')).toBe(false)
  })
  it('rejects an expired token', () => {
    const past = Date.now() - 10 * 60 * 1000
    const token = signStepUp('user-1', past)
    expect(verifyStepUp(token, 'user-1')).toBe(false)
  })
  it('rejects a tampered signature', () => {
    const token = signStepUp('user-1')
    const [exp] = token.split('.')
    expect(verifyStepUp(`${exp}.deadbeef`, 'user-1')).toBe(false)
  })
  it('rejects null / missing secret', () => {
    expect(verifyStepUp(null, 'user-1')).toBe(false)
    process.env.SUPERADMIN_STEPUP_SECRET = ''
    expect(verifyStepUp(signStepUp('user-1'), 'user-1')).toBe(false)
  })
})
