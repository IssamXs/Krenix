import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import path from 'path'
import fs from 'fs'

const TEMPLATES = ['template-dark', 'template-light', 'template-dramatic']
const SIZES = {
  square: { width: 1080, height: 1080 },
  story:  { width: 1080, height: 1920 },
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const { landingPageId, format = 'square', templateIndex = 0 } = await req.json() as {
    landingPageId: string
    format?: 'square' | 'story'
    templateIndex?: number
  }

  const { data: lp } = await supabase
    .from('landing_pages')
    .select('*, store:stores(*)')
    .eq('id', landingPageId)
    .single()

  if (!lp) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

  const storeData = lp.store as { owner_id: string; plan: string; name: string; settings?: { primaryColor?: string } }
  if (storeData.owner_id !== user.id)
    return NextResponse.json({ error: 'Non autorisé' }, { status: 403 })

  if (storeData.plan !== 'pro' && storeData.plan !== 'ultimate' && storeData.plan !== 'sur_mesure')
    return NextResponse.json({ error: 'Fonctionnalité Pro requise' }, { status: 402 })

  const meta = lp.content._meta
  const size = SIZES[format as keyof typeof SIZES] ?? SIZES.square
  const templateData = {
    storeName: storeData.name,
    headline: lp.content.hero.headline,
    price: meta?.price ?? 0,
    productImageUrl: meta?.imageUrl ?? lp.content.hero.background_image ?? '',
    primaryColor: storeData.settings?.primaryColor ?? '#F59E0B',
    width: size.width,
    height: size.height,
  }

  const templateName = TEMPLATES[templateIndex % TEMPLATES.length]
  const templatePath = path.join(process.cwd(), 'src', 'lib', 'ad-templates', `${templateName}.html`)
  let html = fs.readFileSync(templatePath, 'utf-8')

  html = html.replace(
    '<script id="__data__" type="application/json">{"placeholder":true}</script>',
    `<script id="__data__" type="application/json">${JSON.stringify(templateData)}</script>`
  )

  let chromium: typeof import('@sparticuz/chromium').default
  let puppeteer: typeof import('puppeteer-core').default

  try {
    chromium = (await import('@sparticuz/chromium')).default
    puppeteer = (await import('puppeteer-core')).default
  } catch {
    return NextResponse.json({ error: 'Puppeteer non disponible sur ce serveur' }, { status: 500 })
  }

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: size.width, height: size.height },
    executablePath: await chromium.executablePath(),
    headless: true,
  })

  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'domcontentloaded' })
  // Brief pause to let inline scripts execute and fonts apply
  await new Promise(r => setTimeout(r, 500))

  const buffer = await page.screenshot({ type: 'jpeg', quality: 92, fullPage: false })
  await browser.close()

  const slug = (lp as { slug?: string }).slug ?? landingPageId
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `attachment; filename="ad-${slug}-${format}.jpg"`,
    },
  })
}
