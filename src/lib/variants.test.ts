import { describe, it, expect } from 'vitest'
import { colorForImage, imageIndexForColor, firstAvailableColor } from './variants'

describe('colorForImage', () => {
  it('returns the tagged color for a photo', () => {
    const images = ['a.jpg', 'b.jpg']
    const imageColors = { 'a.jpg': 'Rouge' }
    expect(colorForImage(images, imageColors, 0)).toBe('Rouge')
  })

  it('returns undefined for an untagged photo', () => {
    const images = ['a.jpg', 'b.jpg']
    expect(colorForImage(images, {}, 1)).toBeUndefined()
  })

  it('returns undefined for an out-of-range index', () => {
    expect(colorForImage(['a.jpg'], { 'a.jpg': 'Rouge' }, 5)).toBeUndefined()
  })
})

describe('imageIndexForColor', () => {
  it('finds the first photo tagged with a color', () => {
    const images = ['a.jpg', 'b.jpg', 'c.jpg']
    const imageColors = { 'b.jpg': 'Bleu', 'c.jpg': 'Bleu' }
    expect(imageIndexForColor(images, imageColors, 'Bleu')).toBe(1)
  })

  it('returns -1 when no photo is tagged with that color', () => {
    expect(imageIndexForColor(['a.jpg'], {}, 'Vert')).toBe(-1)
  })
})

describe('firstAvailableColor', () => {
  it('returns the first in-stock color', () => {
    const vs = { colors: { Rouge: 0, Bleu: 5 } }
    expect(firstAvailableColor(['Rouge', 'Bleu'], vs)).toBe('Bleu')
  })

  it('falls back to the first color when all are sold out', () => {
    const vs = { colors: { Rouge: 0, Bleu: 0 } }
    expect(firstAvailableColor(['Rouge', 'Bleu'], vs)).toBe('Rouge')
  })

  it('returns the first color when stock is untracked', () => {
    expect(firstAvailableColor(['Rouge', 'Bleu'], null)).toBe('Rouge')
  })

  it('returns empty string when there are no colors', () => {
    expect(firstAvailableColor(undefined, null)).toBe('')
  })
})
