import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import MusicLoader from '../shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useTasks, useCompleteTask, useUncheckTask, useSnoozeTask, useCreateTask, useScanSystemTasks, checkFileExists, type Task, type TaskFilters } from '../../hooks/useTasks'
import { toast } from '../shared/Toast'

import { CheckCircle, Circle, X, Plus, AlertTriangle, Clock, ChevronRight, Search } from 'lucide-react'

// ═══════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════

const PRIORITY_STYLE: Record<string, { dot: string; label: string }> = {
  urgent: { dot: '#EF4444', label: 'Urgent' },
  high:   { dot: '#FF8C00', label: 'Semi-Urgent' },
  normal: { dot: '#38BDF8', label: 'Normal' },
  low:    { dot: '#8080A8', label: 'Low' },
}
const PRIORITY_ORDER = ['urgent', 'high', 'normal', 'low']

const TYPE_LABELS: Record<string, string> = {
  missing_contract: 'Missing Contract', missing_enrollment_form: 'Missing Enrollment',
  missing_card_on_file: 'No Card on File', missing_teacher_w9: 'Missing W-9',
  missing_teacher_contract: 'Missing Teacher Contract', billing_overdue: 'Overdue Balance',
  followup_due: 'Follow-up Due', manual: 'Custom Task',
}

const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }

// Permission helpers
function canCreateTasks(role: string | null) { return role === 'owner' || role === 'admin' || role === 'company_director' || role === 'studio_director' }
function canAssignToTeacher(role: string | null) { return role === 'owner' || role === 'admin' || role === 'company_director' }
function canDismissTasks(role: string | null) { return role === 'owner' || role === 'admin' || role === 'company_director' }

// ═══════════════════════════════════════
// LEVEL 1 — DASHBOARD SUMMARY
// ═══════════════════════════════════════

