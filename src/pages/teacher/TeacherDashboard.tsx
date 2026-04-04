import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useTeacherTodaySchedule,
  useTeacherTasks,
  useCompleteTeacherTask,
  useTeacherScheduleUpdates,
  useMissingNotesItems,
  type TodayBlock,
} from '../../hooks/useTeacherDashboard'
import { getLocationColor } from '../../utils/locationColor'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import StudentProfileCard from '../../components/teacher/StudentProfileCard'
import SessionNoteModal from '../../components/teacher/SessionNoteModal'
import CloseoutSection from '../../components/teacher/CloseoutSection'
import { ChevronRight, FileText } from 'lucide-react'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m} ${ampm}`
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: '#EF4444',
  high: '#F97316',
  normal: '#3B82F6',
  low: '#6B7280',
}

const UPDATE_ICONS: Record<string, string> = {
  new_student: '\uD83C\uDD95',
  cancellation: '\u274C',
  time_change: '\uD83D\uDD04',
  general: '\uD83D\uDD14',
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const { data: todayBlocks, isLoading: loadingToday } = useTeacherTodaySchedule()
  const { data: tasks, isLoading: loadingTasks } = useTeacherTasks()
  const { data: updates } = useTeacherScheduleUpdates()
  const { data: missingNotes } = useMissingNotesItems()
  const completeTask = useCompleteTeacherTask()
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<{
    studentId: string; studentName: string; instrument: string | null; blockId: string; date: string
  } | null>(null)

  const today = new Date()
  const dayLabel = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Group today's booked blocks by location
  const bookedBlocks = (todayBlocks ?? []).filter(b => b.student_id && b.block_type !== 'call_out')
  const locationGroups = new Map<string, TodayBlock[]>()
  for (const block of bookedBlocks) {
    const key = block.location_id
    if (!locationGroups.has(key)) locationGroups.set(key, [])
    locationGroups.get(key)!.push(block)
  }
  const hasMultipleLocations = locationGroups.size > 1

  const handleCompleteTask = async (taskId: string) => {
    try {
      await completeTask.mutateAsync({ taskId })
      toast('Task completed', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Failed to complete task', 'error')
    }
  }

  return (
    <div className="page" style={{ maxWidth: 640, margin: '0 auto' }}>
      {/* ═══ CLOSEOUT + 24H RECAP REMINDERS ═══ */}
      <CloseoutSection onOpenNoteModal={setNoteModal} />

      {/* ═══ MODULE 1: TODAY'S SCHEDULE ═══ */}
      <div style={{
        marginBottom: 20, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px 14px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Today's Schedule</h2>
          <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 2 }}>{dayLabel}</div>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          {loadingToday ? (
            <div style={{ padding: 30, textAlign: 'center' }}><MusicLoader /></div>
          ) : bookedBlocks.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#606088', fontSize: 13 }}>
              No sessions scheduled for today.
            </div>
          ) : hasMultipleLocations ? (
            // Grouped by location
            Array.from(locationGroups.entries()).map(([locId, blocks]) => (
              <div key={locId} style={{ marginBottom: 12 }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: getLocationColor(locId),
                  padding: '6px 0', marginBottom: 4,
                  borderBottom: `1px solid ${getLocationColor(locId)}20`,
                }}>
                  {blocks[0].location_name}
                </div>
                {blocks.map(block => (
                  <SessionRow key={block.block_id} block={block} onTap={() => block.student_id && setSelectedStudentId(block.student_id)} onNote={block.student_id ? () => {
                    const todayStr = new Date().toISOString().split('T')[0]
                    setNoteModal({
                      studentId: block.student_id!,
                      studentName: block.student_first_name ?? 'Student',
                      instrument: block.instrument,
                      blockId: block.block_id,
                      date: todayStr,
                    })
                  } : undefined} />
                ))}
              </div>
            ))
          ) : (
            // Single location — no grouping header needed
            bookedBlocks.map(block => (
              <SessionRow key={block.block_id} block={block} onTap={() => block.student_id && setSelectedStudentId(block.student_id)} onNote={block.student_id ? () => {
                const todayStr = new Date().toISOString().split('T')[0]
                setNoteModal({
                  studentId: block.student_id!,
                  studentName: block.student_first_name ?? 'Student',
                  instrument: block.instrument,
                  blockId: block.block_id,
                  date: todayStr,
                })
              } : undefined} />
            ))
          )}
        </div>

        {bookedBlocks.length > 0 && (
          <button
            onClick={() => navigate('/teacher/schedule')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, width: '100%',
              padding: '12px', fontSize: 12, fontWeight: 600, color: '#D4226A',
              background: 'rgba(212,34,106,0.04)', border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)',
              cursor: 'pointer',
            }}
          >
            View Full Schedule <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* ═══ MODULE 2: ACTION ITEMS ═══ */}
      <div style={{
        marginBottom: 20, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px 14px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Action Items</h2>
          <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 2 }}>
            {loadingTasks ? '...' : (() => {
              const total = (tasks ?? []).length + (missingNotes ?? []).length
              return `${total} item${total !== 1 ? 's' : ''} need${total === 1 ? 's' : ''} your attention`
            })()}
          </div>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          {loadingTasks ? (
            <div style={{ padding: 20, textAlign: 'center' }}><MusicLoader /></div>
          ) : ((tasks ?? []).length === 0 && (missingNotes ?? []).length === 0) ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#606088', fontSize: 13 }}>
              You're all caught up! No items need your attention.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* Missing notes action items (computed) */}
              {(missingNotes ?? []).map(item => {
                const isOverdue48 = item.hours_ago >= 48
                const dayLabel = new Date(item.block_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                return (
                  <div key={item.block_id} style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                        background: '#3B82F6', boxShadow: '0 0 6px rgba(59,130,246,0.6)',
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Session notes needed</span>
                          {isOverdue48 && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              background: 'rgba(251,191,36,0.12)', color: '#FBBF24',
                            }}>Overdue</span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: '#8080A8', marginTop: 3, lineHeight: 1.5 }}>
                          You had a session with {item.student_first_name} on {dayLabel}. Please add your notes.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                          <span style={{ fontSize: 10, color: '#606088' }}>{item.hours_ago}h ago</span>
                          <button onClick={() => setSelectedStudentId(item.student_id)} style={{
                            padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                            background: 'rgba(212,34,106,0.1)', color: '#D4226A',
                            border: '1px solid rgba(212,34,106,0.2)', cursor: 'pointer',
                          }}>
                            Add Notes
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* System tasks */}
              {(tasks ?? []).map(task => {
                const priorityColor = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.normal
                const isDocTask = task.task_type === 'missing_teacher_w9' || task.task_type === 'missing_teacher_contract'

                return (
                  <div key={task.id} style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%', marginTop: 5, flexShrink: 0,
                        background: priorityColor, boxShadow: `0 0 6px ${priorityColor}60`,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{task.title}</span>
                          {task.is_overdue && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                              background: 'rgba(251,191,36,0.12)', color: '#FBBF24',
                            }}>Overdue</span>
                          )}
                        </div>
                        {task.description && (
                          <div style={{
                            fontSize: 12, color: '#8080A8', marginTop: 3, lineHeight: 1.5,
                            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                          }}>
                            {task.description}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                          <span style={{ fontSize: 10, color: '#606088' }}>{timeAgo(task.created_at)}</span>
                          {isDocTask ? (
                            <button onClick={() => navigate('/teacher/documents')} style={{
                              padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: 'rgba(212,34,106,0.1)', color: '#D4226A',
                              border: '1px solid rgba(212,34,106,0.2)', cursor: 'pointer',
                            }}>
                              {task.task_type === 'missing_teacher_w9' ? 'Upload W-9' : 'Upload Contract'}
                            </button>
                          ) : (
                            <button onClick={() => handleCompleteTask(task.id)} disabled={completeTask.isPending} style={{
                              padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                              background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                              border: '1px solid rgba(34,197,94,0.2)', cursor: 'pointer',
                            }}>
                              {completeTask.isPending ? '...' : 'Mark Complete'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ═══ MODULE 3: SCHEDULE UPDATES ═══ */}
      <div style={{
        marginBottom: 20, borderRadius: 14,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '18px 20px 14px' }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Schedule Updates</h2>
        </div>

        <div style={{ padding: '0 20px 16px' }}>
          {!updates || updates.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center', color: '#606088', fontSize: 13 }}>
              No recent schedule changes.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {updates.map(update => (
                <div key={update.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.03)',
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                    {UPDATE_ICONS[update.type] ?? UPDATE_ICONS.general}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.5 }}>{update.description}</div>
                    <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>{timeAgo(update.updated_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Student Profile Card Modal */}
      {selectedStudentId && (
        <StudentProfileCard
          studentId={selectedStudentId}
          onClose={() => setSelectedStudentId(null)}
        />
      )}

      {/* Session Note Modal */}
      {noteModal && (
        <SessionNoteModal
          studentId={noteModal.studentId}
          studentName={noteModal.studentName}
          instrument={noteModal.instrument}
          scheduleBlockId={noteModal.blockId}
          noteDate={noteModal.date}
          onClose={() => setNoteModal(null)}
          onSaved={() => {
            setNoteModal(null)
            toast('Session note saved!', 'success')
          }}
        />
      )}
    </div>
  )
}

// ─── Session Row Component ────────────────────────────

function SessionRow({ block, onTap, onNote }: { block: TodayBlock; onTap: () => void; onNote?: () => void }) {
  const locColor = getLocationColor(block.location_id)

  return (
    <div
      onClick={onTap}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px',
        borderRadius: 8, cursor: 'pointer', transition: 'background 120ms ease',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: '#A0A0C8', minWidth: 68 }}>
        {formatTime(block.start_time)}
      </span>
      <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4', flex: 1 }}>
        {block.student_first_name}
      </span>
      {block.instrument && (
        <span title={block.instrument} style={{ fontSize: 14 }}>
          {getInstrumentEmoji(block.instrument)}
        </span>
      )}
      <span style={{
        padding: '2px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
        color: locColor, background: `${locColor}15`, border: `1px solid ${locColor}25`,
      }}>
        {block.location_name}
      </span>
      {onNote && (
        <button
          onClick={(e) => { e.stopPropagation(); onNote() }}
          title="Add session note"
          style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
            color: '#FFB800', background: 'rgba(255,184,0,0.08)',
            border: '1px solid rgba(255,184,0,0.15)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
          }}
        >
          <FileText size={11} />
          Note
        </button>
      )}
    </div>
  )
}
