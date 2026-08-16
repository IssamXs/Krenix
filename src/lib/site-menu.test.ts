import { describe, it, expect } from 'vitest'
import { resolveSiteMenuLinks } from './site-menu'
import type { SiteMenuItem } from '@/types/database'

describe('resolveSiteMenuLinks', () => {
  it('returns an empty array when the menu is undefined', () => {
    expect(resolveSiteMenuLinks(undefined, '')).toEqual([])
  })

  it('sorts links by order', () => {
    const menu: SiteMenuItem[] = [
      { id: '1', label: 'FAQ', type: 'page', target: 'faq', order: 1 },
      { id: '2', label: 'Accueil', type: 'builtin', target: 'home', order: 0 },
    ]
    expect(resolveSiteMenuLinks(menu, '').map(l => l.label)).toEqual(['Accueil', 'FAQ'])
  })

  it('resolves builtin home to the store root', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'Accueil', type: 'builtin', target: 'home', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '')).toEqual([{ href: '/', label: 'Accueil' }])
  })

  it('resolves builtin products to the #produits anchor', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'Produits', type: 'builtin', target: 'products', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '')).toEqual([{ href: '/#produits', label: 'Produits' }])
  })

  it('resolves a page link relative to the slug, honoring storeBase', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'FAQ', type: 'page', target: 'faq', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '/store')).toEqual([{ href: '/store/faq', label: 'FAQ' }])
  })

  it('resolves an external url link as-is, ignoring storeBase', () => {
    const menu: SiteMenuItem[] = [{ id: '1', label: 'Blog', type: 'url', target: 'https://blog.example.com', order: 0 }]
    expect(resolveSiteMenuLinks(menu, '/store')).toEqual([{ href: 'https://blog.example.com', label: 'Blog' }])
  })
})
