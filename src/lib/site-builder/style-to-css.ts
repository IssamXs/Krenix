import type { SiteBlockStyle } from '@/types/database'

function camelToKebab(key: string): string {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export function styleObjectToCss(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${camelToKebab(key)}:${value}`)
    .join(';')
}

export function blockStyleTagCss(blockId: string, style: SiteBlockStyle): string {
  const selector = `[data-block-id="${blockId}"]`
  let css = `${selector}{${styleObjectToCss(style.base)}}`
  if (style.desktop && Object.keys(style.desktop).length > 0) {
    css += `@media(min-width:768px){${selector}{${styleObjectToCss(style.desktop)}}}`
  }
  return css
}
