import { useState } from 'react'
import { useTeacherDayBlocks, useSubmitSessionLog, WORKED_ON_OPTIONS, type TeacherBlock } from '../../hooks/useTeacherSchedule'
import { useGenerateParentUpdate } from '../../hooks/useParentUpdates'
import { useCheckAchievements } from '../../hooks/useAchievements'
import { getLocationColor } from '../../utils/locationColor'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import StudentProfileCard from '../../components/teacher/StudentProfileCard'
import SessionNoteModal from '../../components/teacher/SessionNoteModal'
import { Check, ChevronLeft, ChevronRight, Clock, User, FileText } from 'lucide-react'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]
  if (dateStr === todayStr) return 'Today'
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

const PROGRESS_OPTIONS = [
  { value: 'struggling' as const, label: 'Needs Work', color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  { value: 'on_track' as const, label: 'On Track', color: '#FFB800', bg: 'rgba(255,184,0,0.12)' },
  { value: 'crushing_it' as const, label: 'Crushing It', color: '#22C55E', bg: 'rgba(34,197,94,0.12)' },
]

const ENGAGEMENT_EMOJIS = [
  { level: 1, emoji: '\uD83D\uDE34', label: 'Low' },
  { level: 2, emoji: '\uD83D\uDE10', label: 'Fair' },
  { level: 3, emoji: '\uD83D\uDE42', label: 'Good' },
  { level: 4, emoji: '\uD83D\uDE04', label: 'Great' },
  { level: 5, emoji: '\uD83D\uDD25', label: 'On Fire' },
]

export default function TeacherSchedule() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const { data: blocks, isLoading } = useTeacherDayBlocks(selectedDate)
  const [activeBlock, setActiveBlock] = useState<TeacherBlock | null>(null)
  const [quickCardStudentId, setQuickCardStudentId] = useState<string | null>(null)
  const [noteModal, setNoteModal] = useState<{
    studentId: string; studentName: string; instrument: string | null; blockId: string; date: string
  } | null>(null)

  const navigate = (days: number) => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
    setActiveBlock(null)
  }

  const studentBlocks = (blocks ?? []).filter(b => b.student_id && b.block_type !== 'call_out')
  const completedCount = studentBlocks.filter(b => b.has_session_log).length
  const totalCount = studentBlocks.length

  return (
    <div className="page" style={{ maxWidth: 580, margin: '0 auto', padding: '16px' }}>
      {/* Date Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 8 }}>
          <ChevronLeft size={22} />
        </button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4' }}>{formatDateLabel(selectedDate)}</div>
          {selectedDate !== new Date().toISOString().split('T')[0] && (
            <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2 }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </div>
          )}
        </div>
        <button onClick={() => navigate(1)} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 8 }}>
          <ChevronRight size={22} />
        </button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#8080A8', marginBottom: 6 }}>
            <span>{completedCount} of {totalCount} logged</span>
            {completedCount === totalCount && <span style={{ color: '#22C55E', fontWeight: 700 }}>All done!</span>}
          </div>
          <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{ height: '100%', borderRadius: 2, background: '#22C55E', width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%`, transition: 'width 300ms ease' }} />
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>
      ) : !blocks || blocks.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>No sessions scheduled for this day.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {blocks.map(block => {
            const isStudent = !!block.student_id && block.block_type !== 'call_out'
            const isLogged = block.has_session_log
            const isActive = activeBlock?.block_id === block.block_id
            const locColor = getLocationColor(block.location_id)

            if (!isStudent) {
              // Open time / call out — view only, dashed green for open
              const isOpen = block.block_type === 'open_time'
              return (
                <div key={block.block_id} style={{
                  padding: '10px 14px', borderRadius: 10,
                  background: isOpen ? 'rgba(34,197,94,0.02)' : 'rgba(255,255,255,0.02)',
                  border: isOpen ? '1px dashed rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.04)',
                  opacity: 0.6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Clock size={14} style={{ color: isOpen ? '#22C55E' : '#606088' }} />
                    <span style={{ fontSize: 12, color: isOpen ? '#22C55E' : '#606088' }}>{formatTime(block.start_time)}</span>
                    <span style={{ fontSize: 11, color: isOpen ? '#22C55E' : '#606088', fontStyle: 'italic' }}>
                      {isOpen ? 'Open' : block.block_type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              )
            }

            return (
              <div key={block.block_id}>
                {/* Session card */}
                <div style={{
                  padding: '14px 16px', borderRadius: 12,
                  background: isLogged ? 'rgba(34,197,94,0.04)' : isActive ? 'rgba(212,34,106,0.06)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isLogged ? 'rgba(34,197,94,0.15)' : isActive ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 150ms ease',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Status indicator */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isLogged ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                      flexShrink: 0,
                    }}>
                      {isLogged ? (
                        <Check size={16} style={{ color: '#22C55E' }} />
                      ) : (
                        <span style={{ fontSize: 16 }}>{getInstrumentEmoji(block.instrument ?? null)}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>
                        {block.student_first_name ?? block.student_name}
                      </div>
                      <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 1, display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span>{formatTime(block.start_time)}</span>
                        {block.instrument && <span title={block.instrument}>{getInstrumentEmoji(block.instrument)}</span>}
                        {block.room && <span>Rm {block.room}</span>}
                        <span style={{
                          padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700,
                          color: locColor, background: `${locColor}15`,
                        }}>
                          {block.location_name}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {/* Student Quick Card button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); block.student_id && setQuickCardStudentId(block.student_id) }}
                        title="Student info"
                        style={{
                          padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)', cursor: 'pointer', color: '#8080A8',
                        }}
                      >
                        <User size={13} />
                      </button>

                      {!isLogged && (
                        <button
                          onClick={() => setActiveBlock(isActive ? null : block)}
                          style={{
                            padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                            color: isActive ? '#fff' : '#D4226A',
                            background: isActive ? '#D4226A' : 'rgba(212,34,106,0.08)',
                            border: 'none', cursor: 'pointer',
                          }}
                        >
                          {isActive ? 'Close' : 'Log'}
                        </button>
                      )}
                      {isLogged && !block.has_session_note && block.student_id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setNoteModal({
                              studentId: block.student_id!,
                              studentName: block.student_name ?? block.student_first_name ?? 'Student',
                              instrument: block.instrument,
                              blockId: block.block_id,
                              date: block.block_date,
                            })
                          }}
                          style={{
                            padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                            color: '#FFB800', background: 'rgba(255,184,0,0.08)',
                            border: '1px solid rgba(255,184,0,0.15)', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 3,
                          }}
                        >
                          <FileText size={11} />
                          Note
                        </button>
                      )}
                      {isLogged && block.has_session_note && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#22C55E', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Check size={12} /> Noted
                        </span>
                      )}
                      {isLogged && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: '#22C55E', padding: '4px 0' }}>Logged</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick-input form (inline, expands below the card) */}
                {isActive && !isLogged && (
                  <QuickInputForm
                    block={block}
                    onComplete={() => setActiveBlock(null)}
                  />
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Student Profile Card Modal */}
      {quickCardStudentId && (
        <StudentProfileCard
          studentId={quickCardStudentId}
          onClose={() => setQuickCardStudentId(null)}
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

// ═══════════════════════════════════════
// QUICK INPUT FORM — inline session log
// ═══════════════════════════════════════

function QuickInputForm({ block, onComplete }: { block: TeacherBlock; onComplete: () => void }) {
  const submitLog = useSubmitSessionLog()
  const generateUpdate = useGenerateParentUpdate()
  const checkAchievements = useCheckAchievements()
  const instrument = (block.instrument ?? 'default').toLowerCase()
  const tagOptions = WORKED_ON_OPTIONS[instrument] ?? WORKED_ON_OPTIONS.default

  const [workedOn, setWorkedOn] = useState<string[]>([])
  const [engagement, setEngagement] = useState<number>(0)
  const [progress, setProgress] = useState<'struggling' | 'on_track' | 'crushing_it' | ''>('')
  const [note, setNote] = useState('')

  const canSubmit = workedOn.length > 0 && engagement > 0 && progress !== ''

  const handleSubmit = async () => {
    if (!canSubmit) return
    try {
      const result = await submitLog.mutateAsync({
        block,
        workedOn,
        engagementLevel: engagement,
        progressIndicator: progress as 'struggling' | 'on_track' | 'crushing_it',
        teacherNote: note,
      })
      toast(`${block.student_first_name}'s session logged`, 'success')
      onComplete()

      // Generate AI parent update + check achievements in the background
      generateUpdate.mutate(result.sessionLogId)
      if (block.student_id) checkAchievements.mutate(block.student_id)
    } catch (err: any) {
      toast(err.message ?? 'Failed to save session', 'error')
    }
  }

  const toggleTag = (tag: string) => {
    setWorkedOn(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  return (
    <div style={{
      margin: '0 0 4px',
      padding: '16px',
      borderRadius: '0 0 12px 12px',
      background: 'rgba(212,34,106,0.03)',
      border: '1px solid rgba(212,34,106,0.12)',
      borderTop: 'none',
      animation: 'fadeIn 150ms ease',
    }}>
      {/* What was worked on */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          What did you work on?
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tagOptions.map(tag => {
            const isOn = workedOn.includes(tag)
            return (
              <button key={tag} onClick={() => toggleTag(tag)} style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                background: isOn ? 'rgba(212,34,106,0.15)' : 'rgba(255,255,255,0.04)',
                color: isOn ? '#E8488A' : '#A0A0C8',
                border: `1px solid ${isOn ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
                cursor: 'pointer', transition: 'all 100ms ease',
              }}>
                {tag}
              </button>
            )
          })}
        </div>
      </div>

      {/* Engagement level */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Energy / Engagement
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
          {ENGAGEMENT_EMOJIS.map(e => (
            <button key={e.level} onClick={() => setEngagement(e.level)} style={{
              flex: 1, padding: '8px 4px', borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              background: engagement === e.level ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${engagement === e.level ? 'rgba(255,184,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer', transition: 'all 100ms ease',
            }}>
              <span style={{ fontSize: 20 }}>{e.emoji}</span>
              <span style={{ fontSize: 9, fontWeight: 600, color: engagement === e.level ? '#FFB800' : '#606088' }}>{e.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Progress indicator */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Progress
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {PROGRESS_OPTIONS.map(p => (
            <button key={p.value} onClick={() => setProgress(p.value)} style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: progress === p.value ? p.bg : 'rgba(255,255,255,0.03)',
              color: progress === p.value ? p.color : '#8080A8',
              border: `1px solid ${progress === p.value ? p.color + '40' : 'rgba(255,255,255,0.06)'}`,
              cursor: 'pointer', transition: 'all 100ms ease', textAlign: 'center',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Optional note */}
      <div style={{ marginBottom: 16 }}>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Quick note (optional)..."
          style={{
            width: '100%', padding: '10px 12px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            color: '#E0E0F4', fontSize: 13, resize: 'none', minHeight: 50,
            fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || submitLog.isPending}
        style={{
          width: '100%', padding: '14px', borderRadius: 10, border: 'none',
          background: canSubmit ? '#D4226A' : 'rgba(255,255,255,0.06)',
          color: canSubmit ? '#fff' : '#606088',
          fontSize: 15, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'default',
          opacity: submitLog.isPending ? 0.6 : 1,
          transition: 'all 150ms ease',
          boxShadow: canSubmit ? '0 4px 16px rgba(212,34,106,0.3)' : 'none',
        }}
      >
        {submitLog.isPending ? 'Saving...' : 'Done'}
      </button>
    </div>
  )
}
