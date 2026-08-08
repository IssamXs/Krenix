'use client'

// ============================================================
// Storefront-only signal capture for Fraud Shield. Only imported/used when
// the viewed store has fraud_shield_enabled — see OrderFormFields.tsx.
//
// Device fingerprint: open-source, self-hosted @fingerprintjs/fingerprintjs
// (MIT-licensed, no quota, no billing — NOT the paid Fingerprint Pro API).
//
// Beyond the v1 baseline (time on page, movement, fill speed) this tracker
// now captures the signals that make AUTOFILL distinguishable from real
// typing, because the enemy bot can wait 30s and fake a "human" fill speed:
//   - input_events: every form-field change. A human types ~30-80 events; a
//     script autofill sets each field once (5-8 events).
//   - paste_events: real Ctrl+V / right-click paste on form fields. JS
//     autofill never fires a paste event.
//   - avg_key_delay_ms / max_input_gap_ms: cadence between field changes. A
//     human's controlled inputs fire at typing speed (~100-500ms); autofill
//     floods them at <50ms. max gap captures the "stopped to think" pause.
//   - tab_hidden_ms: total time the tab was hidden while filling — headless
//     bots often run in the background.
//   - scroll_events / focus_events: light human-activity proxies.
//
// NOTE: none of this is a security boundary — a determined attacker can send
// any numbers. It is anti-automation friction plus statistical evidence the
// evolving Engine (engine.ts) learns from merchant-confirmed labels: the bot
// that "perfectly" mimics one signal still leaks across the others, and the
// Engine clusters the leaked combination and matches it on the next wave.
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
  input_events: number | null
  paste_events: number | null
  avg_key_delay_ms: number | null
  max_input_gap_ms: number | null
  tab_hidden_ms: number | null
  scroll_events: number | null
  focus_events: number | null
}

export interface BehaviorTracker {
  /** Call on every form field change to track fill speed + keystroke cadence. */
  recordInput(): void
  getSignals(): BehaviorSignals
  dispose(): void
}

function isFormField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

export function createBehaviorTracker(): BehaviorTracker {
  const startedAt = Date.now()
  let hadMovement = false
  let firstInputAt: number | null = null
  let lastInputAt: number | null = null
  let prevInputAt: number | null = null
  let inputEvents = 0
  let pasteEvents = 0
  let focusEvents = 0
  let scrollEvents = 0
  let totalKeyDelayMs = 0
  let keyDelaySamples = 0
  let maxInputGapMs = 0
  let hiddenAt: number | null = null
  let tabHiddenMs = 0
  let disposed = false

  const onMove = () => { hadMovement = true }
  const onPaste = (e: Event) => { if (isFormField(e.target)) pasteEvents++ }
  const onFocusIn = (e: Event) => { if (isFormField(e.target)) focusEvents++ }
  const onScroll = () => { scrollEvents++ }
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      if (hiddenAt === null) hiddenAt = Date.now()
    } else if (hiddenAt !== null) {
      tabHiddenMs += Date.now() - hiddenAt
      hiddenAt = null
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('mousemove', onMove, { once: true, passive: true })
    window.addEventListener('touchstart', onMove, { once: true, passive: true })
    window.addEventListener('scroll', onScroll, { passive: true })
    document.addEventListener('paste', onPaste, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return {
    recordInput() {
      const now = Date.now()
      inputEvents++
      if (firstInputAt === null) firstInputAt = now
      if (prevInputAt !== null) {
        const gap = now - prevInputAt
        totalKeyDelayMs += gap
        keyDelaySamples++
        if (gap > maxInputGapMs) maxInputGapMs = gap
      }
      prevInputAt = now
      lastInputAt = now
    },
    getSignals() {
      // Flush any still-open hidden period before reporting.
      if (hiddenAt !== null) {
        tabHiddenMs += Date.now() - hiddenAt
        hiddenAt = Date.now()
      }
      return {
        time_on_page_ms: Date.now() - startedAt,
        had_movement: hadMovement,
        form_fill_ms: firstInputAt !== null && lastInputAt !== null ? lastInputAt - firstInputAt : null,
        input_events: inputEvents,
        paste_events: pasteEvents,
        avg_key_delay_ms: keyDelaySamples > 0 ? Math.round(totalKeyDelayMs / keyDelaySamples) : null,
        max_input_gap_ms: keyDelaySamples > 0 ? maxInputGapMs : null,
        tab_hidden_ms: tabHiddenMs,
        scroll_events: scrollEvents,
        focus_events: focusEvents,
      }
    },
    dispose() {
      if (disposed || typeof window === 'undefined') return
      disposed = true
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('touchstart', onMove)
      window.removeEventListener('scroll', onScroll)
      document.removeEventListener('paste', onPaste, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    },
  }
}
