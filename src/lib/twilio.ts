// ============================================================
// Twilio SMS — bring-your-own-key (store owner's Twilio account).
// REST API: POST /2010-04-01/Accounts/{SID}/Messages.json (Basic auth SID:token).
// ============================================================

export interface TwilioCredentials {
  accountSid: string
  authToken: string
  sender: string
}

function authHeader(c: TwilioCredentials): string {
  return 'Basic ' + Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')
}

/** Lightweight validation: fetch the account resource (200 = valid). */
export async function validateTwilioCredentials(c: TwilioCredentials): Promise<boolean> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`, {
      headers: { Authorization: authHeader(c) },
    })
    return res.ok
  } catch {
    return false
  }
}

/** Send an SMS. `to` must be E.164 (e.g. +213555123456). Returns true on 2xx. */
export async function sendSms(c: TwilioCredentials, to: string, body: string): Promise<boolean> {
  try {
    const form = new URLSearchParams({ To: to, From: c.sender, Body: body })
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: authHeader(c), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
    return res.ok
  } catch {
    return false
  }
}
