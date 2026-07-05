import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { generateLandingPage } from '@/lib/claude'
import type { LandingPageStyle, LandingPageLanguage } from '@/lib/claude'
import type { LandingPageContent } from '@/types/database'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const { productName, price, stock, description, imageUrl, style, language } = await request.json()

    if (!productName || !price) {
      return NextResponse.json({ error: 'Le nom du produit et le prix sont requis' }, { status: 400 })
    }
    // Stock is required for new pages: integer >= 0 (form enforces >= 1).
    const stockValue = Number(stock)
    if (stock === undefined || stock === null || stock === '' || !Number.isInteger(stockValue) || stockValue < 0) {
      return NextResponse.json({ error: 'Un stock valide (nombre entier) est requis' }, { status: 400 })
    }

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, ai_credits, settings')

    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    if (store.ai_credits < 5) return NextResponse.json({ error: 'Crédits insuffisants (5 requis)' }, { status: 402 })

    // Atomic credit deduction — optimistic lock (5 credits per landing page)
    const { data: updatedStore, error: deductError } = await supabase
      .from('stores')
      .update({ ai_credits: store.ai_credits - 5 })
      .eq('id', store.id)
      .eq('ai_credits', store.ai_credits)
      .select('id')
      .single()

    if (deductError || !updatedStore) {
      return NextResponse.json({ error: 'Crédits insuffisants ou conflit concurrent' }, { status: 402 })
    }

    let content: LandingPageContent
    try {
      content = await generateLandingPage({
        productName,
        price: Number(price),
        description: description || null,
        imageUrl: imageUrl || null,
        style: style as LandingPageStyle,
        language: (language as LandingPageLanguage) || 'fr',
        storeSettings: store.settings,
      })
    } catch (claudeError) {
      await supabase.from('stores').update({ ai_credits: store.ai_credits }).eq('id', store.id)
      const msg = claudeError instanceof Error ? claudeError.message : 'Erreur de génération IA'
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    const baseSlug = productName.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 30)
    const slug = `${baseSlug}-${Date.now().toString(36)}`

    // Pages start as drafts (is_active: false) — user publishes after preview
    const { data: landingPage, error: insertError } = await supabase
      .from('landing_pages')
      .insert({
        store_id: store.id,
        product_id: null,
        title: content.hero.headline,
        slug,
        stock: stockValue,
        content: {
          ...content,
          hero: { ...content.hero, background_image: imageUrl || undefined },
          _meta: {
            productName,
            price: Number(price),
            lang: (language as LandingPageLanguage) || 'fr',
            imageUrl: imageUrl || undefined,
          },
        },
        is_active: false,
        views: 0,
        orders_count: 0,
      })
      .select()
      .single()

    if (insertError) {
      await supabase.from('stores').update({ ai_credits: store.ai_credits }).eq('id', store.id)
      return NextResponse.json({ error: 'Erreur de sauvegarde: ' + insertError.message }, { status: 500 })
    }

    await supabase.from('credit_usage').insert({
      store_id: store.id,
      product_id: null,
      landing_page_id: landingPage.id,
      type: 'landing_page',
    })

    return NextResponse.json({ landingPage })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
