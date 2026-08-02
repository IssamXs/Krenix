import { describe, it, expect } from 'vitest'
import { isSectionVisible } from './landing-sections'
import type { LandingPageContent } from '@/types/database'

const BASE_CONTENT: LandingPageContent = {
  hero: { headline: '', subheadline: '', cta_text: '' },
  benefits: [],
  social_proof: { review_count: '', rating: '', testimonials: [] },
  product_details: { sections: [] },
  urgency: { type: 'stock', text: '' },
  order_form: { title: '' },
}

describe('isSectionVisible', () => {
  it('is visible when hidden_sections is undefined', () => {
    expect(isSectionVisible(BASE_CONTENT, 'benefits')).toBe(true)
  })

  it('is visible when hidden_sections does not include the key', () => {
    const content = { ...BASE_CONTENT, hidden_sections: ['urgency'] as const }
    expect(isSectionVisible(content, 'benefits')).toBe(true)
  })

  it('is hidden when hidden_sections includes the key', () => {
    const content = { ...BASE_CONTENT, hidden_sections: ['benefits'] as const }
    expect(isSectionVisible(content, 'benefits')).toBe(false)
  })

  it('checks each key independently', () => {
    const content = { ...BASE_CONTENT, hidden_sections: ['benefits', 'urgency'] as const }
    expect(isSectionVisible(content, 'social_proof')).toBe(true)
    expect(isSectionVisible(content, 'product_details')).toBe(true)
    expect(isSectionVisible(content, 'urgency')).toBe(false)
  })
})
