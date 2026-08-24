import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockUser = { id: 'user-1' }
let categories: Record<string, unknown>[] = []
let insertedCategory: Record<string, unknown> | null = null
let deletedId: string | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
  }),
}))

vi.mock('@/lib/server-store', () => ({
  resolveActiveStoreServer: async () => ({ id: 'store-1', plan: 'ultimate' }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table !== 'categories') throw new Error(`unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({ data: categories }),
          }),
        }),
        insert: (payload: Record<string, unknown>) => {
          insertedCategory = payload
          return {
            select: () => ({
              single: async () => ({ data: { id: 'cat-new', ...payload }, error: null }),
            }),
          }
        },
        delete: () => ({
          eq: (_col: string, id: string) => {
            deletedId = id
            return { eq: async () => ({ error: null }) }
          },
        }),
      }
    },
  }),
}))

import { GET, POST, DELETE } from './route'

beforeEach(() => {
  categories = [{ id: 'cat-1', store_id: 'store-1', name: 'Couvre matelas', slug: 'couvre-matelas' }]
  insertedCategory = null
  deletedId = null
})

describe('GET /api/categories', () => {
  it('lists the caller store\'s categories', async () => {
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.categories).toEqual(categories)
  })
})

describe('POST /api/categories', () => {
  it('creates a category slugified from the name', async () => {
    const req = new Request('http://test/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name: 'Oreillers Confort' }),
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(insertedCategory).toMatchObject({ store_id: 'store-1', name: 'Oreillers Confort', slug: 'oreillers-confort' })
    expect(data.category.id).toBe('cat-new')
  })

  it('rejects an empty name', async () => {
    const req = new Request('http://test/api/categories', { method: 'POST', body: JSON.stringify({ name: '  ' }) })
    const res = await POST(req)
    expect(res.status).toBe(400)
    expect(insertedCategory).toBeNull()
  })
})

describe('DELETE /api/categories', () => {
  it('deletes a category by id scoped to the caller store', async () => {
    const req = new Request('http://test/api/categories', { method: 'DELETE', body: JSON.stringify({ id: 'cat-1' }) })
    const res = await DELETE(req)
    expect(res.status).toBe(200)
    expect(deletedId).toBe('cat-1')
  })
})
