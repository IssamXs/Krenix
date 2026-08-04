// Algerian mobile numbers: 05/06/07 followed by 8 digits (10 digits total).
export function isValidAlgerianPhone(phone: string): boolean {
  return /^(0[5-7])\d{8}$/.test(phone.replace(/\s/g, ''))
}

// '0555123456' -> '+213555123456'. Caller must already have validated the
// phone with isValidAlgerianPhone.
export function toE164Algeria(phone: string): string {
  const digits = phone.replace(/\s/g, '')
  return `+213${digits.slice(1)}`
}
