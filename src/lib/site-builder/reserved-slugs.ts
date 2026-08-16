// Every existing literal (non-dynamic-catch-all) top-level segment under
// src/app/store/*. A site page created with one of these slugs would be
// unreachable — Next.js resolves the static route first. Revisit this list
// whenever a new top-level route is added under src/app/store.
export const RESERVED_SITE_PAGE_SLUGS = ['p', 'paiement', 'product', 'api']

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SITE_PAGE_SLUGS.includes(slug.toLowerCase())
}

const DIACRITICS_MAP: Record<string, string> = {
  à: 'a', â: 'a', ä: 'a', é: 'e', è: 'e', ê: 'e', ë: 'e',
  î: 'i', ï: 'i', ô: 'o', ö: 'o', ù: 'u', û: 'u', ü: 'u', ç: 'c',
}

export function slugify(input: string): string {
  const deaccented = input
    .toLowerCase()
    .split('')
    .map(ch => DIACRITICS_MAP[ch] ?? ch)
    .join('')
  return deaccented
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
    .replace(/-$/, '')
}