export default function TaskCenter() {
  const { role, tenantId } = useAuthContext()
  const { data: tasks, isLoading } = useTasks()
  const scanTasks = useScanSystemTasks()
  const [showFullList, setShowFullList] = useState(false)

  // Auto-scan for system tasks on mount
  useEffect(() => {
    if (tenantId && (role === 'owner' || role === 'admin' || role === 'company_director')) {
      scanTasks.mutate()
    }
  }, [tenantId])

  // Teachers see nothing if no tasks assigned to them
  if (role === 'teacher' && (!tasks || tasks.length === 0)) return null

  const sorted = [...(tasks ?? [])].sort((a, b) => {
    const pi = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    if (pi !== 0) return pi
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const preview = sorted.slice(0, 2)
  const totalPending = sorted.length

  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        background: 'linear-gradient(150deg, rgba(22,20,40,0.97), rgba(16,14,30,0.99))',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(0,0,0,0.3)',
      }}>
        {/* Glow bar */}
        <div style={{ height: 2, background: totalPending > 0 ? 'linear-gradient(90deg, #EF4444, #FF8C00, #D4226A)' : 'linear-gradient(90deg, #22C55E, #38BDF8)' }} />

        {/* Header */}
        <div style={{ padding: '14px 20px 10px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Tasks</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999,
            background: totalPending > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
            color: totalPending > 0 ? '#EF4444' : '#22C55E',
            border: `1px solid ${totalPending > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
          }}>{totalPending} pending</span>
          <div style={{ flex: 1 }} />
          {canCreateTasks(role) && (
            <button onClick={() => setShowFullList(true)} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              color: '#22C55E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}><Plus size={12} /> New Task</button>
          )}
        </div>

        {/* Preview list */}
        <div style={{ padding: '0 20px 14px' }}>
          {isLoading ? (
            <div style={{ padding: 16, textAlign: 'center' }}><MusicLoader /></div>
          ) : totalPending === 0 ? (
            <div style={{ padding: '16px 0', textAlign: 'center' }}>
              <CheckCircle size={22} style={{ color: '#22C55E', marginBottom: 6 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>You're all caught up</div>
              <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>No pending tasks right now.</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {preview.map((t) => <TaskRowCompact key={t.id} task={t} onClick={() => setShowFullList(true)} />)}
              </div>
              {totalPending > 2 && (
                <button onClick={() => setShowFullList(true)} style={{
                  width: '100%', padding: '6px 0', marginTop: 4, background: 'none', border: 'none',
                  color: '#E8488A', fontSize: 11, fontWeight: 600, cursor: 'pointer', textAlign: 'center',
                }}>View all {totalPending} tasks <ChevronRight size={12} style={{ verticalAlign: 'middle' }} /></button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Level 2 — Full list modal */}
      {showFullList && <TaskListModal onClose={() => setShowFullList(false)} />}
    </div>
  )
}

// Compact row for dashboard preview
function TaskRowCompact({ task: t, onClick }: { task: Task; onClick: () => void }) {
  const ps = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal
  const completeTask = useCompleteTask()
  const { tenantId } = useAuthContext()

  return (
    <div onClick={onClick} style={{
      padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: ps.dot, flexShrink: 0, boxShadow: t.priority === 'urgent' ? `0 0 6px ${ps.dot}` : 'none' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#D0D0E8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
      </div>
      <button onClick={(e) => {
        e.stopPropagation()
        if (tenantId) completeTask.mutateAsync({ taskId: t.id, tenantId }).then(() => toast('Done', 'success'))
      }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', padding: 2 }}
        onMouseEnter={e => (e.currentTarget.style.color = '#22C55E')} onMouseLeave={e => (e.currentTarget.style.color = '#606088')}>
        <Circle size={16} />
      </button>
    </div>
  )
}

// ═══════════════════════════════════════
// LEVEL 2 — FULL LIST MODAL
// ═══════════════════════════════════════

function TaskListModal({ onClose }: { onClose: () => void }) {
  const { role, tenantId } = useAuthContext()
  const [filters, setFilters] = useState<TaskFilters>({})
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const { data: tasks } = useTasks(filters)
  const completeTask = useCompleteTask()
  const uncheckTask = useUncheckTask()
  const snoozeTask = useSnoozeTask()

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lastClicked, setLastClicked] = useState<string | null>(null)
  const [bulkLoading, setBulkLoading] = useState(false)

  const sorted = [...(tasks ?? [])].sort((a, b) => {
    const pi = PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
    if (pi !== 0) return pi
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const pendingTasks = sorted.filter(t => t.status !== 'completed')
  const allSelected = pendingTasks.length > 0 && pendingTasks.every(t => selected.has(t.id))

  // Toggle single item with shift-click support
  const handleSelect = (taskId: string, e: React.MouseEvent) => {
    const next = new Set(selected)

    if (e.shiftKey && lastClicked) {
      // Range select: from lastClicked to this one
      const ids = sorted.map(t => t.id)
      const from = ids.indexOf(lastClicked)
      const to = ids.indexOf(taskId)
      if (from >= 0 && to >= 0) {
        const [start, end] = from < to ? [from, to] : [to, from]
        for (let i = start; i <= end; i++) {
          if (sorted[i].status !== 'completed') next.add(ids[i])
        }
      }
    } else {
      if (next.has(taskId)) next.delete(taskId)
      else next.add(taskId)
    }

    setLastClicked(taskId)
    setSelected(next)
  }

  const handleSelectAll = () => {
    if (allSelected) setSelected(new Set())
    else setSelected(new Set(pendingTasks.map(t => t.id)))
  }

  // Bulk actions
  const handleBulkComplete = async () => {
    if (!tenantId || selected.size === 0) return
    setBulkLoading(true)
    const promises = [...selected].map(id => completeTask.mutateAsync({ taskId: id, tenantId }))
    await Promise.all(promises)
    toast(`${selected.size} tasks completed`, 'success')
    setSelected(new Set())
    setBulkLoading(false)
  }

  const handleBulkSnooze = async () => {
    if (selected.size === 0) return
    setBulkLoading(true)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const until = tomorrow.toISOString().split('T')[0]
    const promises = [...selected].map(id => snoozeTask.mutateAsync({ taskId: id, until }))
    await Promise.all(promises)
    toast(`${selected.size} tasks pushed to tomorrow`, 'success')
    setSelected(new Set())
    setBulkLoading(false)
  }

  // Single item actions
  const handleQuickComplete = async (t: Task) => {
    if (!tenantId) return
    await completeTask.mutateAsync({ taskId: t.id, tenantId })
    toast('Task completed', 'success')
  }

  const handleUncheck = async (t: Task) => {
    await uncheckTask.mutateAsync(t.id)
    toast('Task reopened', 'success')
  }

  const handleSnooze = async (t: Task) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await snoozeTask.mutateAsync({ taskId: t.id, until: tomorrow.toISOString().split('T')[0] })
    toast('Pushed to tomorrow', 'success')
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 720, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />

        {/* Header */}
        <div style={{ padding: '20px 24px 12px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4' }}>All Tasks</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 999, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>{sorted.length}</span>
          <div style={{ flex: 1 }} />
          <select value={filters.status ?? ''} onChange={(e) => setFilters({ ...filters, status: e.target.value || undefined })} className="filter-select" style={{ fontSize: 11, padding: '4px 8px', width: 'auto' }}>
            <option value="">Active</option>
            <option value="completed">Completed</option>
          </select>
          <select value={filters.task_type ?? ''} onChange={(e) => setFilters({ ...filters, task_type: e.target.value || undefined })} className="filter-select" style={{ fontSize: 11, padding: '4px 8px', width: 'auto' }}>
            <option value="">All Types</option>
            <option value="system">System</option>
            <option value="manual">Custom</option>
          </select>
          {canCreateTasks(role) && (
            <button onClick={() => setShowCreate(true)} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 8,
              background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
              color: '#22C55E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}><Plus size={12} /> New Task</button>
          )}
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8' }}><X size={16} /></button>
        </div>

        {/* Bulk action bar — appears when items selected */}
        {selected.size > 0 && (
          <div style={{
            padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(212,34,106,0.06)', borderTop: '1px solid rgba(212,34,106,0.1)',
            borderBottom: '1px solid rgba(212,34,106,0.1)', flexShrink: 0,
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#E8488A' }}>{selected.size} selected</span>
            <div style={{ flex: 1 }} />
            <button onClick={handleBulkComplete} disabled={bulkLoading} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', borderRadius: 8,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
              color: '#22C55E', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}><CheckCircle size={12} /> Complete All</button>
            <button onClick={handleBulkSnooze} disabled={bulkLoading} style={{
              display: 'flex', alignItems: 'center', gap: 4, padding: '5px 14px', borderRadius: 8,
              background: 'rgba(255,184,0,0.08)', border: '1px solid rgba(255,184,0,0.2)',
              color: '#FFB800', fontSize: 11, fontWeight: 700, cursor: 'pointer',
            }}><Clock size={12} /> Push to Tomorrow</button>
            <button onClick={() => setSelected(new Set())} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', fontSize: 11,
            }}>Clear</button>
          </div>
        )}

        {/* Select All row */}
        {pendingTasks.length > 0 && filters.status !== 'completed' && (
          <div style={{ padding: '6px 24px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0 }}>
            <button onClick={handleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: allSelected ? '#E8488A' : '#363656' }}>
              {allSelected ? <CheckCircle size={16} /> : <Circle size={16} />}
            </button>
            <span style={{ fontSize: 11, color: '#606088' }}>Select all ({pendingTasks.length})</span>
          </div>
        )}

        {/* Task list — scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 24px 20px' }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '30px 0', textAlign: 'center' }}>
              <CheckCircle size={24} style={{ color: '#22C55E', marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 700, color: '#22C55E' }}>All clear</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {sorted.map((t) => {
                const ps = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal
                const typeLabel = TYPE_LABELS[t.task_type] ?? t.task_type
                const isDone = t.status === 'completed'
                const isSelected = selected.has(t.id)

                return (
                  <div key={t.id} style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: isSelected ? 'rgba(212,34,106,0.06)' : isDone ? 'rgba(34,197,94,0.03)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isSelected ? 'rgba(212,34,106,0.15)' : isDone ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)'}`,
                    display: 'flex', alignItems: 'center', gap: 10,
                    opacity: isDone ? 0.6 : 1,
                  }}>
                    {/* Selection circle (left) */}
                    <button onClick={(e) => isDone ? handleUncheck(t) : handleSelect(t.id, e)} style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0,
                      color: isDone ? '#22C55E' : isSelected ? '#E8488A' : '#363656',
                    }}>
                      {isDone ? <CheckCircle size={18} /> : isSelected ? <CheckCircle size={18} /> : <Circle size={18} />}
                    </button>

                    {/* Priority dot */}
                    {!isDone && <div style={{ width: 6, height: 6, borderRadius: '50%', background: ps.dot, flexShrink: 0, boxShadow: t.priority === 'urgent' ? `0 0 6px ${ps.dot}` : 'none' }} />}

                    {/* Content — click for detail */}
                    <div onClick={() => setSelectedTask(t)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: isDone ? '#8080A8' : '#D0D0E8', textDecoration: isDone ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#8080A8' }}>{typeLabel}</span>
                        {t.entity_name && <span style={{ fontSize: 10, color: '#38BDF8' }}>{t.entity_name}</span>}
                        {t.location_name && <span style={{ fontSize: 10, color: '#606088' }}>{t.location_name}</span>}
                        {isDone && t.completed_by_name && <span style={{ fontSize: 10, color: '#606088' }}>Done by {t.completed_by_name}</span>}
                      </div>
                    </div>

                    {/* Right-side actions: Complete (check) + Push to Tomorrow (clock) */}
                    {!isDone && (
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => handleQuickComplete(t)} title="Complete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#363656', padding: 3 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#22C55E')} onMouseLeave={e => (e.currentTarget.style.color = '#363656')}>
                          <CheckCircle size={16} />
                        </button>
                        <button onClick={() => handleSnooze(t)} title="Push to tomorrow" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#363656', padding: 3 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#FFB800')} onMouseLeave={e => (e.currentTarget.style.color = '#363656')}>
                          <Clock size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Level 3 — Task Detail */}
      {selectedTask && tenantId && <TaskDetailModal task={selectedTask} tenantId={tenantId} onClose={() => setSelectedTask(null)} />}

      {/* Create Task */}
      {showCreate && tenantId && <CreateTaskModal tenantId={tenantId} onClose={() => setShowCreate(false)} />}
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════
// LEVEL 3 — TASK DETAIL MODAL
// ═══════════════════════════════════════

function TaskDetailModal({ task: t, tenantId, onClose }: { task: Task; tenantId: string; onClose: () => void }) {
  const { role } = useAuthContext()
  const completeTask = useCompleteTask()
  const uncheckTask = useUncheckTask()
  const snoozeTask = useSnoozeTask()
  const [note, setNote] = useState('')
  const [fileExists, setFileExists] = useState<boolean | null>(null)
  const [confirmed, setConfirmed] = useState(false)

  const isFileTask = ['missing_contract', 'missing_enrollment_form', 'missing_teacher_w9', 'missing_teacher_contract'].includes(t.task_type)
  const isDone = t.status === 'completed'
  const ps = PRIORITY_STYLE[t.priority] ?? PRIORITY_STYLE.normal

  useEffect(() => {
    if (isFileTask && t.entity_id) checkFileExists(t.task_type, t.entity_id).then(setFileExists)
  }, [])

  const handleComplete = async () => {
    await completeTask.mutateAsync({ taskId: t.id, tenantId, completionNote: note || undefined, fileVerified: fileExists ?? true })
    toast('Task completed', 'success')
    onClose()
  }

  const handleUncheck = async () => {
    await uncheckTask.mutateAsync(t.id)
    toast('Task reopened', 'success')
    onClose()
  }

  const handleSnooze = async (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days)
    await snoozeTask.mutateAsync({ taskId: t.id, until: d.toISOString().split('T')[0] })
    toast(`Snoozed ${days} day${days > 1 ? 's' : ''}`, 'success')
    onClose()
  }

  const needsConfirm = isFileTask && fileExists === false && !confirmed

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 480, background: '#141224', borderRadius: 20,
        border: '1px solid rgba(212,34,106,0.15)', boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: `linear-gradient(90deg, ${ps.dot}, ${ps.dot}80)`, borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '24px 28px 28px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: ps.dot, boxShadow: t.priority === 'urgent' ? `0 0 8px ${ps.dot}` : 'none' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: ps.dot }}>{ps.label}</span>
            {isDone && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 4, background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>Completed</span>}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>{t.title}</div>
          {t.description && <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 12, lineHeight: 1.5 }}>{t.description}</div>}

          {/* Meta */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, fontSize: 11, color: '#8080A8' }}>
            <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(255,255,255,0.04)' }}>{TYPE_LABELS[t.task_type] ?? t.task_type}</span>
            {t.entity_name && <span style={{ color: '#38BDF8' }}>{t.entity_name}</span>}
            {t.location_name && <span>{t.location_name}</span>}
            {t.assigned_to_name && <span>Assigned to: {t.assigned_to_name}</span>}
            {t.assigned_role && !t.assigned_to_name && <span>For: {t.assigned_role.replace('_', ' ')}</span>}
            {t.recurring && <span>Recurring: {t.recurring}</span>}
            {t.due_date && <span>Due: {new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
          </div>

          {/* File verification */}
          {isFileTask && !isDone && fileExists === false && (
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 6 }}><AlertTriangle size={13} /> No file found in uploads</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#C0C0E0', cursor: 'pointer' }}>
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} style={{ accentColor: '#D4226A' }} />
                I confirm this is on file (physical or digital)
              </label>
            </div>
          )}
          {isFileTask && !isDone && fileExists === true && (
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', marginBottom: 16, fontSize: 12, color: '#22C55E', fontWeight: 600 }}>File found in uploads</div>
          )}

          {/* Completion info */}
          {isDone && (
            <div style={{ padding: 12, borderRadius: 10, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.1)', marginBottom: 16, fontSize: 12, color: '#A0A0C8' }}>
              <div>Completed by <strong style={{ color: '#C0C0E0' }}>{t.completed_by_name ?? 'Unknown'}</strong> · {t.completed_at ? new Date(t.completed_at).toLocaleString() : ''}</div>
              {t.completion_note && <div style={{ marginTop: 4, color: '#8080A8' }}>Note: {t.completion_note}</div>}
              {t.file_verified === false && <div style={{ marginTop: 4, color: '#EF4444', fontWeight: 700 }}>Completed without file verification</div>}
            </div>
          )}

          {/* Note for completion */}
          {!isDone && (
            <div style={{ marginBottom: 16 }}>
              <div style={labelStyle}>Note (optional)</div>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="filter-select" style={{ width: '100%', fontSize: 13 }} placeholder="Any notes about this task..." />
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isDone ? (
              <button onClick={handleUncheck} className="btn-outline" style={{ fontSize: 12, color: '#FFB800', borderColor: 'rgba(255,184,0,0.3)' }}>Reopen Task</button>
            ) : (<>
              <button onClick={handleComplete} disabled={needsConfirm || completeTask.isPending} className="btn-primary" style={{ fontSize: 12, padding: '8px 18px' }}>
                {completeTask.isPending ? 'Saving...' : 'Mark Complete'}
              </button>
              <button onClick={() => handleSnooze(1)} className="btn-outline" style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> Tomorrow</button>
              <button onClick={() => handleSnooze(7)} className="btn-outline" style={{ fontSize: 11 }}>Next Week</button>
            </>)}
            <button className="btn-ghost" onClick={onClose} style={{ marginLeft: 'auto', fontSize: 12 }}>Close</button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ═══════════════════════════════════════
// CREATE TASK MODAL
// ═══════════════════════════════════════

function CreateTaskModal({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const { role } = useAuthContext()
  const createTask = useCreateTask()
  const { data: locations } = useLocations()
  const { data: allTeachers } = useTeachers()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('normal')
  const [assignedRole, setAssignedRole] = useState('studio_director')
  const [assignedTo, setAssignedTo] = useState('')
  const [locationId, setLocationId] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [recurring, setRecurring] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Build assignable people based on permissions
  const canAssignTeachers = canAssignToTeacher(role)

  // Available roles for assignment
  const assignableRoles = role === 'studio_director'
    ? [{ value: 'studio_director', label: 'Studio Director' }]
    : [
        { value: 'studio_director', label: 'Studio Director' },
        { value: 'company_director', label: 'Company Director' },
        ...(canAssignTeachers ? [{ value: 'teacher', label: 'Teacher' }] : []),
      ]

  const handleCreate = async () => {
    if (!title.trim()) { setError('Title is required'); return }
    try {
      await createTask.mutateAsync({
        tenantId, title: title.trim(), description: description.trim() || undefined,
        priority, assignedRole: assignedRole || undefined,
        assignedTo: assignedTo || undefined, locationId: locationId || undefined,
        dueDate: dueDate || undefined, recurring: recurring || undefined,
      })
      toast('Task created', 'success')
      onClose()
    } catch (err: any) { setError(err.message ?? 'Failed') }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '24px 28px 28px' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', marginBottom: 16 }}>New Task</div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>Title *</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="filter-select" style={{ width: '100%', fontSize: 13 }} placeholder="What needs to be done?" />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>Description</div>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="filter-select" style={{ width: '100%', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} placeholder="Details..." />
          </div>

          {/* Priority pills */}
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>Priority</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {PRIORITY_ORDER.map((p) => {
                const ps = PRIORITY_STYLE[p]
                return (
                  <button key={p} onClick={() => setPriority(p)} style={{
                    flex: 1, padding: '6px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: priority === p ? `${ps.dot}18` : 'rgba(255,255,255,0.03)',
                    color: priority === p ? ps.dot : '#585878',
                    border: `1px solid ${priority === p ? `${ps.dot}40` : 'rgba(255,255,255,0.06)'}`,
                  }}>{ps.label}</button>
                )
              })}
            </div>
          </div>

          {/* Assign */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Assign to Role</div>
              <select value={assignedRole} onChange={(e) => { setAssignedRole(e.target.value); setAssignedTo('') }} className="filter-select" style={{ width: '100%' }}>
                {assignableRoles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Location</div>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="filter-select" style={{ width: '100%' }}>
                <option value="">All Locations</option>
                {locations?.filter((l: any) => l.is_active).map((l: any) => (
                  <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Specific person (searchable) */}
          {assignedRole === 'teacher' && canAssignTeachers && (
            <div style={{ marginBottom: 12 }}>
              <div style={labelStyle}>Assign to Specific Teacher</div>
              <div style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0 10px' }}>
                  <Search size={12} style={{ color: '#606088' }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teachers..." style={{ flex: 1, background: 'none', border: 'none', color: '#E0E0F4', fontSize: 12, padding: '8px 0', outline: 'none' }} />
                </div>
                {search && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: '#1A1830', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, maxHeight: 150, overflowY: 'auto', marginTop: 4 }}>
                    {allTeachers?.filter((t: any) => t.is_active && `${t.first_name} ${t.last_name}`.toLowerCase().includes(search.toLowerCase())).map((t: any) => (
                      <div key={t.id} onClick={() => { setAssignedTo(t.id); setSearch(`${t.first_name} ${t.last_name}`) }} style={{ padding: '8px 12px', fontSize: 12, color: '#C0C0E0', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')} onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        {t.first_name} {t.last_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Due date + Recurring */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Due Date</div>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="filter-select" style={{ width: '100%' }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={labelStyle}>Recurring</div>
              <select value={recurring} onChange={(e) => setRecurring(e.target.value)} className="filter-select" style={{ width: '100%' }}>
                <option value="">One-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>

          {error && <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={handleCreate} disabled={createTask.isPending}>
              {createTask.isPending ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
