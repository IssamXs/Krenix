import { describe, it, expect } from 'vitest'
import {
  findBlock, findParent, insertBlock, removeBlock, moveBlock,
  duplicateBlock, updateBlockProps, updateBlockStyle, resolveDropTarget,
} from './block-tree'
import type { SiteBlockNode } from '@/types/database'

function leaf(id: string): SiteBlockNode {
  return { id, type: 'text', props: { text: id }, style: { base: {} } }
}
function row(id: string, children: SiteBlockNode[]): SiteBlockNode {
  return { id, type: 'row', props: {}, style: { base: {} }, children }
}

describe('findBlock', () => {
  it('finds a root block', () => {
    const tree = [leaf('a'), leaf('b')]
    expect(findBlock(tree, 'b')?.id).toBe('b')
  })
  it('finds a nested block', () => {
    const tree = [row('r1', [leaf('a'), leaf('b')])]
    expect(findBlock(tree, 'b')?.id).toBe('b')
  })
  it('returns null when missing', () => {
    expect(findBlock([leaf('a')], 'zzz')).toBeNull()
  })
})

describe('findParent', () => {
  it('returns null parent + root index for a root block', () => {
    const tree = [leaf('a'), leaf('b')]
    expect(findParent(tree, 'b')).toEqual({ parentId: null, index: 1 })
  })
  it('returns the parent id + index for a nested block', () => {
    const tree = [row('r1', [leaf('a'), leaf('b')])]
    expect(findParent(tree, 'b')).toEqual({ parentId: 'r1', index: 1 })
  })
  it('returns null when the block does not exist', () => {
    expect(findParent([leaf('a')], 'zzz')).toBeNull()
  })
})

describe('insertBlock', () => {
  it('inserts at a given root index', () => {
    const tree = [leaf('a'), leaf('c')]
    const result = insertBlock(tree, leaf('b'), null, 1)
    expect(result.map(b => b.id)).toEqual(['a', 'b', 'c'])
  })
  it('inserts into a container by id', () => {
    const tree = [row('r1', [leaf('a')])]
    const result = insertBlock(tree, leaf('b'), 'r1', 1)
    expect(result[0].children?.map(b => b.id)).toEqual(['a', 'b'])
  })
})

describe('removeBlock', () => {
  it('removes a root block', () => {
    const tree = [leaf('a'), leaf('b')]
    expect(removeBlock(tree, 'a').map(b => b.id)).toEqual(['b'])
  })
  it('removes a nested block', () => {
    const tree = [row('r1', [leaf('a'), leaf('b')])]
    expect(removeBlock(tree, 'a')[0].children?.map(b => b.id)).toEqual(['b'])
  })
})

describe('moveBlock', () => {
  it('reorders within the same parent', () => {
    const tree = [leaf('a'), leaf('b'), leaf('c')]
    const result = moveBlock(tree, 'a', null, 2)
    expect(result.map(b => b.id)).toEqual(['b', 'c', 'a'])
  })
  it('moves a block into a different container', () => {
    const tree = [row('r1', [leaf('a')]), row('r2', [leaf('b')])]
    const result = moveBlock(tree, 'a', 'r2', 0)
    expect(result[0].children?.map(b => b.id)).toEqual([])
    expect(result[1].children?.map(b => b.id)).toEqual(['a', 'b'])
  })
})

describe('duplicateBlock', () => {
  it('inserts a copy right after the original with a new id', () => {
    const tree = [leaf('a'), leaf('b')]
    const result = duplicateBlock(tree, 'a')
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('a')
    expect(result[1].id).not.toBe('a')
    expect(result[1].props).toEqual({ text: 'a' })
    expect(result[2].id).toBe('b')
  })
  it('deep-copies children with new ids', () => {
    const tree = [row('r1', [leaf('a')])]
    const result = duplicateBlock(tree, 'r1')
    const copiedChildId = result[1].children?.[0].id
    expect(copiedChildId).toBeDefined()
    expect(copiedChildId).not.toBe('a')
  })
})

describe('updateBlockProps / updateBlockStyle', () => {
  it('merges new props into the target block only', () => {
    const tree = [leaf('a'), leaf('b')]
    const result = updateBlockProps(tree, 'a', { text: 'changed' })
    expect(result[0].props).toEqual({ text: 'changed' })
    expect(result[1].props).toEqual({ text: 'b' })
  })
  it('merges style.base without touching style.desktop', () => {
    const tree: SiteBlockNode[] = [{ id: 'a', type: 'text', props: {}, style: { base: {}, desktop: { color: 'red' } } }]
    const result = updateBlockStyle(tree, 'a', 'base', { color: 'blue' })
    expect(result[0].style).toEqual({ base: { color: 'blue' }, desktop: { color: 'red' } })
  })
})

describe('resolveDropTarget', () => {
  const tree = [row('r1', [leaf('a'), leaf('b')]), leaf('c')]

  it('resolves a "container:<id>" drop id to append at the end of that container', () => {
    expect(resolveDropTarget('container:r1', tree)).toEqual({ parentId: 'r1', index: 2 })
  })
  it('resolves dropping onto an existing block to "insert before it"', () => {
    expect(resolveDropTarget('b', tree)).toEqual({ parentId: 'r1', index: 1 })
  })
  it('resolves dropping onto a root block to insert before it at root', () => {
    expect(resolveDropTarget('c', tree)).toEqual({ parentId: null, index: 1 })
  })
})
