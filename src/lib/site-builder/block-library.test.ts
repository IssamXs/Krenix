import { describe, it, expect } from 'vitest'
import { BLOCK_LIBRARY, getBlockLibraryEntry, createBlock } from './block-library'
import { SITE_BLOCK_CONTAINER_TYPES, type SiteBlockType } from '@/types/database'

const ALL_TYPES: SiteBlockType[] = [
  'row', 'column', 'container', 'spacer',
  'text', 'image', 'button', 'video', 'icon',
  'product', 'order_form', 'price', 'whatsapp_button',
  'testimonials', 'countdown', 'trust_badges', 'faq_accordion',
  'custom_html',
]

describe('BLOCK_LIBRARY', () => {
  it('has exactly one entry per SiteBlockType, no duplicates or gaps', () => {
    const types = BLOCK_LIBRARY.map(e => e.type)
    expect(new Set(types).size).toBe(types.length)
    expect(types.sort()).toEqual([...ALL_TYPES].sort())
  })

  it('marks row/column/container as containers and nothing else', () => {
    for (const entry of BLOCK_LIBRARY) {
      expect(entry.isContainer).toBe(SITE_BLOCK_CONTAINER_TYPES.includes(entry.type))
    }
  })
})

describe('getBlockLibraryEntry', () => {
  it('returns the matching entry', () => {
    expect(getBlockLibraryEntry('text').type).toBe('text')
  })
  it('throws for an unknown type (should be unreachable given SiteBlockType)', () => {
    // @ts-expect-error deliberately invalid at the type level
    expect(() => getBlockLibraryEntry('not-a-type')).toThrow()
  })
})

describe('createBlock', () => {
  it('creates a block with a fresh id, the entry defaults, and no children for a leaf', () => {
    const block = createBlock('text')
    expect(block.type).toBe('text')
    expect(block.id).toBeTruthy()
    expect(block.children).toBeUndefined()
  })
  it('creates an empty children array for a container', () => {
    const block = createBlock('row')
    expect(block.children).toEqual([])
  })
  it('generates a different id on each call', () => {
    expect(createBlock('text').id).not.toBe(createBlock('text').id)
  })
})
