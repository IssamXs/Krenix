// ============================================================
// Courier abstraction — one interface for every delivery provider so the
// connect/ship routes are provider-agnostic. Yalidine is fully implemented;
// Maystro / ZR Express / Procolis follow their documented API shapes but are
// UNVERIFIED against live keys (adjust payloads on first real shipment).
// ============================================================
import type { DeliveryProvider } from '@/types/database'
import { validateYalidineCredentials, createYalidineParcel } from '@/lib/yalidine'
import { validateMaystro, createMaystroParcel } from '@/lib/maystro'
import { validateZrExpress, createZrExpressParcel } from '@/lib/zr-express'
import { validateProcolis, createProcolisParcel } from '@/lib/procolis'
import { validateWecan, createWecanParcel } from '@/lib/wecan'

// Two-field credential model covers all four providers (id/token or key pair).
export interface CourierCredentials {
  apiId: string
  apiToken: string
}

export interface CourierParcelInput {
  orderNumber: string
  fromWilaya: string
  firstname: string
  familyname: string
  phone: string
  address: string
  toWilaya: string
  toCommune: string
  productList: string
  codAmount: number
  // Only Yalidine's adapter currently reads this (src/lib/yalidine.ts already
  // accepts it as YalidineParcelInput.isStopdesk); other adapters ignore it.
  isStopdesk?: boolean
  // Approximate parcel weight in kg, from the product's `is_heavy` flag.
  // Only Yalidine/WeCan (Yalidine-compatible) currently forward this.
  weight?: number
}

export interface CourierParcelResult {
  success: boolean
  tracking: string | null
  labelUrl: string | null
  error?: string
}

// validate() returns ok:true when the credentials succeed. When false, an
// optional `reason` string carries the courier's own error text (e.g. HTTP
// status + body snippet) so the UI can surface WHY instead of a generic
// "invalides" — critical for debugging BYO-key setups.
export type CourierValidationResult = { ok: boolean; reason?: string }

export interface CourierAdapter {
  label: string
  color: string
  // Labels for the two credential inputs shown in the UI.
  idLabel: string
  tokenLabel: string
  validate: (c: CourierCredentials) => Promise<CourierValidationResult>
  createParcel: (c: CourierCredentials, p: CourierParcelInput) => Promise<CourierParcelResult>
}

export const COURIERS: Record<DeliveryProvider, CourierAdapter> = {
  yalidine: {
    label: 'Yalidine', color: '#C8201C', idLabel: 'API ID', tokenLabel: 'API Token',
    validate: async c => ({ ok: await validateYalidineCredentials({ apiId: c.apiId, apiToken: c.apiToken }) }),
    createParcel: (c, p) => createYalidineParcel({ apiId: c.apiId, apiToken: c.apiToken }, p),
  },
  maystro: {
    label: 'Maystro', color: '#1B9BE2', idLabel: 'API Key', tokenLabel: 'Store ID',
    validate: async c => ({ ok: await validateMaystro(c) }), createParcel: createMaystroParcel,
  },
  zr_express: {
    label: 'ZR Express', color: '#111827', idLabel: 'Token', tokenLabel: 'Clé (key)',
    validate: async c => ({ ok: await validateZrExpress(c) }), createParcel: createZrExpressParcel,
  },
  procolis: {
    label: 'Procolis', color: '#0EA5E9', idLabel: 'Token', tokenLabel: 'Clé (key)',
    validate: async c => ({ ok: await validateProcolis(c) }), createParcel: createProcolisParcel,
  },
  wecan: {
    label: 'WECAN', color: '#0F766E', idLabel: 'API ID', tokenLabel: 'API TOKEN',
    validate: validateWecan, createParcel: createWecanParcel,
  },
}
