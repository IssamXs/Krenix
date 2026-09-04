// Normalizes a phone number by stripping all non-digit characters (spaces, dashes, plus, parens, etc)
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

// Algerian mobile numbers: 05/06/07 followed by 8 digits (10 digits total).
export function isValidAlgerianPhone(phone: string): boolean {
  return /^(0[5-7])\d{8}$/.test(normalizePhone(phone))
}

// '0555123456' -> '+213555123456'. Caller must already have validated the
// phone with isValidAlgerianPhone.
export function toE164Algeria(phone: string): string {
  const digits = normalizePhone(phone)
  return `+213${digits.slice(1)}`
}
