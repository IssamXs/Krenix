// Client-side helper for busting the server storefront cache after a
// browser-side Supabase mutation (client components can't call
// revalidateTag directly — see src/app/api/dashboard/revalidate-cache).
// Fire-and-forget: a failed bust just means the short cache TTL (60-90s)
// catches up on its own, so callers don't need to await or handle errors.
export function requestCacheRevalidate(scope: 'store' | 'landing-page' = 'store') {
  fetch('/api/dashboard/revalidate-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scope }),
  }).catch(() => {})
}
