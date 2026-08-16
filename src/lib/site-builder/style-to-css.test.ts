import { describe, it, expect } from 'vitest'
import { styleObjectToCss, blockStyleTagCss } from './style-to-css'

describe('styleObjectToCss', () => {
  it('converts camelCase keys to kebab-case CSS declarations', () => {
    expect(styleObjectToCss({ backgroundColor: 'red', padding: '8px' })).toBe('background-color:red;padding:8px')
  })
  it('returns an empty string for an empty object', () => {
    expect(styleObjectToCss({})).toBe('')
  })
  it('strips angle brackets from values to prevent breaking out of a <style> tag', () => {
    expect(styleObjectToCss({ color: 'red} </style><script>alert(1)</script>' })).toBe('color:red} /stylescriptalert(1)/script')
  })
  it('leaves normal CSS values with no angle brackets untouched', () => {
    expect(styleObjectToCss({ fontFamily: "'Arial', sans-serif" })).toBe(`font-family:'Arial', sans-serif`)
  })
})

describe('blockStyleTagCss', () => {
  it('scopes base styles to the block id selector', () => {
    const css = blockStyleTagCss('abc', { base: { color: 'blue' } })
    expect(css).toBe('[data-block-id="abc"]{color:blue}')
  })
  it('wraps desktop styles in a min-width media query', () => {
    const css = blockStyleTagCss('abc', { base: { color: 'blue' }, desktop: { color: 'red' } })
    expect(css).toBe('[data-block-id="abc"]{color:blue}@media(min-width:768px){[data-block-id="abc"]{color:red}}')
  })
  it('omits the media query entirely when there are no desktop styles', () => {
    const css = blockStyleTagCss('abc', { base: {} })
    expect(css).toBe('[data-block-id="abc"]{}')
  })
})
