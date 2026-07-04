import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { suggestPricing } from '@/lib/claude'

// Free helper: suggests 3 pricing options via Claude. Auth-gated to logged-in
// merchants, but intentionally does NOT consume an AI credit.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

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
    const msg = error instanceof Error ? error.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
