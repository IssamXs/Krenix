// ============================================================
// ZR Express API client (BYO-key). ZR Express runs on the Procolis platform, so
// the same token+key header + add_colis contract applies. UNVERIFIED.
// creds.apiId = token, creds.apiToken = key.
// ============================================================
import type { CourierCredentials, CourierParcelInput, CourierParcelResult } from '@/lib/couriers'
import { validateProcolis, createProcolisParcel } from '@/lib/procolis'

export function validateZrExpress(c: CourierCredentials): Promise<boolean> {
  return validateProcolis(c)
}

export function createZrExpressParcel(c: CourierCredentials, p: CourierParcelInput): Promise<CourierParcelResult> {
  return createProcolisParcel(c, p)
}
