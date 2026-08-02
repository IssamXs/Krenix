import { describe, it, expect, vi, beforeEach } from 'vitest'

let updatedPatch: Record<string, unknown> | null = null
let authResult: unknown = { admin: { from: () => ({ update: (p: Record<string, unknown>) => { updatedPatch = p; return { eq: async () => ({ error: null }) } } }) }, userId: 'admin-1' }

vi.mock('@/lib/super-admin', () => ({
  requireSuperAdmin: async () => authResult,
  isAdminContext: (a: unknown) => !!(a as { admin?: unknown }).admin,
  logAdminAction: vi.fn().mockResolvedValue(undefined),
}))

import { POST } from './route'

beforeEach(() => {
  updatedPatch = null
  authResult = { admin: { from: () => ({ update: (p: Record<string, unknown>) => { updatedPatch = p; return { eq: async () => ({ error: null }) } } }) }, userId: 'admin-1' }
})

describe('POST /api/super-admin/stores/[id]/fraud-shield', () => {
  it('enables the flag', async () => {
    const req = new Request('http://test', { method: 'POST', body: JSON.stringify({ enabled: true }) })
    const res = await POST(req, { params: Promise.resolve({ id: 'store-1' }) })
    expect(res.status).toBe(200)
    expect(updatedPatch).toEqual({ fraud_shield_enabled: true })
  })

  it('disables the flag', async () => {
    const req = new Request('http://test', { method: 'POST', body: JSON.stringify({ enabled: false }) })
    const res = await POST(req, { params: Promise.resolve({ id: 'store-1' }) })
    expect(res.status).toBe(200)
    expect(updatedPatch).toEqual({ fraud_shield_enabled: false })
  })

  it('returns whatever requireSuperAdmin returns when the caller is not an admin', async () => {
    authResult = new Response('nope', { status: 403 })
    const req = new Request('http://test', { method: 'POST', body: JSON.stringify({ enabled: true }) })
    const res = await POST(req, { params: Promise.resolve({ id: 'store-1' }) })
    expect(res.status).toBe(403)
    expect(updatedPatch).toBeNull()
  })
})
