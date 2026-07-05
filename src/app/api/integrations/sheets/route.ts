import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { postOrderToSheet, isValidWebhookUrl } from '@/lib/sheets'

async function ownerStore() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non authentifié' as const, status: 401 }
  const { data: store } = await supabase
    .from('stores')
    .select('id, name, settings')
    .eq('owner_id', user.id)
    .single()
  if (!store) return { error: 'Boutique introuvable' as const, status: 404 }
  return { supabase, store }
}

// GET → current webhook url + connected flag
export async function GET() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const url = s.store.settings?.sheetsWebhookUrl ?? null
  return NextResponse.json({ url, connected: !!url })
}

// POST { url } → save;  POST { test: true } → fire a sample row to the saved url
export async function POST(request: Request) {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const body = await request.json()

  if (body.test) {
    const url = s.store.settings?.sheetsWebhookUrl
    if (!url) return NextResponse.json({ error: 'Enregistrez d\'abord une URL webhook.' }, { status: 400 })
    const ok = await postOrderToSheet(url, {
      order_number: 'TEST-0001',
      name: 'Client Test',
      phone: '0555 00 00 00',
      wilaya: 'Alger',
      commune: 'Alger Centre',
      product: 'Produit de test',
      quantity: 1,
      total: 2500,
      status: 'pending',
      source: 'test',
      date: new Date().toISOString(),
    })
    return NextResponse.json(ok ? { ok: true } : { error: 'Le webhook n\'a pas répondu (2xx attendu). Vérifiez l\'URL.' }, { status: ok ? 200 : 502 })
  }

  const url = String(body.url ?? '').trim()
  if (!isValidWebhookUrl(url)) {
    return NextResponse.json({ error: 'URL invalide (doit commencer par https://).' }, { status: 400 })
  }
  const { error } = await s.supabase
    .from('stores')
    .update({ settings: { ...s.store.settings, sheetsWebhookUrl: url } })
    .eq('id', s.store.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url, connected: true })
}

// DELETE → remove the webhook
export async function DELETE() {
  const s = await ownerStore()
  if ('error' in s) return NextResponse.json({ error: s.error }, { status: s.status })
  const settings = { ...s.store.settings }
  delete settings.sheetsWebhookUrl
  await s.supabase.from('stores').update({ settings }).eq('id', s.store.id)
  return NextResponse.json({ ok: true })
}
