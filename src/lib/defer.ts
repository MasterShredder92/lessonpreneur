/**
 * Defer work to a microtask when possible, with a safe fallback for environments
 * that don't support `queueMicrotask` (older browsers / embedded webviews).
 */
export function defer(fn: () => void) {
  const qm = (globalThis as unknown as { queueMicrotask?: (cb: () => void) => void }).queueMicrotask
  if (typeof qm === 'function') return qm(fn)
  Promise.resolve().then(fn)
}

