import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
const insertedLandingPages: Record<string, unknown>[] = []
const generateLandingPageCalls: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from(table: string) {
      if (table === 'landing_pages') {
        return {
          insert: (payload: Record<string, unknown>) => {
            insertedLandingPages.push(payload)
            return {
              select: () => ({
                single: async () => ({ data: { id: 'lp-1', ...payload }, error: null }),
              }),
            }
          },
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'credit_usage') {
        return { insert: async () => ({ error: null }) }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => ({ id: 'store-1', settings: {} }),
  resolveAccountStore: async () => ({ id: 'account-1', ai_credits: 20, purchased_credits: 0 }),
}))

vi.mock('@/lib/credits', () => ({
  spendAccountCredits: async () => true,
  refundAccountCredits: async () => {},
}))

vi.mock('@/lib/claude', () => ({
  generateLandingPage: vi.fn(async (params: Record<string, unknown>) => {
    generateLandingPageCalls.push(params)
    return {
      hero: { headline: 'Titre', subheadline: 'Sous-titre', cta_text: 'Commander' },
      benefits: [],
      social_proof: { review_count: '0', rating: '5', testimonials: [] },
      product_details: { sections: [] },
      urgency: { type: 'stock', text: '' },
      order_form: { title: 'Commander' },
    }
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/ai/landing-page', { method: 'POST', body: JSON.stringify(body) })
}

const VALID_BODY = {
  productName: 'Montre connectée',
  price: 2990,
  stock: 10,
  style: 'impact',
  language: 'fr',
}

beforeEach(() => {
  insertedLandingPages.length = 0
  generateLandingPageCalls.length = 0
})

describe('POST /api/ai/landing-page — brief threading', () => {
  it('passes the brief through to generateLandingPage and stores it in content._meta', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, brief: 'cible les mamans' }))
    expect(res.status).toBe(200)
    expect(generateLandingPageCalls[0]).toMatchObject({ brief: 'cible les mamans' })
    const inserted = insertedLandingPages[0]
    const content = inserted.content as { _meta?: { brief?: string } }
    expect(content._meta?.brief).toBe('cible les mamans')
  })

  it('passes null and stores no brief when omitted', async () => {
    const res = await POST(makeRequest(VALID_BODY))
    expect(res.status).toBe(200)
    expect(generateLandingPageCalls[0]).toMatchObject({ brief: null })
    const inserted = insertedLandingPages[0]
    const content = inserted.content as { _meta?: { brief?: string } }
    expect(content._meta?.brief).toBeUndefined()
  })
})
