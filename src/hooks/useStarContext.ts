/**
 * Back-compat re-exports — prefer `useZiroGlobalContext` from `./useZiroGlobalContext`.
 */
import { useZiroGlobalContext } from './useZiroGlobalContext'

export {
  useZiroGlobalContext,
  ensureZiroGlobalSnapshot,
  ziroSnapshotQueryOptions,
  type ZiroGlobalSnapshot,
  type StarContext,
} from './useZiroGlobalContext'

/** @deprecated Use `useZiroGlobalContext` */
export const useStarGlobalContext = useZiroGlobalContext

/** @deprecated Use `useZiroGlobalContext` */
export const useStarContext = useZiroGlobalContext
