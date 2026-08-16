import type { SiteMenuItem } from '@/types/database'

export interface ResolvedMenuLink {
  href: string
  label: string
}

export function resolveSiteMenuLinks(menu: SiteMenuItem[] | undefined, storeBase: string): ResolvedMenuLink[] {
  if (!menu || menu.length === 0) return []
  return [...menu]
    .sort((a, b) => a.order - b.order)
    .map(item => ({ href: resolveHref(item, storeBase), label: item.label }))
}

function resolveHref(item: SiteMenuItem, storeBase: string): string {
  if (item.type === 'url') return item.target
  if (item.type === 'builtin') {
    if (item.target === 'products') return `${storeBase}/#produits`
    return `${storeBase}/`
  }
  // type === 'page'
  return `${storeBase}/${item.target}`
}
