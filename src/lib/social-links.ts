// Turns the loose handles merchants type into the settings form into real,
// clickable URLs. Raw values like `facebook.com/ma-page`, `@maboutique`,
// `0555123456` or even bare `instagram` would otherwise become relative hrefs
// (`/instagram`) on the storefront and 404.
//
// `key` is the settings key: instagram | facebook | tiktok | snapchat | youtube | whatsapp

const SOCIAL_DOMAINS: Record<string, string> = {
  instagram: 'instagram.com',
  facebook: 'facebook.com',
  tiktok: 'tiktok.com',
  snapchat: 'snapchat.com',
  youtube: 'youtube.com',
}

const ADD_LOOKUP: Record<string, string> = {
  snapchat: 'snapchat.com/add',
}

export function normalizeSocialUrl(key: string, value: string): string {
  const raw = value.trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw

  // Strip a leading @ (and any whitespace) — the common shorthand for handles.
  const bare = raw.replace(/^@+/, '').trim()
  if (!bare) return ''

  // Already contains the right domain → just add the protocol.
  const domain = SOCIAL_DOMAINS[key] ?? ''
  if (domain && bare.toLowerCase().startsWith(domain)) return `https://${bare}`

  if (key === 'whatsapp') {
    return /^[+]?[0-9()\s-]{6,15}$/.test(bare) ? `https://wa.me/${bare.replace(/[^0-9]/g, '')}` : `https://wa.me/${bare}`
  }

  if (domain) {
    const base = ADD_LOOKUP[key] ?? domain
    // youtube handles usually carry the @ already (youtube.com/@handle).
    return `https://${base}/${key === 'youtube' ? `@${bare}` : bare}`
  }

  // Unknown key — best effort: treat it as a full host/path.
  return `https://${bare}`
}
