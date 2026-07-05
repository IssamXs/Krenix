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

/** POST the order payload to the webhook. Returns true on a 2xx response. */
export async function postOrderToSheet(webhookUrl: string, payload: SheetOrderPayload): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.ok
  } catch {
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
