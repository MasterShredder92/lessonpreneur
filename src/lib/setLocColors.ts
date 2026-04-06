/**
 * Set location CSS variables with a smooth color transition.
 * Call from the useEffect that fires on location change.
 */
let tid: ReturnType<typeof setTimeout> | null = null

export function setLocColors(vars: Record<string, string>) {
  const root = document.documentElement
  root.classList.add('loc-transitioning')

  const style = root.style
  for (const [k, v] of Object.entries(vars)) {
    style.setProperty(k, v)
  }

  if (tid) clearTimeout(tid)
  tid = setTimeout(() => {
    root.classList.remove('loc-transitioning')
    tid = null
  }, 600)
}
