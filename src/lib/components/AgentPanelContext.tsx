import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { pickAgentReaction } from '../agents/actionReactions'
import { getAgent, type AgentDefinition, type AgentId } from '../agents/agents'
import {
  registerAgentOrchestratorHooks,
  runAgentAction as orchestratedRunAgentAction,
  type AgentOrchestratorWorkflowOutcome,
} from '../agents/orchestrator'
import { getAdminVirtualPathname } from '../admin/adminSurfaceBus'

type AgentMemory = Record<string, unknown>

export type AgentPanelState = 'idle' | 'listening' | 'executing' | 'waitingForUser' | 'error'

export type AgentChatHistoryEntry = {
  sender: 'agent' | 'user'
  text: string
  ts: number
}

type AgentPanelContextValue = {
  /** Active agent card (name, avatar, actions, theme). */
  activeAgent: AgentDefinition
  activeAgentId: AgentId
  chatHistory: AgentChatHistoryEntry[]
  addToHistory: (sender: 'agent' | 'user', text: string) => void
  clearHistory: () => void
  /** Show text in the agent chat bubble (placeholder — no backend). */
  agentSay: (message: string) => void
  agentSet: (agentId: AgentId) => void
  /** Reset bubble copy to the current agent’s `defaultMessage`. */
  agentSetDefaultMessage: () => void
  /** Short reaction after a panel action (personality + page behavior aware). */
  agentReact: (actionLabel: string, options?: { agentId?: AgentId }) => void
  /** Runs a panel action by label (same as clicking a chip in {@link AgentPanel}). */
  runAgentAction: (agentId: AgentId, actionLabel: string) => Promise<void>
  agentRemember: (key: string, value: unknown) => void
  agentRecall: <T = unknown>(key: string) => T | undefined
  lastMessage: string
  lastAction: string | undefined
  lastPage: string | undefined
  lastAgent: AgentId | undefined
  bubbleText: string
  /** High-level agent activity for subtle UI (panel, status cues). */
  agentState: AgentPanelState
  /** Mark that the agent is blocked on the user (e.g. after `onClick` returns `'needs-user'`). */
  agentAwaitUserInput: () => void
}

const AgentPanelContext = createContext<AgentPanelContextValue | null>(null)

export function AgentPanelProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [activeAgentId, setActiveAgentId] = useState<AgentId>('ziro')
  const [bubbleText, setBubbleText] = useState('')
  const [chatHistory, setChatHistory] = useState<AgentChatHistoryEntry[]>([])
  const [memory, setMemory] = useState<AgentMemory>({})
  const [agentState, setAgentState] = useState<AgentPanelState>('idle')
  const memoryRef = useRef<AgentMemory>(memory)
  memoryRef.current = memory
  /** When > 0, {@link agentSay} does not force `listening` (orchestrated run owns transitions). */
  const agentWorkflowDepthRef = useRef(0)

  const agentRemember = useCallback((key: string, value: unknown) => {
    setMemory((m) => ({ ...m, [key]: value }))
  }, [])

  /** Stable read — always reflects latest memory without forcing route effects to re-subscribe. */
  const agentRecall = useCallback(<T,>(key: string): T | undefined => memoryRef.current[key] as T | undefined, [])

  const addToHistory = useCallback((sender: 'agent' | 'user', text: string) => {
    setChatHistory((h) => [...h, { sender, text, ts: Date.now() }])
  }, [])

  const clearHistory = useCallback(() => {
    setChatHistory([])
  }, [])

  const agentWorkflowEnter = useCallback(() => {
    agentWorkflowDepthRef.current += 1
    setAgentState('executing')
  }, [])

  const agentWorkflowExit = useCallback((outcome: AgentOrchestratorWorkflowOutcome) => {
    agentWorkflowDepthRef.current = Math.max(0, agentWorkflowDepthRef.current - 1)
    setAgentState(outcome)
  }, [])

  const agentAwaitUserInput = useCallback(() => {
    setAgentState('waitingForUser')
  }, [])

  const agentSay = useCallback(
    (message: string) => {
      setBubbleText(message)
      setMemory((m) => ({ ...m, lastMessage: message }))
      addToHistory('agent', message)
      if (agentWorkflowDepthRef.current === 0) {
        setAgentState('listening')
      }
    },
    [addToHistory]
  )

  const agentReact = useCallback(
    (actionLabel: string, options?: { agentId?: AgentId }) => {
      const reactAs = options?.agentId ?? activeAgentId
      const prior = agentRecall<string>('lastAction')
      agentRemember('lastAction', actionLabel)
      const effectivePath = pathname.startsWith('/admin') ? getAdminVirtualPathname() : pathname
      let reaction = pickAgentReaction(reactAs, actionLabel, effectivePath)
      if (prior && prior !== actionLabel) {
        reaction = `${reaction} (Earlier you ran "${prior}".)`
      }
      agentSay(reaction)
    },
    [activeAgentId, agentRecall, agentRemember, agentSay, pathname]
  )

  const runAgentAction = useCallback(async (agentId: AgentId, actionLabel: string) => {
    try {
      await orchestratedRunAgentAction(agentId, actionLabel)
    } catch (e) {
      console.error('[runAgentAction] action failed', e)
    }
  }, [])

  const agentSet = useCallback((agentId: AgentId) => {
    setActiveAgentId(agentId)
    setMemory((m) => ({ ...m, lastAgent: agentId }))
  }, [])

  const agentSetDefaultMessage = useCallback(() => {
    agentSay(getAgent(activeAgentId).defaultMessage)
  }, [activeAgentId, agentSay])

  const activeAgent = useMemo(() => getAgent(activeAgentId), [activeAgentId])

  useLayoutEffect(() => {
    registerAgentOrchestratorHooks({
      agentSay,
      agentReact,
      agentRemember,
      agentSet,
      agentWorkflowEnter,
      agentWorkflowExit,
    })
    return () => registerAgentOrchestratorHooks(null)
  }, [agentSay, agentReact, agentRemember, agentSet, agentWorkflowEnter, agentWorkflowExit])

  const lastMessage = (memory.lastMessage as string | undefined) ?? ''
  const lastAction = memory.lastAction as string | undefined
  const lastPage = memory.lastPage as string | undefined
  const lastAgent = memory.lastAgent as AgentId | undefined

  const value = useMemo(
    () => ({
      activeAgent,
      activeAgentId,
      chatHistory,
      addToHistory,
      clearHistory,
      agentSay,
      agentSet,
      agentSetDefaultMessage,
      agentReact,
      runAgentAction,
      agentRemember,
      agentRecall,
      lastMessage,
      lastAction,
      lastPage,
      lastAgent,
      bubbleText,
      agentState,
      agentAwaitUserInput,
    }),
    [
      activeAgent,
      activeAgentId,
      chatHistory,
      addToHistory,
      clearHistory,
      agentSay,
      agentSet,
      agentSetDefaultMessage,
      agentReact,
      runAgentAction,
      agentRemember,
      agentRecall,
      lastMessage,
      lastAction,
      lastPage,
      lastAgent,
      bubbleText,
      agentState,
      agentAwaitUserInput,
    ]
  )

  return <AgentPanelContext.Provider value={value}>{children}</AgentPanelContext.Provider>
}

export function useAgentPanel() {
  const ctx = useContext(AgentPanelContext)
  if (!ctx) throw new Error('useAgentPanel must be used within AgentPanelProvider')
  return ctx
}
