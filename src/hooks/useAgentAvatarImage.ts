import { useCallback, useEffect, useState } from 'react'
import { getAgentAvatarFilename } from '../lib/agents/agents'

/**
 * Resolves `/static/agents/<file>.png`, retries showing the `<img>` when the tab becomes
 * visible again (e.g. user dropped in PNGs after a 404) and when `agentId` changes.
 */
export function useAgentAvatarImage(agentId: string) {
  const avatar = `/static/agents/${getAgentAvatarFilename(agentId)}`
  const [showImg, setShowImg] = useState(true)

  useEffect(() => {
    setShowImg(true)
  }, [agentId, avatar])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') setShowImg(true)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const onImgError = useCallback(() => setShowImg(false), [])

  return { avatar, showImg, onImgError }
}
