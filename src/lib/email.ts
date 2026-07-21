// ============================================================
// Transactional email — Resend REST API (no SDK dependency, same
// raw-fetch style as lib/twilio.ts / lib/chargily.ts).
// Requires RESEND_API_KEY + EMAIL_FROM (a sender verified on the
// Resend domain, e.g. "Krenix <notifications@krenix.store>").
// ============================================================

interface SendEmailInput {
  to: string
  subject: string
  html: string
}

/** Fire-and-forget friendly: returns false on any failure, never throws. */
export async function sendEmail({ to, subject, html }: SendEmailInput): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) {
    console.warn('[email] RESEND_API_KEY or EMAIL_FROM not configured — skipping send')
    return false
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      console.error('[email] Resend API error:', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (err) {
    console.error('[email] send failed:', err)
    return false
  }
}

function wrapper(bodyHtml: string): string {
  return `<div style="font-family:Manrope,Arial,sans-serif;background:#F7F5F1;padding:32px 16px;">
    <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px;border:1px solid #EAE6DE;">
      <p style="font-size:20px;font-weight:600;color:#1A1A1A;margin:0 0 16px;">Krenix</p>
      ${bodyHtml}
      <p style="font-size:12px;color:#9A9488;margin-top:32px;">Krenix — la plateforme e-commerce pour les vendeurs algériens.</p>
    </div>
  </div>`
}

export function planApprovedEmail(params: { storeName: string; planLabel: string; storeSlug: string }): { subject: string; html: string } {
  const { storeName, planLabel, storeSlug } = params
  return {
    subject: `Votre plan ${planLabel} est activé !`,
    html: wrapper(`
      <p style="font-size:16px;color:#1A1A1A;margin:0 0 12px;">Bonne nouvelle 🎉</p>
      <p style="font-size:14px;color:#4A4438;line-height:1.6;margin:0 0 16px;">
        Votre paiement a été confirmé et le plan <strong>${planLabel}</strong> est maintenant actif sur
        <strong>${storeName}</strong> (${storeSlug}.krenix.store).
      </p>
      <p style="font-size:14px;color:#4A4438;line-height:1.6;margin:0 0 20px;">
        Vous pouvez dès maintenant accéder à votre tableau de bord et profiter de toutes les fonctionnalités de votre nouveau plan.
      </p>
      <a href="https://krenix.store/dashboard" style="display:inline-block;background:#7A8F6E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">
        Accéder au tableau de bord
      </a>
    `),
  }
}

export function creditsApprovedEmail(params: { storeName: string; quantity: number; kind: 'ai_credits' | 'chatbot' }): { subject: string; html: string } {
  const { storeName, quantity, kind } = params
  const label = kind === 'ai_credits' ? 'crédits IA' : 'messages chatbot'
  return {
    subject: 'Votre recharge a été confirmée',
    html: wrapper(`
      <p style="font-size:16px;color:#1A1A1A;margin:0 0 12px;">Recharge confirmée ✅</p>
      <p style="font-size:14px;color:#4A4438;line-height:1.6;margin:0 0 20px;">
        +${quantity} ${label} ont été ajoutés à <strong>${storeName}</strong>.
      </p>
      <a href="https://krenix.store/dashboard" style="display:inline-block;background:#7A8F6E;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 20px;border-radius:10px;">
        Accéder au tableau de bord
      </a>
    `),
  }
}
