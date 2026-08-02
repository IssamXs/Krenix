import { describe, it, expect } from 'vitest'
import { COMMUNES_BY_WILAYA, getCommunesForWilaya } from './communes'

describe('COMMUNES_BY_WILAYA', () => {
  it('covers 54 wilayas', () => {
    expect(Object.keys(COMMUNES_BY_WILAYA).length).toBe(54)
  })

  it('uses the platform canonical spelling for corrected wilaya names', () => {
    expect(COMMUNES_BY_WILAYA['Bordj Bou Arréridj']).toBeDefined()
    expect(COMMUNES_BY_WILAYA["El M'Ghair"]).toBeDefined()
    expect(COMMUNES_BY_WILAYA['El Meniaa']).toBeDefined()
    expect(COMMUNES_BY_WILAYA['Bordj Bou Arreridj']).toBeUndefined()
    expect(COMMUNES_BY_WILAYA['El Meghaier']).toBeUndefined()
    expect(COMMUNES_BY_WILAYA['El Menia']).toBeUndefined()
  })

  it('has no duplicate commune names within a wilaya', () => {
    for (const [wilaya, communes] of Object.entries(COMMUNES_BY_WILAYA)) {
      expect(new Set(communes).size, `${wilaya} has a duplicate commune`).toBe(communes.length)
    }
  })

  it('matches known counts from the source CSV', () => {
    expect(COMMUNES_BY_WILAYA['Adrar'].length).toBe(16)
    expect(COMMUNES_BY_WILAYA['Adrar'][0]).toBe('Timekten')
    expect(COMMUNES_BY_WILAYA['Bordj Bou Arréridj'].length).toBe(34)
  })
})

describe('getCommunesForWilaya', () => {
  it('returns the list for a covered wilaya', () => {
    expect(getCommunesForWilaya('Adrar').length).toBe(16)
  })

  it('returns an empty array for a wilaya not covered by the source data', () => {
    expect(getCommunesForWilaya('Illizi')).toEqual([])
    expect(getCommunesForWilaya('Bordj Badji Mokhtar')).toEqual([])
    expect(getCommunesForWilaya('In Guezzam')).toEqual([])
    expect(getCommunesForWilaya('Djanet')).toEqual([])
  })

  it('returns an empty array for an unknown string', () => {
    expect(getCommunesForWilaya('')).toEqual([])
    expect(getCommunesForWilaya('Not A Wilaya')).toEqual([])
  })
})
