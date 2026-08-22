import { describe, it, expect } from 'vitest'
import { fitDimensions, shouldCompress, MAX_UPLOAD_DIMENSION } from './image-compress'

describe('fitDimensions', () => {
  it('scales a landscape photo down by its longest edge', () => {
    // The real case that triggered this work: 2400x1792 phone shots.
    expect(fitDimensions(2400, 1792, 1600)).toEqual({ width: 1600, height: 1195 })
  })

  it('scales a portrait photo down by its longest edge', () => {
    expect(fitDimensions(1792, 2400, 1600)).toEqual({ width: 1195, height: 1600 })
  })

  it('preserves aspect ratio within a rounding pixel', () => {
    const out = fitDimensions(2752, 1536, 1600)
    expect(Math.abs(out.width / out.height - 2752 / 1536)).toBeLessThan(0.01)
  })

  it('never upscales a photo already smaller than the cap', () => {
    expect(fitDimensions(800, 600, 1600)).toEqual({ width: 800, height: 600 })
  })

  it('leaves a photo exactly at the cap alone', () => {
    expect(fitDimensions(1600, 1200, 1600)).toEqual({ width: 1600, height: 1200 })
  })

  it('never rounds a very wide photo down to zero height', () => {
    expect(fitDimensions(10000, 3, 1600).height).toBe(1)
  })

  it('returns zeroes for nonsense input rather than NaN', () => {
    expect(fitDimensions(0, 0, 1600)).toEqual({ width: 0, height: 0 })
    expect(fitDimensions(100, 100, 0)).toEqual({ width: 0, height: 0 })
  })
})

describe('shouldCompress', () => {
  it('compresses an oversized photo', () => {
    expect(shouldCompress('image/jpeg', 2_700_000, 2400, 1792)).toBe(true)
  })

  it('compresses a heavy file even when its dimensions are modest', () => {
    expect(shouldCompress('image/png', 3_000_000, 900, 900)).toBe(true)
  })

  it('leaves an already-small photo alone', () => {
    expect(shouldCompress('image/jpeg', 120_000, 1200, 800)).toBe(false)
  })

  it('never rasterises an SVG', () => {
    expect(shouldCompress('image/svg+xml', 5_000_000, 4000, 4000)).toBe(false)
  })

  it('never flattens an animated GIF', () => {
    expect(shouldCompress('image/gif', 5_000_000, 4000, 4000)).toBe(false)
  })

  it('ignores non-image files', () => {
    expect(shouldCompress('application/pdf', 5_000_000, 0, 0)).toBe(false)
  })

  it('uses 1600px as the shipped cap', () => {
    expect(MAX_UPLOAD_DIMENSION).toBe(1600)
    expect(shouldCompress('image/jpeg', 100, MAX_UPLOAD_DIMENSION + 1, 100)).toBe(true)
  })
})
