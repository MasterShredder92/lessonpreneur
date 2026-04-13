import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type DependencyList,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { useAuthContext } from '../app/AuthContext'
import { usePermissions } from '../hooks/usePermissions'
import type { ScheduleContext } from '../hooks/useAI'
import type { UserRole } from '../lib/types'
import type { OpenZiroAssistantOptions } from '../ziro/openZiroAssistant'

/** Extensible page-provided context (filters, selected ids, schedule grid). No DOM scraping. */
export interface ZiroPageContext {
  page?: string
  scheduleContext?: ScheduleContext | null
  familyId?: string | null
  familyOperatorSummary?: string | null
  [key: string]: unknown
}

export interface ZiroShellContextValue {
  pathname: string
  search: string
  tenantId: string | null
  role: UserRole | null
  locationIds: string[]
  isStudioDirector: boolean
  /** True while the Ziro slideout is open */
  panelOpen: boolean
  openPanel: (opts?: OpenZiroAssistantOptions) => void
  closePanel: () => void
  togglePanel: () => void
  /** One-shot message consumed when the panel mounts its chat view */
  pendingSeedMessage: string | null
  clearPendingSeed: () => void
  /** Merged snapshot from active route + optional page registrations */
  pageContext: ZiroPageContext
  setPageContext: (patch: Partial<ZiroPageContext> | ((prev: ZiroPageContext) => ZiroPageContext)) => void
}

const ZiroShellContext = createContext<ZiroShellContextValue | null>(null)

export function ZiroShellProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const { tenantId } = useAuthContext()
  const { role, locationIds, isStudioDirector, canUseZiro } = usePermissions()
  const [pageContext, setPageState] = useState<ZiroPageContext>({})
  const [panelOpen, setPanelOpen] = useState(false)
  const [pendingSeedMessage, setPendingSeedMessage] = useState<string | null>(null)

  useEffect(() => {
    setPageState({})
  }, [pathname, search])

  // Hard gate: if a forbidden role somehow has panel state set true (e.g.,
  // from a stale render or prior session), force it closed.
  useEffect(() => {
    if (!canUseZiro && panelOpen) setPanelOpen(false)
  }, [canUseZiro, panelOpen])

  const clearPendingSeed = useCallback(() => setPendingSeedMessage(null), [])

  const openPanel = useCallback((opts?: OpenZiroAssistantOptions) => {
    if (!canUseZiro) return // hard fail-closed
    if (opts?.seedMessage) setPendingSeedMessage(opts.seedMessage)
    setPanelOpen(true)
  }, [canUseZiro])

  const closePanel = useCallback(() => setPanelOpen(false), [])
  const togglePanel = useCallback(() => {
    if (!canUseZiro) return // hard fail-closed
    setPanelOpen((o) => !o)
  }, [canUseZiro])

  useEffect(() => {
    const open = (e: Event) => {
      if (!canUseZiro) return // hard fail-closed: forbidden roles can't open via event
      const d = (e as CustomEvent<OpenZiroAssistantOptions>).detail
      if (d?.seedMessage) setPendingSeedMessage(d.seedMessage)
      setPanelOpen(true)
    }
    window.addEventListener('open-ai-panel', open)
    window.addEventListener('open-ziro-panel', open)
    return () => {
      window.removeEventListener('open-ai-panel', open)
      window.removeEventListener('open-ziro-panel', open)
    }
  }, [canUseZiro])

  const setPageContext = useCallback(
    (patch: Partial<ZiroPageContext> | ((prev: ZiroPageContext) => ZiroPageContext)) => {
      setPageState((prev) => (typeof patch === 'function' ? patch(prev) : { ...prev, ...patch }))
    },
    [],
  )

  const value = useMemo(
    (): ZiroShellContextValue => ({
      pathname,
      search,
      tenantId,
      role,
      locationIds: locationIds ?? [],
      isStudioDirector,
      panelOpen,
      openPanel,
      closePanel,
      togglePanel,
      pendingSeedMessage,
      clearPendingSeed,
      pageContext,
      setPageContext,
    }),
    [
      pathname,
      search,
      tenantId,
      role,
      locationIds,
      isStudioDirector,
      panelOpen,
      openPanel,
      closePanel,
      togglePanel,
      pendingSeedMessage,
      clearPendingSeed,
      pageContext,
      setPageContext,
    ],
  )

  return <ZiroShellContext.Provider value={value}>{children}</ZiroShellContext.Provider>
}

export function useZiroShell(): ZiroShellContextValue {
  const ctx = useContext(ZiroShellContext)
  if (!ctx) throw new Error('useZiroShell must be used within ZiroShellProvider')
  return ctx
}

/**
 * Register structured CRM context for the current page. Clears on route change via provider reset.
 */
export function useRegisterZiroPageContext(factory: () => ZiroPageContext, deps: DependencyList) {
  const { setPageContext } = useZiroShell()
  useEffect(() => {
    setPageContext(factory())
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps list is the contract
  }, [setPageContext, ...deps])
}
