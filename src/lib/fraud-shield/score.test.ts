import { describe, it, expect } from 'vitest'
import { computeFraudRiskScore, type FraudSignalInputs } from './score'

const BASE: FraudSignalInputs = {
  ipCountry: 'DZ',
  ipIsProxyOrHosting: false,
  fingerprintSeenRecently: false,
  hadMovement: true,
  formFillMs: 8000,
  currentOrderTimestamp: '2026-07-30T08:09:55.000Z',
  previousOrderTimestamps: [],
}

describe('computeFraudRiskScore', () => {
  it('scores a clean, human-looking order at 0 with no signals', () => {
    const result = computeFraudRiskScore(BASE)
    expect(result.score).toBe(0)
    expect(result.signals).toEqual({})
  })

  it('flags a datacenter/proxy IP', () => {
    const result = computeFraudRiskScore({ ...BASE, ipIsProxyOrHosting: true })
    expect(result.score).toBe(25)
    expect(result.signals.datacenter_ip.points).toBe(25)
  })

  it('flags device fingerprint reuse', () => {
    const result = computeFraudRiskScore({ ...BASE, fingerprintSeenRecently: true })
    expect(result.score).toBe(30)
    expect(result.signals.fingerprint_reuse.points).toBe(30)
  })

  it('flags absent human behavior (no movement + fast fill)', () => {
    const result = computeFraudRiskScore({ ...BASE, hadMovement: false, formFillMs: 900 })
    expect(result.score).toBe(15)
    expect(result.signals.no_human_behavior.points).toBe(15)
  })

  it('does not flag fast-fill alone if there was mouse movement', () => {
    const result = computeFraudRiskScore({ ...BASE, hadMovement: true, formFillMs: 900 })
    expect(result.signals.no_human_behavior).toBeUndefined()
  })

  it('flags a non-Algeria IP country', () => {
    const result = computeFraudRiskScore({ ...BASE, ipCountry: 'FR' })
    expect(result.score).toBe(10)
    expect(result.signals.ip_country_mismatch.detail).toContain('FR')
  })

  it('flags a regular timing pattern matching the original bot screenshot (~2-4 min gaps)', () => {
    const result = computeFraudRiskScore({
      ...BASE,
      currentOrderTimestamp: '2026-07-30T08:09:55.000Z',
      previousOrderTimestamps: [
        '2026-07-30T08:07:25.000Z',
        '2026-07-30T08:04:55.000Z',
        '2026-07-30T08:02:25.000Z',
        '2026-07-30T07:59:55.000Z',
      ],
    })
    expect(result.score).toBe(20)
    expect(result.signals.timing_regularity).toBeDefined()
  })

  it('does not flag irregular, human-paced order gaps', () => {
    const result = computeFraudRiskScore({
      ...BASE,
      currentOrderTimestamp: '2026-07-30T12:00:00.000Z',
      previousOrderTimestamps: [
        '2026-07-30T10:15:00.000Z',
        '2026-07-30T08:50:00.000Z',
        '2026-07-30T08:40:00.000Z',
        '2026-07-30T05:00:00.000Z',
      ],
    })
    expect(result.signals.timing_regularity).toBeUndefined()
  })

  it('does not flag timing with fewer than 4 data points', () => {
    const result = computeFraudRiskScore({
      ...BASE,
      previousOrderTimestamps: ['2026-07-30T08:07:22.000Z'],
    })
    expect(result.signals.timing_regularity).toBeUndefined()
  })

  it('combines multiple signals and caps the score at 100', () => {
    const result = computeFraudRiskScore({
      ipCountry: 'FR',
      ipIsProxyOrHosting: true,
      fingerprintSeenRecently: true,
      hadMovement: false,
      formFillMs: 500,
      currentOrderTimestamp: '2026-07-30T08:09:55.000Z',
      previousOrderTimestamps: [
        '2026-07-30T08:07:25.000Z',
        '2026-07-30T08:04:55.000Z',
        '2026-07-30T08:02:25.000Z',
        '2026-07-30T07:59:55.000Z',
      ],
    })
    // 25 + 30 + 15 + 10 + 20 = 100
    expect(result.score).toBe(100)
    expect(Object.keys(result.signals).sort()).toEqual(
      ['datacenter_ip', 'fingerprint_reuse', 'ip_country_mismatch', 'no_human_behavior', 'timing_regularity'].sort(),
    )
  })
})
