'use client'

// ============================================================
// Storefront-only signal capture for Fraud Shield. Only imported/used when
// the viewed store has fraud_shield_enabled — see OrderFormFields.tsx.
//
// Device fingerprint: open-source, self-hosted @fingerprintjs/fingerprintjs
// (MIT-licensed, no quota, no billing — NOT the paid Fingerprint Pro API).
// ============================================================

let cachedFingerprint: string | null = null

export async function getDeviceFingerprint(): Promise<string | null> {
  if (cachedFingerprint) return cachedFingerprint
  try {
    const FingerprintJS = (await import('@fingerprintjs/fingerprintjs')).default
    const agent = await FingerprintJS.load()
    const result = await agent.get()
    cachedFingerprint = result.visitorId
    return cachedFingerprint
  } catch {
    return null
  }
}

export interface BehaviorSignals {
  time_on_page_ms: number
  had_movement: boolean
  form_fill_ms: number | null
}

export interface BehaviorTracker {
  /** Call on every form field change to track fill speed. */
  recordInput(): void
  getSignals(): BehaviorSignals
  dispose(): void
}

export function createBehaviorTracker(): BehaviorTracker {
  const startedAt = Date.now()
  let hadMovement = false
  let firstInputAt: number | null = null
  let lastInputAt: number | null = null

  const onMove = () => { hadMovement = true }
  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onMove, { once: true, passive: true })
    window.addEventListener('touchstart', onMove, { once: true, passive: true })
  }

  return {
    recordInput() {
      const now = Date.now()
      if (firstInputAt === null) firstInputAt = now
      lastInputAt = now
    },
    getSignals() {
      return {
        time_on_page_ms: Date.now() - startedAt,
        had_movement: hadMovement,
        form_fill_ms: firstInputAt !== null && lastInputAt !== null ? lastInputAt - firstInputAt : null,
      }
    },
    dispose() {
      if (typeof window !== 'undefined') {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('touchstart', onMove)
      }
    },
  }
}
