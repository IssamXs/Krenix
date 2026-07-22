import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestPricing } from '@/lib/claude'
import { checkRateLimit } from '@/lib/rate-limit'

// Free helper: suggests 3 pricing options via Claude. Auth-gated to logged-in
// merchants, but intentionally does NOT consume an AI credit — the single
// biggest cost-abuse vector in the app if left unthrottled, since nothing else
// stops a loop of requests from one account.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const allowed = await checkRateLimit(`price-suggestion:${user.id}`, 10, 3600)
    if (!allowed) {
      return NextResponse.json({ error: 'Trop de demandes. Réessayez dans un instant.' }, { status: 429 })
    }

    const { costPrice, adBudget } = await request.json() as { costPrice?: number; adBudget?: number }

    const cost = Number(costPrice)
    if (!cost || isNaN(cost) || cost <= 0) {
      return NextResponse.json({ error: 'Prix de revient invalide' }, { status: 400 })
    }

    const budgetNum = Number(adBudget)
    const budget = adBudget != null && !isNaN(budgetNum) && budgetNum > 0 ? budgetNum : null

    try {
      const options = await suggestPricing(cost, budget)
      return NextResponse.json({ options })
    } catch (aiError) {
      console.error('[price-suggestion]', aiError)
      return NextResponse.json(
        { error: 'Impossible de suggérer un prix pour le moment. Réessayez.' },
        { status: 500 },
      )
    }
  } catch (error) {
    // Log the real cause server-side only — an unexpected failure here (e.g. a
    // misconfigured backend) must never hand an unauthenticated caller raw
    // internal error text (library names, connection details, etc).
    console.error('[price-suggestion] unexpected error', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
