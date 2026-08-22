import { describe, it, expect } from 'vitest'
import { RESERVED_SITE_PAGE_SLUGS, isReservedSlug, slugify } from './reserved-slugs'

describe('RESERVED_SITE_PAGE_SLUGS', () => {
  it('covers every existing top-level segment under src/app/store', () => {
    expect(RESERVED_SITE_PAGE_SLUGS).toEqual(expect.arrayContaining(['p', 'paiement', 'product', 'api']))
  })
})

describe('isReservedSlug', () => {
  it('is true for a reserved slug regardless of case', () => {
    expect(isReservedSlug('p')).toBe(true)
    expect(isReservedSlug('Product')).toBe(true)
  })
  it('is false for a normal slug', () => {
    expect(isReservedSlug('a-propos')).toBe(false)
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('À Propos de Nous')).toBe('a-propos-de-nous')
  })
  it('strips characters outside a-z0-9-', () => {
    expect(slugify('FAQ !!! 2024??')).toBe('faq-2024')
  })
  it('collapses repeated hyphens and trims leading/trailing ones', () => {
    expect(slugify('--hello   world--')).toBe('hello-world')
  })
  it('truncates to 80 characters', () => {
    const long = 'a'.repeat(100)
    expect(slugify(long).length).toBe(80)
  })
  it('handles French ligatures and special characters', () => {
    expect(slugify('Cœur')).toBe('coeur')
    expect(slugify('Cÿ')).toBe('cy')
  })
})
