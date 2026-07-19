// ============================================================
// Google Sheets sync — fire order rows to a user-provided webhook
// (Google Apps Script Web App or a Zapier/Make catch hook).
// ============================================================

export interface SheetOrderPayload {
  order_number: string
  name: string
  phone: string
  wilaya: string
  commune: string
  product: string
  quantity: number
  total: number
  status: string
  source: string
  date: string
}

/**
 * POST the order payload to the webhook. Returns true on a 2xx response.
 * Logs the failure reason server-side — this call is fire-and-forget from the
 * client, so server logs are the only way to diagnose a silent Sheets failure
 * (wrong /exec URL, Apps Script deployment access not set to "Anyone", a
 * script-side exception, etc).
 */
export async function postOrderToSheet(webhookUrl: string, payload: SheetOrderPayload): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'follow',
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error('[sheets] webhook responded non-2xx', res.status, body.slice(0, 500))
      return false
    }
    // A misconfigured Apps Script deployment (access not "Anyone") makes Google
    // redirect to an HTML sign-in page that still resolves with a 200 — catch
    // that case since it silently drops every order without ever erroring.
    const contentType = res.headers.get('content-type') ?? ''
    if (contentType.includes('text/html')) {
      console.error('[sheets] webhook returned HTML, not JSON — likely a Google sign-in redirect. Check the Apps Script deployment access is set to "Tout le monde".')
      return false
    }
    // Our own Apps Script (sheets-apps-script.ts) catches its own exceptions
    // inside doPost and still replies 200 — its {ok:false, error} body is the
    // only place a script-side failure (missing re-auth, bad Sheet access,
    // quota, etc.) actually surfaces. Third-party hooks (Zapier/Make) won't
    // send this shape at all, so a missing `ok` field is treated as success.
    const text = await res.text()
    let body: { ok?: boolean; error?: string } = {}
    try { body = JSON.parse(text) } catch { /* non-JSON 2xx body from a third-party hook */ }
    if (body.ok === false) {
      console.error('[sheets] Apps Script reported a script-side failure', body.error ?? text.slice(0, 500))
      return false
    }
    return true
  } catch (err) {
    console.error('[sheets] webhook request failed', err)
    return false
  }
}

/** Basic guard: only accept http(s) URLs. */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}
