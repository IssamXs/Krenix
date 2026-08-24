import { describe, it, expect } from 'vitest'
import { COMMUNES_BY_WILAYA, getCommunesForWilaya } from './communes'

describe('COMMUNES_BY_WILAYA', () => {
  it('covers all 58 wilayas', () => {
    expect(Object.keys(COMMUNES_BY_WILAYA).length).toBe(58)
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

  // These 4 wilayas post-date the CSV export (2019 administrative split) and
  // are filled in by hand in communes.ts — see the file header for sourcing.
  it('covers the four wilayas the source CSV predates', () => {
    expect(getCommunesForWilaya('Illizi')).toEqual(['Illizi', 'Debdeb', 'Bordj Omar Driss', 'In Amenas'])
    expect(getCommunesForWilaya('Bordj Badji Mokhtar')).toEqual(['Bordj Badji Mokhtar', 'Timiaouine'])
    expect(getCommunesForWilaya('In Guezzam')).toEqual(['In Guezzam', 'Tin Zaouatine'])
    expect(getCommunesForWilaya('Djanet')).toEqual(['Djanet', 'Bordj El Haouas'])
  })

  it('returns an empty array for an unknown string', () => {
    expect(getCommunesForWilaya('')).toEqual([])
    expect(getCommunesForWilaya('Not A Wilaya')).toEqual([])
  })
})
