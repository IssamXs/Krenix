import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer, resolveAccountStore } from '@/lib/server-store'
import { spendAccountCredits } from '@/lib/credits'
import { createAdminClient } from '@/lib/supabase/admin'
import Anthropic from '@anthropic-ai/sdk'
import { generateAdCreativeImage } from '@/lib/gemini'
import { friendlyAIError } from '@/lib/ai-errors'

const anthropic = new Anthropic()

// -------------------------------------------------------
// Generate punchy French ad copy with Claude
// -------------------------------------------------------
async function generateAdCopy(
  productName: string,
  price: number,
  style: string,
): Promise<{ headline: string; tagline: string }> {
  const styleGuide: Record<string, string> = {
    elegant: 'ton luxueux, sophistiqué, haut de gamme',
    energetic: 'ton dynamique, percutant, urgent, enthousiaste',
    minimal: 'ton épuré, moderne, simple mais fort',
  }
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert en copywriting publicitaire pour le marché algérien.

Produit: ${productName}
Prix: ${price.toLocaleString('fr-DZ')} DA
Style: ${styleGuide[style] ?? styleGuide.elegant}

Génère:
- Un titre accrocheur (5-8 mots max)
- Une tagline convaincante (8-12 mots max)

En français, adapté au marché algérien. Percutant, clair, orienté conversion.

Réponds UNIQUEMENT avec ce JSON (pas d'explication):
{"headline":"...","tagline":"..."}`,
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : '{}'
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { headline: productName, tagline: `Commandez maintenant — ${price.toLocaleString('fr-DZ')} DA` }
  } catch {
    return { headline: productName, tagline: `Commandez maintenant — ${price.toLocaleString('fr-DZ')} DA` }
  }
}

// -------------------------------------------------------
// POST /api/ai/generate-ad-creative
// -------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      landingPageId,
      format = 'square',
      style = 'elegant',
    } = body as { landingPageId: string; format?: string; style?: string }

    if (!landingPageId) {
      return NextResponse.json({ error: 'landingPageId requis.' }, { status: 400 })
    }

    // Auth
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 })

    // Creative belongs to the active store; credits come from the shared account pool
    // (monthly allowance first, then purchased top-up credits).
    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan')
    const account = await resolveAccountStore(supabase, user.id, 'id, ai_credits, purchased_credits')
    if (!store || !account) return NextResponse.json({ error: 'Boutique introuvable.' }, { status: 404 })

    // Credit check — 1 credit per ad creative
    const planCredits = account.ai_credits ?? 0
    const purchasedCredits = account.purchased_credits ?? 0
    if (planCredits + purchasedCredits < 1) {
      return NextResponse.json({ error: 'Crédits insuffisants.', code: 'NO_CREDITS' }, { status: 402 })
    }

    // Get landing page + linked product
    const { data: lpData } = await supabase
      .from('landing_pages')
      .select('id, title, product_id, content')
      .eq('id', landingPageId)
      .eq('store_id', store.id)
      .single()
    if (!lpData) return NextResponse.json({ error: 'Landing page introuvable.' }, { status: 404 })

    let productName = lpData.title
    let productPrice = 0

    if (lpData.product_id) {
      const { data: product } = await supabase
        .from('products')
        .select('name, price, description')
        .eq('id', lpData.product_id)
        .single()
      if (product) {
        productName = product.name
        productPrice = product.price
      }
    } else if (lpData.content?._meta) {
      productName = lpData.content._meta.productName ?? lpData.title
      productPrice = lpData.content._meta.price ?? 0
    }

    // ── STEP 1: Claude generates ad copy ──────────────────
    const adCopy = await generateAdCopy(productName, productPrice, style)

    // ── STEP 2: Gemini generates image ────────────────────
    const { imageBase64, mimeType } = await generateAdCreativeImage({
      productName,
      productDescription: null,
      productPrice,
      style: style as 'elegant' | 'energetic' | 'minimal',
      format: format as 'square' | 'story',
      adCopy,
    })

    // ── STEP 3: Upload to Supabase Storage ────────────────
    const admin = createAdminClient()
    const ext = mimeType.includes('jpeg') ? 'jpg' : 'png'
    const filename = `${store.id}/ad-creatives/${Date.now()}-${format}-${style}.${ext}`
    const imageBuffer = Buffer.from(imageBase64, 'base64')

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(filename, imageBuffer, { contentType: mimeType, upsert: false })

    if (uploadError) {
      return NextResponse.json({ error: 'Erreur de stockage de l\'image.' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from('product-images').getPublicUrl(filename)

    // ── STEP 4: Deduct 1 credit from the account pool (atomic — only after success) ──
    const spent = await spendAccountCredits(admin, account.id, planCredits, purchasedCredits, 1)
    if (!spent) {
      // Rollback: delete the uploaded image
      await admin.storage.from('product-images').remove([filename])
      return NextResponse.json({ error: 'Impossible de déduire les crédits.' }, { status: 402 })
    }

    // ── STEP 5: Log credit usage ──────────────────────────
    await admin.from('credit_usage').insert({
      store_id: store.id,
      landing_page_id: landingPageId,
      type: 'ad_creative',
    })

    // ── STEP 6: Save record in ad_creatives ───────────────
    await admin.from('ad_creatives').insert({
      store_id: store.id,
      landing_page_id: landingPageId,
      product_name: productName,
      format,
      style,
      image_url: publicUrl,
      ad_copy: `${adCopy.headline}\n${adCopy.tagline}`,
    })

    return NextResponse.json({
      imageUrl: publicUrl,
      imageBase64,
      mimeType,
      adCopy,
      creditsRemaining: planCredits + purchasedCredits - 1,
    })
  } catch (err) {
    console.error('[generate-ad-creative]', err)
    return NextResponse.json({ error: friendlyAIError(err) }, { status: 500 })
  }
}
