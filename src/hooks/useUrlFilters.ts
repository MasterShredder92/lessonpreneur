import { useSearchParams } from 'react-router-dom'
import { useCallback } from 'react'

/**
 * Filter state stored in URL query params so browser back restores the
 * exact previous view. Refresh loads the clean URL → defaults kick in.
 *
 * Usage:
 *   const { getParam, setParam } = useUrlFilters()
 *   const locationFilter = getParam('location')            // '' if absent
 *   const setLocationFilter = (v: string) => setParam('location', v)
 *
 * Always uses replace:true so filter tweaks don't pollute history — only
 * page-level navigation creates history entries.
 */
export function useUrlFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const getParam = useCallback(
    (key: string, fallback = '') => searchParams.get(key) ?? fallback,
    [searchParams]
  )

  const setParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev)
        if (value === '' || value === undefined || value === null) next.delete(key)
        else next.set(key, value)
        return next
      }, { replace: true })
    },
    [setSearchParams]
  )

  return { getParam, setParam, searchParams }
}
