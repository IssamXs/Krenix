// Shared display formatters.

// Algerian dinar amount, e.g. 4200 → "4 200 DA". Rounds to a whole dinar and
// uses fr-DZ grouping. Consolidates the identical `const DA = …` helper that
// was copy-pasted across dashboard pages (agency, analytics, crm).
export function formatDA(n: number): string {
  return `${Math.round(n).toLocaleString('fr-DZ')} DA`
}
