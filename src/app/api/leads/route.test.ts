import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH } from './route'

// Authorization regression test: user A must never be able to PATCH a lead
// that belongs to user B's store, even though the update query itself has no
// store scoping (the route's ownership check is the only thing preventing it).
const mockUser = { id: 'user-A' }

const leads = [
  { id: 'lead-A1', store_id: 'store-A' },
  { id: 'lead-B1', store_id: 'store-B' },
]
const stores = [
  { id: 'store-A', owner_id: 'user-A' },
  { id: 'store-B', owner_id: 'user-B' },
]
const updated: Array<{ id: string; payload: unknown }> = []

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: mockUser } }) },
    from(table: string) {
      if (table === 'stores') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              eq: (_c2: string, ownerId: string) => ({
                maybeSingle: async () => ({ data: stores.find(s => s.id === id && s.owner_id === ownerId) ?? null }),
              }),
            }),
          }),
        }
      }
      if (table === 'leads') {
        return {
          update: (payload: unknown) => ({
            eq: async (_c: string, id: string) => { updated.push({ id, payload }); return { error: null } },
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === 'leads') {
        return {
          select: () => ({
            eq: (_c: string, id: string) => ({
              maybeSingle: async () => ({ data: leads.find(l => l.id === id) ?? null }),
            }),
          }),
        }
      }
      throw new Error(`unexpected table ${table}`)
    },
  }),
}))

beforeEach(() => { updated.length = 0 })

describe('PATCH /api/leads authorization', () => {
  it('refuses to update a lead belonging to another store', async () => {
    const req = new Request('http://test/api/leads', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'lead-B1', status: 'won' }),
    })
    const res = await PATCH(req as never)
    expect(res.status).toBe(403)
    expect(updated).toEqual([])
  })

  it('allows updating your own lead', async () => {
    const req = new Request('http://test/api/leads', {
      method: 'PATCH',
      body: JSON.stringify({ id: 'lead-A1', status: 'won' }),
    })
    const res = await PATCH(req as never)
    expect(res.status).toBe(200)
    expect(updated).toEqual([{ id: 'lead-A1', payload: { status: 'won' } }])
  })
})
