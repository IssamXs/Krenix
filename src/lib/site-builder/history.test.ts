import { describe, it, expect } from 'vitest'
import { initHistory, pushHistory, undo, redo, HISTORY_LIMIT } from './history'

describe('initHistory', () => {
  it('starts with empty past/future', () => {
    const h = initHistory('v0')
    expect(h).toEqual({ past: [], present: 'v0', future: [] })
  })
})

describe('pushHistory', () => {
  it('moves the current present into past and clears future', () => {
    let h = initHistory('v0')
    h = pushHistory(h, 'v1')
    expect(h).toEqual({ past: ['v0'], present: 'v1', future: [] })
  })
  it('caps past at HISTORY_LIMIT entries', () => {
    let h = initHistory(0)
    for (let i = 1; i <= HISTORY_LIMIT + 5; i++) h = pushHistory(h, i)
    expect(h.past.length).toBe(HISTORY_LIMIT)
  })
})

describe('undo', () => {
  it('moves present back into future and pops the last past entry', () => {
    let h = initHistory('v0')
    h = pushHistory(h, 'v1')
    h = undo(h)
    expect(h).toEqual({ past: [], present: 'v0', future: ['v1'] })
  })
  it('is a no-op when there is no past', () => {
    const h = initHistory('v0')
    expect(undo(h)).toEqual(h)
  })
})

describe('redo', () => {
  it('re-applies the most recently undone state', () => {
    let h = initHistory('v0')
    h = pushHistory(h, 'v1')
    h = undo(h)
    h = redo(h)
    expect(h).toEqual({ past: ['v0'], present: 'v1', future: [] })
  })
  it('is a no-op when there is no future', () => {
    const h = initHistory('v0')
    expect(redo(h)).toEqual(h)
  })
})
