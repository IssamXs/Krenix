import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'

// Extract text content from HTML tag
function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ]
  for (const re of patterns) {
    const m = html.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return null
}

function extractImages(html: string): string[] {
  const imgs: string[] = []

  // og:image
  const ogImg = extractMeta(html, 'og:image')
  if (ogImg) imgs.push(ogImg)

  // product images from JSON-LD
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1])
      const imgArr = Array.isArray(data.image) ? data.image : (data.image ? [data.image] : [])
      imgArr.forEach((url: string) => { if (!imgs.includes(url)) imgs.push(url) })
    } catch { /* ignore */ }
  }

  // swiper/gallery images
  const swiperRe = /(?:data-src|src)=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)["']/gi
  let m
  while ((m = swiperRe.exec(html)) !== null) {
    const url = m[1].split('?')[0]
    if (!imgs.includes(url) && url.startsWith('http')) {
      imgs.push(url)
      if (imgs.length >= 8) break
    }
  }

  return imgs.slice(0, 8)
}

function extractPrice(html: string): number | null {
  // og:price:amount
  const ogPrice = extractMeta(html, 'og:price:amount') ?? extractMeta(html, 'product:price:amount')
  if (ogPrice) {
    const n = parseFloat(ogPrice.replace(/[^0-9.]/g, ''))
    if (!isNaN(n) && n > 0) return n
  }

  // JSON-LD
  const jsonLdMatch = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1])
      const price = data.offers?.price ?? data.price
      if (price) {
        const n = parseFloat(String(price))
        if (!isNaN(n) && n > 0) return n
      }
    } catch { /* ignore */ }
  }

  // price class patterns (YouCan stores often have data-price attribute)
  const dataPrice = html.match(/data-price=["'](\d+(?:\.\d+)?)["']/i)
  if (dataPrice) return parseFloat(dataPrice[1])

  return null
}

function extractColors(html: string): string[] {
  const colors: string[] = []
  // data-value or option values for "Color" select
  const colorSection = html.match(/(?:color|couleur|لون)[^<]*<\/[^>]+>([\s\S]{0,800})/i)
  if (colorSection) {
    const opts = colorSection[1].matchAll(/(?:data-value|value)=["']([^"']{2,30})["']/gi)
    for (const m of opts) {
      if (colors.length >= 6) break
      const v = m[1].trim()
      if (v && !v.match(/^\d+$/) && !colors.includes(v)) colors.push(v)
    }
  }
  return colors
}

function extractSizes(html: string): string[] {
  const sizes: string[] = []
  const sizeSection = html.match(/(?:size|taille|مقاس)[^<]*<\/[^>]+>([\s\S]{0,800})/i)
  if (sizeSection) {
    const opts = sizeSection[1].matchAll(/(?:data-value|value)=["']([^"']{1,10})["']/gi)
    for (const m of opts) {
      if (sizes.length >= 8) break
      const v = m[1].trim()
      if (v && !sizes.includes(v)) sizes.push(v)
    }
  }
  return sizes
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url?.trim()) {
      return NextResponse.json({ error: 'URL requise.' }, { status: 400 })
    }

    // Validate it's a YouCan URL
    const parsed = new URL(url)
    if (!parsed.hostname.includes('youcan') && !parsed.hostname.includes('youcan.shop')) {
      return NextResponse.json({ error: 'Veuillez entrer une URL de produit YouCan valide.' }, { status: 400 })
    }

    // Auth check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable.' }, { status: 404 })

    // Fetch the YouCan product page
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Impossible de charger la page (${res.status}). Vérifiez l'URL.` }, { status: 400 })
    }

    const html = await res.text()

    // Extract product data
    const name = extractMeta(html, 'og:title') ?? extractMeta(html, 'twitter:title') ?? 'Produit importé'
    const description = extractMeta(html, 'og:description') ?? extractMeta(html, 'description') ?? null
    const price = extractPrice(html) ?? 0
    const images = extractImages(html)
    const colors = extractColors(html)
    const sizes = extractSizes(html)

    // Generate slug
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .substring(0, 60) + '-' + Date.now().toString(36)

    return NextResponse.json({
      name: name.replace(/\s*-\s*[^-]+$/, '').trim(), // remove store name suffix
      description,
      price,
      images,
      colors,
      sizes,
      slug,
    })
  } catch (err) {
    if (err instanceof TypeError && String(err).includes('Invalid URL')) {
      return NextResponse.json({ error: 'URL invalide.' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Erreur lors de l\'import. Vérifiez l\'URL.' }, { status: 500 })
  }
}
