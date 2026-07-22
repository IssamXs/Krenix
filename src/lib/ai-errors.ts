// ============================================================
// KRENIX — AI provider error mapping
// Claude/Gemini errors (rate limits, expired billing, invalid key) must never
// reach the client as raw provider text — only a friendly French message goes
// out; the real cause is logged server-side for us to diagnose.
// ============================================================

function statusOf(err: unknown): number | undefined {
  if (err && typeof err === 'object' && 'status' in err) {
    const s = (err as { status?: unknown }).status
    if (typeof s === 'number') return s
  }
  return undefined
}

export function friendlyAIError(err: unknown): string {
  const status = statusOf(err)
  const msg = err instanceof Error ? err.message : String(err)

  if (status === 429 || /rate.?limit|quota|resource_exhausted|429/i.test(msg)) {
    return "Le service IA est momentanément surchargé. Merci de réessayer dans quelques instants."
  }
  if (status === 401 || status === 403 || /api.?key|unauthorized|permission|billing/i.test(msg)) {
    return "Le service IA est temporairement indisponible. Notre équipe a été notifiée."
  }
  return "La génération IA a échoué. Merci de réessayer."
}
