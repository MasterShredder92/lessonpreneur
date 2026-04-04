import { useQuery } from '@tanstack/react-query'
import { useAuthContext } from '../app/AuthContext'
import { fetchStarContext, formatStarPrompt, type StarContextData } from '../services/starContext'

/**
 * Provides the Star AI system prompt + raw data for charts.
 * Powered by the get_star_context() RPC.
 * Refreshes every 2 minutes so Star always has fresh data.
 */

export interface StarContext {
  summary: string           // Pre-formatted text context for the AI
  raw: StarContextData      // Raw JSONB for chart rendering
}

export function useStarContext() {
  const { tenantId, role } = useAuthContext()

  return useQuery<StarContext>({
    queryKey: ['star-context', tenantId],
    enabled: !!tenantId,
    staleTime: 2 * 60_000, // refresh every 2 min
    queryFn: async () => {
      const raw = await fetchStarContext(tenantId!)
      if (!raw) {
        return {
          summary: 'Business context unavailable — answer only from what the user tells you.',
          raw: {} as StarContextData,
        }
      }
      return {
        summary: formatStarPrompt(raw, role),
        raw,
      }
    },
  })
}
