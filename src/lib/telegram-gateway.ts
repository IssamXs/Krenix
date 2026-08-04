// ============================================================
// Telegram Gateway — official verification-code API (core.telegram.org/gateway),
// NOT the Telegram Bot API. Platform-owned: one shared
// TELEGRAM_GATEWAY_API_TOKEN, distinct from the existing TELEGRAM_BOT_TOKEN
// (that one is an admin-notifications bot, unrelated).
// ============================================================

const BASE_URL = 'https://gatewayapi.telegram.org'

interface GatewayResponse {
  ok: boolean
  result?: {
    request_id: string
    phone_number: string
    request_cost?: number
    delivery_status?: { status: string }
    verification_status?: { status: string; code_length?: number }
  }
  error?: string
}

async function callGateway(method: string, body: Record<string, unknown>): Promise<GatewayResponse> {
  const token = process.env.TELEGRAM_GATEWAY_API_TOKEN
  if (!token) return { ok: false, error: 'TELEGRAM_GATEWAY_API_TOKEN not configured' }

  const res = await fetch(`${BASE_URL}/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
}

// Free call. Tells us up-front whether `e164Phone` can receive a Telegram
// verification message, without charging anything.
export async function checkSendAbility(e164Phone: string): Promise<{ deliverable: boolean; requestId?: string }> {
  const data = await callGateway('checkSendAbility', { phone_number: e164Phone })
  if (!data.ok || !data.result) return { deliverable: false }
  return { deliverable: true, requestId: data.result.request_id }
}

// Sends the code. Pass the request_id from checkSendAbility to make this
// call free (already known-deliverable). ttl=600s: Telegram auto-refunds
// the fee if the code isn't delivered within 10 minutes.
export async function sendVerificationMessage(
  e164Phone: string,
  requestId?: string
): Promise<{ requestId: string; codeLength: number } | null> {
  const body: Record<string, unknown> = { phone_number: e164Phone, code_length: 6, ttl: 600 }
  if (requestId) body.request_id = requestId

  const data = await callGateway('sendVerificationMessage', body)
  if (!data.ok || !data.result) return null
  return {
    requestId: data.result.request_id,
    codeLength: data.result.verification_status?.code_length ?? 6,
  }
}

export type VerificationCheckResult = 'code_valid' | 'code_invalid' | 'expired'

export async function checkVerificationStatus(requestId: string, code: string): Promise<VerificationCheckResult> {
  const data = await callGateway('checkVerificationStatus', { request_id: requestId, code })
  const status = data.result?.verification_status?.status
  if (status === 'code_valid') return 'code_valid'
  if (status === 'expired' || status === 'code_max_attempts_exceeded') return 'expired'
  return 'code_invalid'
}
