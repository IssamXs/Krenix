import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'

// Resolve the calling owner's store.
async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const store = await resolveActiveStoreServer(supabase, user.id, 'id')
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { storeId: store.id as string }
}

function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

// GET → list the caller store's categories
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const admin = createAdminClient()
  const { data: categories } = await admin
    .from('categories')
    .select('id, store_id, name, slug, created_at')
    .eq('store_id', s.storeId)
    .order('name')
  return NextResponse.json({ categories: categories ?? [] })
}

// POST { name } → create a category
export async function POST(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { name } = await request.json()
  const cleanName = String(name ?? '').trim().slice(0, 60)
  if (!cleanName) {
    return NextResponse.json({ error: 'Le nom de la catégorie est requis.' }, { status: 400 })
  }
  const slug = slugify(cleanName)
  if (!slug) {
    return NextResponse.json({ error: 'Nom de catégorie invalide.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: category, error } = await admin
    .from('categories')
    .insert({ store_id: s.storeId, name: cleanName, slug })
    .select('id, store_id, name, slug, created_at')
    .single()

  if (error) {
    const duplicate = error.code === '23505'
    return NextResponse.json(
      { error: duplicate ? 'Une catégorie avec ce nom existe déjà.' : 'Erreur lors de la création.' },
      { status: duplicate ? 409 : 500 },
    )
  }
  return NextResponse.json({ category })
}

// DELETE { id } → remove a category (products keep their row, category_id → NULL via FK ON DELETE SET NULL)
export async function DELETE(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'Identifiant requis.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('categories')
    .delete()
    .eq('id', id)
    .eq('store_id', s.storeId)

  if (error) return NextResponse.json({ error: 'Erreur lors de la suppression.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
