import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Buckets that this endpoint is allowed to write to. Storage takeovers
// from user-controlled `bucket` are the reason this list is closed.
const ALLOWED_BUCKETS = new Set(['store-logos', 'product-images'])

// Only images. Anything else (svg with scripts, .html, .php) is refused.
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])
const ALLOWED_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
const MAX_BYTES = 5 * 1024 * 1024

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const admin = createAdminClient()

  // The uploader must own at least one store. We use that store's id as the
  // required path prefix so a caller cannot write under another tenant's folder.
  const { data: stores } = await admin.from('stores').select('id').eq('owner_id', user.id)
  const ownedStoreIds = new Set((stores ?? []).map((s: { id: string }) => s.id))
  if (ownedStoreIds.size === 0) {
    return NextResponse.json({ error: 'Aucune boutique' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 })
  }

  const file = formData.get('file')
  const bucket = String(formData.get('bucket') ?? '')
  const rawPath = String(formData.get('path') ?? '')

  if (!(file instanceof File)) return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 })
  if (!ALLOWED_BUCKETS.has(bucket)) return NextResponse.json({ error: 'Bucket non autorisé' }, { status: 400 })

  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Fichier trop volumineux (max 5 Mo)' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'Fichier vide' }, { status: 400 })
  if (!ALLOWED_MIME.has(file.type)) return NextResponse.json({ error: 'Type de fichier non autorisé' }, { status: 400 })

  // Normalise the path: strip any leading slashes, reject traversal.
  const path = rawPath.replace(/^\/+/, '')
  if (!path || path.includes('..') || path.includes('\\')) {
    return NextResponse.json({ error: 'Chemin invalide' }, { status: 400 })
  }
  const parts = path.split('/')
  const [prefix, ...rest] = parts
  if (!ownedStoreIds.has(prefix) || rest.length === 0) {
    return NextResponse.json({ error: 'Chemin non autorisé' }, { status: 403 })
  }

  // Extension must be in the allowlist AND match the declared MIME family.
  const ext = (rest[rest.length - 1].split('.').pop() ?? '').toLowerCase()
  if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: 'Extension non autorisée' }, { status: 400 })

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await admin.storage
    .from(bucket)
    .upload(path, buffer, { upsert: true, contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: 'Échec du téléchargement' }, { status: 500 })
  }

  const { data: urlData } = admin.storage.from(bucket).getPublicUrl(path)
  return NextResponse.json({ url: urlData.publicUrl })
}
