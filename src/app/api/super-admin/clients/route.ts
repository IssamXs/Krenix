import { NextResponse } from 'next/server'
import { requireSuperAdmin, isAdminContext } from '@/lib/super-admin'

interface StoreLite { id: string; name: string; slug: string; plan: string; subscription_status: string; is_suspended: boolean; owner_id: string }

export async function GET() {
  const auth = await requireSuperAdmin()
  if (!isAdminContext(auth)) return auth
  const admin = auth.admin

  const { data: stores } = await admin.from('stores')
    .select('id, name, slug, plan, subscription_status, is_suspended, owner_id')
    .order('created_at', { ascending: true })
  const byOwner = new Map<string, StoreLite[]>()
  for (const s of (stores ?? []) as StoreLite[]) {
    const arr = byOwner.get(s.owner_id) ?? []
    arr.push(s); byOwner.set(s.owner_id, arr)
  }

  // Resolve emails + banned state via the auth admin API (paginated).
  const emails = new Map<string, { email: string; banned: boolean }>()
  let page = 1
  for (;;) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    const users = data?.users ?? []
    for (const u of users) {
      const banned = !!(u as { banned_until?: string }).banned_until && new Date((u as { banned_until?: string }).banned_until!) > new Date()
      emails.set(u.id, { email: u.email ?? '—', banned })
    }
    if (users.length < 1000) break
    page++
  }

  const clients = [...byOwner.entries()].map(([ownerId, s]) => ({
    ownerId,
    email: emails.get(ownerId)?.email ?? '—',
    banned: emails.get(ownerId)?.banned ?? false,
    storeCount: s.length,
    stores: s.map(x => ({ id: x.id, name: x.name, slug: x.slug, plan: x.plan, subscription_status: x.subscription_status, is_suspended: x.is_suspended })),
  }))
  return NextResponse.json({ clients })
}
