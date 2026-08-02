import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { checkRateLimit, requestIp } from '@/lib/rate-limit'

// POST { name, email } → forwards a short contact-form lead to Krenix's own
// inbox via the existing Resend helper. No storage — this is a lead-capture
// notification, not a support-ticket system.
const CONTACT_RECIPIENT = 'contact@krenix.store'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  const allowed = await checkRateLimit(`contact:${requestIp(request)}`, 5, 600)
  if (!allowed) {
    return NextResponse.json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' }, { status: 429 })
  }

  const body = await request.json().catch(() => null) as { name?: string; email?: string } | null
  const name = body?.name?.trim()
  const email = body?.email?.trim()

  if (!name || !email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Nom et email valides requis.' }, { status: 400 })
  }

  const sent = await sendEmail({
    to: CONTACT_RECIPIENT,
    subject: `Nouveau contact — ${name}`,
    html: `<p style="font-size:14px;color:#1A1A1A;margin:0 0 8px;"><strong>${name}</strong> souhaite être contacté(e).</p>
      <p style="font-size:14px;color:#4A4438;margin:0;">Email : <a href="mailto:${email}">${email}</a></p>`,
  })

  if (!sent) {
    return NextResponse.json({ error: "Échec de l'envoi." }, { status: 502 })
  }
  return NextResponse.json({ ok: true })
}
