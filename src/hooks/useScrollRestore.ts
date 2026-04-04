import { useEffect, useCallback } from 'react'

/**
 * Save scroll position before navigating away, restore on mount.
 * Uses sessionStorage so it survives React re-mounts but not tab closes.
 */
export function useScrollRestore(key: string) {
  // Restore on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(`scroll-${key}`)
    if (saved) {
      const pos = parseInt(saved, 10)
      sessionStorage.removeItem(`scroll-${key}`)
      // Wait for data to render before scrolling
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.scrollTo(0, pos)
        })
      })
    }
  }, [key])

  // Save current position (call before navigating)
  const saveScroll = useCallback(() => {
    sessionStorage.setItem(`scroll-${key}`, String(window.scrollY))
  }, [key])

  return { saveScroll }
}
