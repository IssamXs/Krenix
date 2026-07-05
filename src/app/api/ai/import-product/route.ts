import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'

function extractMeta(html: string, property: string): string | null {
  // Matches <meta property="og:image" content="..."> in either attribute order
  const re1 = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i')
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i')
  return html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? null
}

function extractTitle(html: string): string | null {
  const ogTitle = extractMeta(html, 'og:title')
  if (ogTitle) return ogTitle
  const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return titleTag?.[1]?.trim() ?? null
}

function extractPrice(html: string): number | null {
  // Best-effort: look for JSON-LD "price":"X" or "price":X
  const match = html.match(/"price"\s*:\s*"?(\d+(?:\.\d+)?)"?/i)
  return match ? Number(match[1]) : null
}

export async function POST(req: NextRequest) {
  try {
    let url: string | undefined
    try {
      ;({ url } = await req.json() as { url?: string })
    } catch {
      return NextResponse.json({ error: 'URL requise' }, { status: 400 })
    }
    if (!url) return NextResponse.json({ error: 'URL requise' }, { status: 400 })

    let validUrl: URL
    try {
      validUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
    }
    if (validUrl.protocol !== 'http:' && validUrl.protocol !== 'https:') {
      return NextResponse.json({ error: 'URL invalide' }, { status: 400 })
    }

    // Proportionate SSRF guard: cheap hostname denylist (string check, no DNS
    // resolution) against localhost/private/link-local/cloud-metadata ranges.
    // Mirrors the same proportionate-guard approach used in the sibling
    // landing-page/photos route. This is an authenticated merchant-only
    // endpoint, not anonymous/public, so full DNS-based validation is out of
    // scope here.
    const hostname = validUrl.hostname.toLowerCase()
    const isPrivateHost =
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('169.254.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname) ||
      hostname === '::1' ||
      hostname === '[::1]' ||
      hostname === '0.0.0.0'
    if (isPrivateHost) {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    let html: string
    try {
      const pageRes = await fetch(validUrl.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NovaluxBot/1.0)' },
        signal: AbortSignal.timeout(10000),
      })
      if (!pageRes.ok) throw new Error('fetch failed')
      html = await pageRes.text()
    } catch {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    const ogImage = extractMeta(html, 'og:image') ?? extractMeta(html, 'twitter:image')
    if (!ogImage) {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    let imageAbsoluteUrl: string
    try {
      imageAbsoluteUrl = new URL(ogImage, validUrl).toString()
    } catch {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    let imageBuffer: ArrayBuffer
    let contentType = 'image/jpeg'
    try {
      const imgRes = await fetch(imageAbsoluteUrl, { signal: AbortSignal.timeout(10000) })
      if (!imgRes.ok) throw new Error('image fetch failed')
      contentType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
      if (!contentType.startsWith('image/')) throw new Error('invalid content type')
      imageBuffer = await imgRes.arrayBuffer()
    } catch {
      return NextResponse.json({ error: 'Image introuvable sur ce lien. Uploadez une photo manuellement.' }, { status: 422 })
    }

    const admin = createAdminClient()
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg'
    const path = `${store.id}/imports/${Date.now()}.${ext}`

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(path, Buffer.from(imageBuffer), { contentType, upsert: true })

    if (uploadError) {
      return NextResponse.json({ error: 'Erreur de stockage de l\'image' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from('product-images').getPublicUrl(path)

    return NextResponse.json({
      imageUrl: publicUrl,
      title: extractTitle(html),
      price: extractPrice(html),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
