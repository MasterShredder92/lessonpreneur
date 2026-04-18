import type { AgentId } from './agents'
import type { AdminSurfaceKey } from '../../contexts/AdminSurfaceContext'

/** Shell uses a single panel persona (Ziro); surfaces only change context, not agent identity. */
export function getAgentIdForSurface(_surface: AdminSurfaceKey): AgentId {
  return 'ziro'
}
