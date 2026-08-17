import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let mockStore: { id: string; plan: string } = { id: 'store-1', plan: 'ultimate' }
let page: Record<string, unknown> = { id: 'page-1', store_id: 'store-1', blocks: [{ id: 'b1', type: 'text', props: {}, style: { base: {} } }] }
const updates: Record<string, unknown>[] = []
let revalidateCalled = false

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: mockUser } }) } }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => mockStore,
}))

vi.mock('@/lib/cache/store-cache', () => ({
  revalidateSitePageCache: () => { revalidateCalled = true },
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'site_pages') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({ eq: (_c: string, id: string) => ({ single: async () => ({ data: id === page.id ? page : null }) }) }),
        update: (payload: Record<string, unknown>) => ({
          eq: (_c: string, id: string) => ({
            select: () => ({ single: async () => { updates.push({ id, ...payload }); return { data: { ...page, ...payload }, error: null } } }),
          }),
        }),
      }
    },
  }),
}))

import { POST } from './route'

const params = { params: Promise.resolve({ id: 'page-1' }) }
function makeRequest() {
  return new Request('http://test/api/site-pages/page-1/publish', { method: 'POST' })
}

beforeEach(() => {
  updates.length = 0
  revalidateCalled = false
  mockStore = { id: 'store-1', plan: 'ultimate' }
  page = { id: 'page-1', store_id: 'store-1', blocks: [{ id: 'b1', type: 'text', props: {}, style: { base: {} } }] }
})

describe('POST /api/site-pages/[id]/publish', () => {
  it('copies blocks into published_blocks, flips status, and busts the cache', async () => {
    const res = await POST(makeRequest(), params)
    expect(res.status).toBe(200)
    expect(updates[0]).toMatchObject({ id: 'page-1', published_blocks: page.blocks, status: 'published' })
    expect(revalidateCalled).toBe(true)
  })

  it('refuses a page belonging to another store', async () => {
    mockStore = { id: 'store-OTHER', plan: 'ultimate' }
    const res = await POST(makeRequest(), params)
    expect(res.status).toBe(403)
    expect(updates).toEqual([])
  })

  it('refuses a store below Ultimate', async () => {
    mockStore = { id: 'store-1', plan: 'pro' }
    const res = await POST(makeRequest(), params)
    expect(res.status).toBe(403)
  })
})
