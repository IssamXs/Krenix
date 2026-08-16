export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
}

export const HISTORY_LIMIT = 50

export function initHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [] }
}

export function pushHistory<T>(state: HistoryState<T>, next: T): HistoryState<T> {
  const past = [...state.past, state.present].slice(-HISTORY_LIMIT)
  return { past, present: next, future: [] }
}

export function undo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.past.length === 0) return state
  const present = state.past[state.past.length - 1]
  const past = state.past.slice(0, -1)
  return { past, present, future: [state.present, ...state.future] }
}

export function redo<T>(state: HistoryState<T>): HistoryState<T> {
  if (state.future.length === 0) return state
  const present = state.future[0]
  const future = state.future.slice(1)
  return { past: [...state.past, state.present], present, future }
}
