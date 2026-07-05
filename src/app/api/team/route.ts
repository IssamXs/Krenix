import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_TEAM_LIMITS, ULTIMATE_PLANS, type Plan } from '@/types/database'

// Resolve the calling owner's store. Team features start at Ultimate.
async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const { data: store } = await supabase
    .from('stores')
    .select('id, plan')
    .eq('owner_id', user.id)
    .single()
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { storeId: store.id as string, plan: store.plan as Plan, userId: user.id }
}

// GET → members list + seat usage
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data: members } = await admin
    .from('team_members')
    .select('id, invited_email, role, accepted_at, created_at')
    .eq('store_id', s.storeId)
    .order('created_at')
  const limit = PLAN_TEAM_LIMITS[s.plan]
  return NextResponse.json({
    members: members ?? [],
    seatsUsed: 1 + (members?.length ?? 0), // owner occupies one seat
    seatLimit: Number.isFinite(limit) ? limit : null, // null = unlimited
    allowed: ULTIMATE_PLANS.includes(s.plan),
  })
}

// POST { email } → invite a collaborator (seat-limited per plan)
export async function POST(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  if (!ULTIMATE_PLANS.includes(s.plan)) {
    return NextResponse.json({ error: 'Réservé aux plans Ultimate et plus' }, { status: 403 })
  }

  const { email } = await request.json()
  const cleanEmail = String(email ?? '').trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return NextResponse.json({ error: 'Adresse email invalide' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Seat check: owner (1) + existing members < limit
  const { count } = await admin
    .from('team_members')
    .select('id', { count: 'exact', head: true })
    .eq('store_id', s.storeId)
  const seatsUsed = 1 + (count ?? 0)
  const limit = PLAN_TEAM_LIMITS[s.plan]
  if (seatsUsed >= limit) {
    return NextResponse.json(
      { error: `Limite de ${limit} membres atteinte pour votre plan. Passez au plan supérieur pour inviter plus de collaborateurs.` },
      { status: 403 },
    )
  }

  const { data: member, error: insertError } = await admin
    .from('team_members')
    .insert({ store_id: s.storeId, invited_email: cleanEmail, invited_by: s.userId, role: 'member' })
    .select('id, invited_email, role, accepted_at, created_at')
    .single()
  if (insertError) {
    const msg = insertError.code === '23505' ? 'Cette adresse est déjà invitée.' : insertError.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  // Send the Supabase invite email (best-effort — if the user already has an
  // account, Supabase returns an error we can safely ignore; the row stands).
  let inviteSent = false
  try {
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(cleanEmail)
    inviteSent = !inviteError
  } catch { /* SMTP not configured or user exists — invitation row still stands */ }

  return NextResponse.json({ member, inviteSent })
}

// DELETE { id } → remove a member
export async function DELETE(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 })
  const admin = createAdminClient()
  await admin.from('team_members').delete().eq('id', id).eq('store_id', s.storeId)
  return NextResponse.json({ ok: true })
}
