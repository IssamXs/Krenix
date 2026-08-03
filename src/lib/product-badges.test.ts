import { describe, it, expect } from 'vitest'
import { BADGE_CATALOG, canUseBadges, getDisplayBadges, formatBadgeLabel } from './product-badges'

describe('canUseBadges', () => {
  it('allows ultimate and above', () => {
    expect(canUseBadges('ultimate')).toBe(true)
    expect(canUseBadges('growth')).toBe(true)
    expect(canUseBadges('enterprise')).toBe(true)
  })

  it('rejects basic and pro', () => {
    expect(canUseBadges('basic')).toBe(false)
    expect(canUseBadges('pro')).toBe(false)
  })
})

describe('getDisplayBadges', () => {
  it('returns an empty array for null/undefined/empty input', () => {
    expect(getDisplayBadges(null)).toEqual([])
    expect(getDisplayBadges(undefined)).toEqual([])
    expect(getDisplayBadges([])).toEqual([])
  })

  it('resolves ids to catalog defs in catalog priority order, regardless of input order', () => {
    const result = getDisplayBadges(['promo', 'winner'])
    expect(result.map(b => b.id)).toEqual(['winner', 'promo'])
  })

  it('ignores unknown ids', () => {
    const result = getDisplayBadges(['winner', 'not_a_real_badge'])
    expect(result.map(b => b.id)).toEqual(['winner'])
  })

  it('caps to `max` when provided', () => {
    const result = getDisplayBadges(['winner', 'bestseller', 'promo'], 2)
    expect(result.map(b => b.id)).toEqual(['winner', 'bestseller'])
  })
})

describe('formatBadgeLabel', () => {
  it('returns plain label when showEmojis is false', () => {
    const winner = BADGE_CATALOG.find(b => b.id === 'winner')!
    expect(formatBadgeLabel(winner, false)).toBe('Winner')
  })

  it('prefixes the emoji when showEmojis is true and the badge has one', () => {
    const winner = BADGE_CATALOG.find(b => b.id === 'winner')!
    expect(formatBadgeLabel(winner, true)).toBe('🏆 Winner')
  })

  it('falls back to plain label when showEmojis is true but the badge has no emoji', () => {
    const promo = BADGE_CATALOG.find(b => b.id === 'promo')!
    expect(promo.emoji).toBeNull()
    expect(formatBadgeLabel(promo, true)).toBe('En promo')
  })
})

describe('BADGE_CATALOG', () => {
  it('has exactly 10 badges with unique ids', () => {
    expect(BADGE_CATALOG).toHaveLength(10)
    expect(new Set(BADGE_CATALOG.map(b => b.id)).size).toBe(10)
  })
})
