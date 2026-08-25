import type { SiteMenuItem } from '@/types/database'

export interface ResolvedMenuLink {
  href: string
  label: string
}

const SAFE_URL_SCHEME = /^(https?:)?\/\//i

export function resolveSiteMenuLinks(menu: SiteMenuItem[] | undefined, storeBase: string): ResolvedMenuLink[] {
  if (!menu || menu.length === 0) return []
  return [...menu]
    .sort((a, b) => a.order - b.order)
    .map(item => ({ href: resolveHref(item, storeBase), label: item.label }))
}

function resolveHref(item: SiteMenuItem, storeBase: string): string {
  if (item.type === 'url') {
    // Only allow http(s) or protocol-relative URLs — reject javascript:, data:,
    // and any other scheme a store owner (or a compromised team-member account)
    // could set as a menu link target, since this renders as a real <a href>
    // on the public storefront for every visitor.
    return SAFE_URL_SCHEME.test(item.target) ? item.target : '#'
  }
  if (item.type === 'builtin') {
    if (item.target === 'products') return `${storeBase}/#produits`
    return `${storeBase}/`
  }
  // type === 'page'
  return `${storeBase}/${item.target}`
}
