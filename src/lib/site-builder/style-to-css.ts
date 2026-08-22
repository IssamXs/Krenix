import type { SiteBlockStyle } from '@/types/database'

function camelToKebab(key: string): string {
  return key.replace(/([A-Z])/g, '-$1').toLowerCase()
}

function sanitizeCssValue(value: string): string {
  // '<' and '>' are the only characters that can break out of the raw-text
  // <style> element's HTML context (the browser terminates <style> content at
  // the first literal "</style>" substring, regardless of JS/React escaping).
  // No legitimate CSS value needs them, so stripping is safe and sufficient.
  return value.replace(/[<>]/g, '')
}

function sanitizeBlockId(id: string): string {
  // Same reasoning as sanitizeCssValue above: '<' and '>' are the characters
  // that can break out of the raw-text <style> element's HTML context, and
  // block ids are meant to be crypto.randomUUID() values — but PATCH
  // /api/site-pages/[id] accepts the blocks array with no per-node schema
  // validation, so a crafted request could set an arbitrary id. '"' is also
  // stripped since the id sits inside a double-quoted CSS attribute selector.
  return id.replace(/[<>"]/g, '')
}

export function styleObjectToCss(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([key, value]) => `${camelToKebab(key)}:${sanitizeCssValue(value)}`)
    .join(';')
}

export function blockStyleTagCss(blockId: string, style: SiteBlockStyle): string {
  const selector = `[data-block-id="${sanitizeBlockId(blockId)}"]`
  let css = `${selector}{${styleObjectToCss(style.base)}}`
  if (style.desktop && Object.keys(style.desktop).length > 0) {
    css += `@media(min-width:768px){${selector}{${styleObjectToCss(style.desktop)}}}`
  }
  return css
}
