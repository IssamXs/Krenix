// Shared list sort — used by every dashboard/super-admin list page that has a
// "trier par" control (orders, products, boutiques, paiements, ...).
export type SortValue = 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc'

export const SORT_OPTIONS: { value: SortValue; label: string }[] = [
  { value: 'date_desc', label: 'Plus récent' },
  { value: 'date_asc', label: 'Plus ancien' },
  { value: 'name_asc', label: 'Nom (A → Z)' },
  { value: 'name_desc', label: 'Nom (Z → A)' },
]

export function applySort<T>(
  items: T[],
  sort: SortValue,
  getName: (item: T) => string,
  getDate: (item: T) => string,
): T[] {
  const sorted = [...items]
  switch (sort) {
    case 'date_desc':
      sorted.sort((a, b) => new Date(getDate(b)).getTime() - new Date(getDate(a)).getTime())
      break
    case 'date_asc':
      sorted.sort((a, b) => new Date(getDate(a)).getTime() - new Date(getDate(b)).getTime())
      break
    case 'name_asc':
      sorted.sort((a, b) => getName(a).localeCompare(getName(b)))
      break
    case 'name_desc':
      sorted.sort((a, b) => getName(b).localeCompare(getName(a)))
      break
  }
  return sorted
}
