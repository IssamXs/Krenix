import { describe, it, expect } from 'vitest'
import { SITE_BUILDER_ENABLED } from './feature-flag'

describe('SITE_BUILDER_ENABLED', () => {
  it('is currently locked (feature intentionally disabled)', () => {
    expect(SITE_BUILDER_ENABLED).toBe(false)
  })
})
