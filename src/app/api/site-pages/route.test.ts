import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string } = { id: 'store-1', plan: 'ultimate' }
const inserted: Record<string, unknown>[] = []
const existingSlugs = new Set<string>()

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

// The route itself is temporarily locked behind SITE_BUILDER_ENABLED; these
// tests exercise the real underlying logic, so treat it as enabled here.
vi.mock('@/lib/site-builder/feature-flag', () => ({ SITE_BUILDER_ENABLED: true }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'site_pages') throw new Error(`unexpected table ${table}`)
      return {
        insert: (payload: Record<string, unknown>) => {
          if (existingSlugs.has(payload.slug as string)) {
            return { select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) }) }
          }
          inserted.push(payload)
          return { select: () => ({ single: async () => ({ data: { id: 'page-1', ...payload }, error: null }) }) }
        },
      }
    },
  }),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://test/api/site-pages', { method: 'POST', body: JSON.stringify(body) })
}

beforeEach(() => {
  inserted.length = 0
  existingSlugs.clear()
  mockStore = { id: 'store-1', plan: 'ultimate' }
})

describe('POST /api/site-pages', () => {
  it('creates a page for an Ultimate+ store', async () => {
    const res = await POST(makeRequest({ title: 'À propos', slug: 'a-propos' }))
    expect(res.status).toBe(200)
    expect(inserted[0]).toMatchObject({ store_id: 'store-1', title: 'À propos', slug: 'a-propos', blocks: [] })
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro' }
    const res = await POST(makeRequest({ title: 'À propos', slug: 'a-propos' }))
    expect(res.status).toBe(403)
    expect(inserted).toEqual([])
  })

  it('refuses a reserved slug', async () => {
    const res = await POST(makeRequest({ title: 'Produits', slug: 'product' }))
    expect(res.status).toBe(400)
    expect(inserted).toEqual([])
  })

  it('refuses a missing title', async () => {
    const res = await POST(makeRequest({ title: '  ', slug: 'x' }))
    expect(res.status).toBe(400)
  })

  it('returns 409 on a duplicate slug', async () => {
    existingSlugs.add('faq')
    const res = await POST(makeRequest({ title: 'FAQ', slug: 'faq' }))
    expect(res.status).toBe(409)
  })

  it('accepts an initial blocks array from a starter template', async () => {
    const blocks = [{ id: 'b1', type: 'text', props: { text: 'hi' }, style: { base: {} } }]
    const res = await POST(makeRequest({ title: 'Promo', slug: 'promo', blocks }))
    expect(res.status).toBe(200)
    expect(inserted[0]).toMatchObject({ blocks })
  })
})
