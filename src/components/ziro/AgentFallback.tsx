/**
 * Single standard empty state when agent data is missing or invalid.
 */
export function AgentFallback() {
  return (
    <div className="p-4 text-sm text-muted">
      No agent loaded
    </div>
  )
}
