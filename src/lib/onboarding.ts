import type { SupabaseClient } from '@supabase/supabase-js'

// The onboarding wizard operates on ONE specific store, threaded across steps via
// a ?store=<id> query param. This lets an agency owner run the wizard again to add
// a second store without overwriting the first one.

export function currentStoreParam(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('store')
}

export function isNewStoreIntent(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('new') === '1'
}

export function stepUrl(step: string, storeId: string | null): string {
  return storeId ? `/onboarding/${step}?store=${storeId}` : `/onboarding/${step}`
}

// Resolve which store the current step should act on:
// 1. the explicit ?store= param, else
// 2. the owner's most recent not-yet-onboarded store (a resumed wizard).
export async function resolveOnboardingStoreId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const param = currentStoreParam()
  if (param) return param
  const { data } = await supabase
    .from('stores')
    .select('id')
    .eq('owner_id', userId)
    .eq('is_onboarded', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}
