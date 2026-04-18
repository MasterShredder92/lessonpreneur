import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { agentActionsRegistry } from '../agents/actions'
import { setOrchestratorPaletteNav } from '../agents/orchestrator'
import { useAgentPanel } from './AgentPanelContext'
import type { AdminSurfaceKey } from '../../contexts/AdminSurfaceContext'
import { useAdminSurface } from '../../contexts/AdminSurfaceContext'

type Section = 'agent' | 'page' | 'global'

type PaletteItem =
  | {
      id: string
      section: 'agent'
      label: string
      actionLabel: string
    }
  | {
      id: string
      section: 'page' | 'global'
      label: string
      surface: AdminSurfaceKey
    }
  | {
      id: string
      section: 'global'
      label: string
      clearChat: true
    }

export type CommandPaletteProps = {
  open: boolean
  onClose: () => void
}

function buildPageShortcuts(): { label: string; surface: AdminSurfaceKey }[] {
  return [
    { label: 'Studio Overview', surface: 'dashboard' },
    { label: 'New Members', surface: 'leads' },
    { label: 'Schedule', surface: 'schedule' },
    { label: 'Retention', surface: 'retention' },
    { label: 'Teachers', surface: 'teachers' },
    { label: 'Students', surface: 'students' },
    { label: 'Billing', surface: 'billing' },
  ]
}

function buildGlobalNavCommands(opts: {
  authRole: string | null | undefined
  isOwner: boolean
  isCompanyDirector: boolean
  isStudioDirector: boolean
}): { label: string; surface: AdminSurfaceKey }[] {
  const { authRole, isOwner, isCompanyDirector, isStudioDirector } = opts
  const list: { label: string; surface: AdminSurfaceKey }[] = [{ label: 'Go to settings', surface: 'settings' }]
  if (authRole === 'owner' || authRole === 'admin') {
    list.push({ label: 'Ziro Work', surface: 'zirowork' })
  }
  if (isOwner || isCompanyDirector) {
    list.push({ label: 'Ziro insights', surface: 'ziro_insights' })
  }
  if (!isStudioDirector) {
    list.push({ label: 'Integrations', surface: 'integrations' })
  }
  return list
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { setSurface } = useAdminSurface()
  const { activeAgentId, runAgentAction: runAction, clearHistory } = useAgentPanel()
  const { role: authRole } = useAuthContext()
  const { isOwner, isCompanyDirector, isStudioDirector } = usePermissions()

  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const pageNav = useMemo(() => buildPageShortcuts(), [])
  const globalNav = useMemo(
    () =>
      buildGlobalNavCommands({
        authRole,
        isOwner,
        isCompanyDirector,
        isStudioDirector,
      }),
    [authRole, isOwner, isCompanyDirector, isStudioDirector],
  )

  const paletteNavForOrchestrator = useMemo(
    () => [...pageNav, ...globalNav].map((r) => ({ label: r.label, adminSurface: r.surface })),
    [pageNav, globalNav],
  )

  useLayoutEffect(() => {
    setOrchestratorPaletteNav(paletteNavForOrchestrator)
    return () => setOrchestratorPaletteNav([])
  }, [paletteNavForOrchestrator])

  const agentItems: PaletteItem[] = useMemo(
    () =>
      agentActionsRegistry[activeAgentId].map((a, i) => ({
        id: `agent-${activeAgentId}-${i}-${a.label}`,
        section: 'agent' as const,
        label: a.label,
        actionLabel: a.label,
      })),
    [activeAgentId],
  )

  const pageItems: PaletteItem[] = useMemo(
    () => pageNav.map((p, i) => ({ id: `page-${i}-${p.surface}`, section: 'page' as const, label: p.label, surface: p.surface })),
    [pageNav],
  )

  const globalItems: PaletteItem[] = useMemo(() => {
    const navRows: PaletteItem[] = globalNav.map((g, i) => ({
      id: `global-nav-${i}-${g.surface}`,
      section: 'global' as const,
      label: g.label,
      surface: g.surface,
    }))
    const clear: PaletteItem = {
      id: 'global-clear-chat',
      section: 'global',
      label: 'Clear chat history',
      clearChat: true as const,
    }
    return [clear, ...navRows]
  }, [globalNav])

  const allItems = useMemo(() => [...agentItems, ...pageItems, ...globalItems], [agentItems, pageItems, globalItems])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allItems
    return allItems.filter((r) => r.label.toLowerCase().includes(q))
  }, [allItems, query])

  const pick = useCallback(
    async (item: PaletteItem) => {
      if ('clearChat' in item && item.clearChat) {
        clearHistory()
      } else if ('surface' in item) {
        setSurface(item.surface)
      } else {
        await runAction(activeAgentId, item.actionLabel)
      }
      onClose()
    },
    [activeAgentId, clearHistory, onClose, runAction, setSurface],
  )

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHighlight(0)
    }
  }, [open])

  useEffect(() => {
    setHighlight(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlight((h) => Math.min(h + 1, Math.max(0, filtered.length - 1)))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlight((h) => Math.max(h - 1, 0))
        return
      }
      if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault()
        const row = filtered[highlight]
        if (row) void pick(row)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, filtered, highlight, onClose, pick])

  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 0)
      return () => window.clearTimeout(t)
    }
  }, [open])

  if (!open) return null

  const sectionTitle: Record<Section, string> = {
    agent: 'Agent actions',
    page: 'Page shortcuts',
    global: 'Global commands',
  }

  const rowsForSection = (section: Section) => {
    if (section === 'global') {
      return filtered.filter((f) => f.section === 'global')
    }
    return filtered.filter((f) => f.section === section)
  }

  const renderSection = (section: Section) => {
    const items = rowsForSection(section)
    if (items.length === 0) return null
    return (
      <div key={section} style={{ marginTop: section === 'agent' ? 0 : 14 }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: 'var(--text-caption)',
            marginBottom: 8,
          }}
        >
          {sectionTitle[section]}
        </div>
        <div role="listbox" aria-label={sectionTitle[section]}>
          {items.map((row) => {
            const flatIdx = filtered.indexOf(row)
            const selected = flatIdx === highlight
            return (
              <button
                key={row.id}
                type="button"
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setHighlight(flatIdx)}
                onClick={() => void pick(row)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  marginBottom: 4,
                  borderRadius: 10,
                  border: selected ? '1px solid rgba(212,34,106,0.35)' : '1px solid transparent',
                  background: selected ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {row.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1100 }}
      onClick={() => {
        onClose()
      }}
    >
      <div
        className="modal"
        style={{ maxWidth: 480, padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 10 }}>
            Command palette
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions…"
            aria-label="Search commands"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.25)',
              color: 'var(--text-primary)',
              fontSize: 14,
              fontFamily: 'inherit',
            }}
          />
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-caption)' }}>
            <kbd>Ctrl</kbd>+<kbd>K</kbd> to toggle · Enter to run · Esc to close
          </div>
        </div>
        <div style={{ padding: '12px 18px 18px', maxHeight: 'min(52vh, 420px)', overflowY: 'auto' }}>
          {filtered.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--text-caption)', padding: '8px 0' }}>No matches.</div>
          ) : (
            <>
              {renderSection('agent')}
              {renderSection('page')}
              {renderSection('global')}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
