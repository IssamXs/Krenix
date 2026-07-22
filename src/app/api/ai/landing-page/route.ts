import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveActiveStoreServer, resolveAccountStore } from '@/lib/server-store'
import { spendAccountCredits, refundAccountCredits } from '@/lib/credits'
import { friendlyAIError } from '@/lib/ai-errors'
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

    // The page is created under the active store; credits come from the shared
    // account pool (owner's primary store) so all boutiques draw from one balance:
    // the monthly plan allowance first, then any purchased top-up credits.
    const store = await resolveActiveStoreServer(supabase, user.id, 'id, settings')
    const account = await resolveAccountStore(supabase, user.id, 'id, ai_credits, purchased_credits')

    if (!store || !account) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })
    const planCredits = account.ai_credits ?? 0
    const purchasedCredits = account.purchased_credits ?? 0
    if (planCredits + purchasedCredits < 5) {
      return NextResponse.json({ error: 'Crédits insuffisants (5 requis)', code: 'NO_CREDITS' }, { status: 402 })
    }

    // Credit balance is service-role–only (protected against client tampering), so
    // all credit writes go through the admin client — never the owner's session.
    const admin = createAdminClient()

    // Atomic deduction across both balances (optimistic lock — 5 credits per page)
    const spent = await spendAccountCredits(admin, account.id, planCredits, purchasedCredits, 5)
    if (!spent) {
      return NextResponse.json({ error: 'Crédits insuffisants ou conflit concurrent', code: 'NO_CREDITS' }, { status: 402 })
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
      await refundAccountCredits(admin, account.id, planCredits, purchasedCredits)
      console.error('[ai/landing-page] Claude call failed:', claudeError)
      return NextResponse.json({ error: friendlyAIError(claudeError) }, { status: 500 })
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
      await refundAccountCredits(admin, account.id, planCredits, purchasedCredits)
      return NextResponse.json({ error: 'Erreur de sauvegarde: ' + insertError.message }, { status: 500 })
    }

    await admin.from('credit_usage').insert({
      store_id: store.id,
      product_id: null,
      landing_page_id: landingPage.id,
      type: 'landing_page',
    })

    return NextResponse.json({ landingPage })
  } catch (error) {
    // Log the real cause server-side only — an unexpected failure here (e.g. a
    // misconfigured backend) must never hand an unauthenticated caller raw
    // internal error text (library names, connection details, etc).
    console.error('[ai/landing-page] unexpected error', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
