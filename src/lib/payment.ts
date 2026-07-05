// Manual payment channels shown to customers when they pay for a plan upgrade or a
// credit/message top-up. Payment is confirmed by the super admin (Issam) after the
// customer transfers the amount and uploads a proof screenshot.
//
// Single source of truth — used by the billing page, the upgrade modal and the
// top-up page so the numbers never drift apart.
export interface PaymentMethod {
  icon: string
  label: string
  value: string
  note: string
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { icon: '💳', label: 'CIB / Edahabia / BaridiMob', value: '00799999002456965683', note: 'RIP' },
  { icon: '🌐', label: 'RedotPay', value: '1900136117', note: 'ID' },
]
