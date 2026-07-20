import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'

// Returns the merchant's recent chatbot conversations + today's usage count.
// Uses the admin client (after an ownership check) so no extra RLS policy on
// chatbot_sessions is required.
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const admin = createAdminClient()

    const { data: sessions } = await admin
      .from('chatbot_sessions')
      .select('id, session_id, messages, order_id, customer_phone, created_at, updated_at')
      .eq('store_id', store.id)
      .order('updated_at', { ascending: false })
      .limit(15)

    const today = new Date().toISOString().slice(0, 10)
    const { data: usage } = await admin
      .from('chatbot_daily_usage')
      .select('message_count')
      .eq('store_id', store.id)
      .eq('date', today)
      .single()

    return NextResponse.json({
      sessions: sessions ?? [],
      usageToday: usage?.message_count ?? 0,
    })
  } catch (error) {
    console.error('[chatbot/sessions] unexpected error', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
