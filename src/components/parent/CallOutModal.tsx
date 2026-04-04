import { useState, useEffect, useMemo } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import {
  useSessionsOnDate,
  fetchNextFifthWeek,
  fetchIsFifthWeek,
  fetchLastSessionNote,
  useConfirmCallout,
  type SessionInDay,
} from '../../hooks/useFamilyCallout'
import { toast } from '../shared/Toast'
import { X } from 'lucide-react'

/**
 * Family Call-Out Modal — the only entry point for call-outs in the parent portal.
 *
 * Flow:
 *   Step 1: Select student(s) scheduled that day
 *   Step 2: If student has >1 session that day, ask "just this" or "all today"
 *   Step 3: Resolve next fifth-week date per student
 *   Step 4: Confirmation with acknowledgment checkbox
 *
 * There is NO rescheduling. There is NO cancel language. Only "Call Out".
 */

interface Props {
  isOpen: boolean
  onClose: () => void
  /** The session card the user clicked — pre-selects that student. */
  clickedBlockId: string
  clickedStudentId: string
  sessionDate: string
  familyId: string
  familyName: string
  familyStudentIds: string[]
}

type Step = 'select' | 'no-fifth' | 'confirm' | 'free-fifth'

interface ResolvedMakeup {
  student_id: string
  student_first_name: string
  location_id: string
  lesson_day_of_week: number
  block_ids: string[]
  primary_block_id: string
  scope: 'this_session' | 'all_today'
  teacher_profile_id: string | null
  teacher_first_name: string
  makeup_date: string | null
  callout_date_is_fifth_week: boolean
  previous_session_note: string | null
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function CallOutModal({
  isOpen, onClose, clickedBlockId, clickedStudentId, sessionDate,
  familyId, familyName, familyStudentIds,
}: Props) {
  const { tenantId } = useAuthContext()
  const [step, setStep] = useState<Step>('select')
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set([clickedStudentId]))
  const [scopeByStudent, setScopeByStudent] = useState<Record<string, 'this_session' | 'all_today'>>({})
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState<ResolvedMakeup[]>([])
  const [acknowledged, setAcknowledged] = useState(false)

  const { data: sessions, isLoading: loadingSessions } = useSessionsOnDate(
    familyStudentIds, sessionDate, isOpen
  )
  const confirmCallout = useConfirmCallout()

  // Reset state on open
  useEffect(() => {
    if (isOpen) {
      setStep('select')
      setSelectedStudentIds(new Set([clickedStudentId]))
      setScopeByStudent({})
      setResolved([])
      setAcknowledged(false)
    }
  }, [isOpen, clickedStudentId])

  // Group sessions by student
  const sessionsByStudent = useMemo(() => {
    const map = new Map<string, SessionInDay[]>()
    ;(sessions ?? []).forEach(s => {
      const arr = map.get(s.student_id) ?? []
      arr.push(s)
      map.set(s.student_id, arr)
    })
    return map
  }, [sessions])

  const uniqueStudents = useMemo(() => {
    const seen = new Set<string>()
    const out: SessionInDay[] = []
    ;(sessions ?? []).forEach(s => {
      if (!seen.has(s.student_id)) { seen.add(s.student_id); out.push(s) }
    })
    return out
  }, [sessions])

  const toggleStudent = (id: string) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getScope = (studentId: string): 'this_session' | 'all_today' =>
    scopeByStudent[studentId] ?? 'this_session'

  const setScope = (studentId: string, v: 'this_session' | 'all_today') => {
    setScopeByStudent(prev => ({ ...prev, [studentId]: v }))
  }

  // ── Step 1 → resolve makeups ──
  const handleNext = async () => {
    if (!tenantId || selectedStudentIds.size === 0) return
    setResolving(true)
    try {
      const out: ResolvedMakeup[] = []
      for (const studentId of selectedStudentIds) {
        const studentSessions = sessionsByStudent.get(studentId) ?? []
        if (studentSessions.length === 0) continue
        const primary =
          studentSessions.find(s => s.block_id === clickedBlockId) ?? studentSessions[0]
        const scope = studentSessions.length > 1 ? getScope(studentId) : 'this_session'
        const blockIds = scope === 'all_today'
          ? studentSessions.map(s => s.block_id)
          : [primary.block_id]

        if (primary.lesson_day_of_week == null) continue

        // Is the call-out date itself a fifth week?
        const isFifth = await fetchIsFifthWeek(sessionDate)
        let makeupDate: string | null = null
        if (!isFifth) {
          makeupDate = await fetchNextFifthWeek(
            primary.lesson_day_of_week,
            sessionDate,
            tenantId,
            primary.location_id
          )
        }

        const note = await fetchLastSessionNote(studentId)

        out.push({
          student_id: studentId,
          student_first_name: primary.student_first_name,
          location_id: primary.location_id,
          lesson_day_of_week: primary.lesson_day_of_week,
          block_ids: blockIds,
          primary_block_id: primary.block_id,
          scope,
          teacher_profile_id: primary.teacher_profile_id,
          teacher_first_name: primary.teacher_first_name,
          makeup_date: makeupDate,
          callout_date_is_fifth_week: isFifth,
          previous_session_note: note,
        })
      }

      setResolved(out)

      // Decide step based on results
      const anyNoFifth = out.some(r => !r.callout_date_is_fifth_week && !r.makeup_date)
      const allAreFreeFifth = out.every(r => r.callout_date_is_fifth_week)

      if (anyNoFifth) setStep('no-fifth')
      else if (allAreFreeFifth) setStep('free-fifth')
      else setStep('confirm')
    } catch (e: any) {
      toast(e?.message ?? 'Could not check fifth-week availability', 'error')
    } finally {
      setResolving(false)
    }
  }

  // ── Step 4 → confirm ──
  const handleConfirm = async () => {
    try {
      for (const r of resolved) {
        await confirmCallout.mutateAsync({
          student_id: r.student_id,
          student_first_name: r.student_first_name,
          family_id: familyId,
          location_id: r.location_id,
          lesson_day_of_week: r.lesson_day_of_week,
          callout_date: sessionDate,
          primary_block_id: r.primary_block_id,
          block_ids_to_flip: r.block_ids,
          scope: r.scope,
          makeup_date: r.makeup_date,
          previous_session_note: r.previous_session_note,
          teacher_profile_id: r.teacher_profile_id,
          teacher_first_name: r.teacher_first_name,
          family_name: familyName,
        })
      }
      toast('Call-out confirmed 🌽', 'success')
      onClose()
    } catch (e: any) {
      toast(e?.message ?? 'Could not confirm call-out', 'error')
    }
  }

  const handleFreeFifthConfirm = async () => {
    // No makeup needed — still log the callout for each selected student.
    try {
      for (const r of resolved) {
        await confirmCallout.mutateAsync({
          student_id: r.student_id,
          student_first_name: r.student_first_name,
          family_id: familyId,
          location_id: r.location_id,
          lesson_day_of_week: r.lesson_day_of_week,
          callout_date: sessionDate,
          primary_block_id: r.primary_block_id,
          block_ids_to_flip: [], // DO NOT flip — it was a fifth week, block stays as-is
          scope: r.scope,
          makeup_date: null,
          previous_session_note: r.previous_session_note,
          teacher_profile_id: r.teacher_profile_id,
          teacher_first_name: r.teacher_first_name,
          family_name: familyName,
        })
      }
      toast('All good — that was already a fifth week 🌽', 'success')
      onClose()
    } catch (e: any) {
      toast(e?.message ?? 'Could not log call-out', 'error')
    }
  }

  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 540, maxHeight: '92vh', overflowY: 'auto',
          background: '#0c0b16', borderRadius: '16px 16px 0 0',
          border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none',
          padding: '20px 18px 24px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>Call Out This Session</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Step 1 — Select students */}
        {step === 'select' && (
          <>
            <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 10 }}>
              {formatDate(sessionDate)}
            </div>

            {loadingSessions && (
              <div style={{ padding: 24, textAlign: 'center', color: '#8080A8', fontSize: 13 }}>
                Loading…
              </div>
            )}

            {!loadingSessions && uniqueStudents.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: '#8080A8', fontSize: 13 }}>
                No sessions scheduled for your family on this day.
              </div>
            )}

            {!loadingSessions && uniqueStudents.map(s => {
              const studentSessions = sessionsByStudent.get(s.student_id) ?? []
              const multi = studentSessions.length > 1
              const isSelected = selectedStudentIds.has(s.student_id)
              return (
                <div key={s.student_id} style={{
                  marginBottom: 10, padding: 12, borderRadius: 10,
                  background: isSelected ? 'rgba(212,34,106,0.06)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isSelected ? 'rgba(212,34,106,0.25)' : 'rgba(255,255,255,0.06)'}`,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStudent(s.student_id)}
                      style={{ width: 18, height: 18, accentColor: '#D4226A' }}
                    />
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>
                      {s.student_first_name}
                    </span>
                    <span style={{ fontSize: 11, color: '#8080A8', marginLeft: 'auto' }}>
                      {studentSessions.length} session{studentSessions.length !== 1 ? 's' : ''}
                    </span>
                  </label>

                  {isSelected && multi && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <div style={{ fontSize: 11, color: '#A0A0C8', marginBottom: 6 }}>
                        Call out just this session or all of {s.student_first_name}'s sessions today?
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#E0E0F4' }}>
                          <input
                            type="radio"
                            name={`scope-${s.student_id}`}
                            checked={getScope(s.student_id) === 'this_session'}
                            onChange={() => setScope(s.student_id, 'this_session')}
                            style={{ accentColor: '#D4226A' }}
                          />
                          Just this session
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: '#E0E0F4' }}>
                          <input
                            type="radio"
                            name={`scope-${s.student_id}`}
                            checked={getScope(s.student_id) === 'all_today'}
                            onChange={() => setScope(s.student_id, 'all_today')}
                            style={{ accentColor: '#D4226A' }}
                          />
                          All sessions today
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            <button
              onClick={handleNext}
              disabled={selectedStudentIds.size === 0 || resolving}
              style={{
                width: '100%', minHeight: 44, marginTop: 8, borderRadius: 10,
                background: selectedStudentIds.size === 0 || resolving
                  ? 'rgba(255,255,255,0.06)'
                  : 'linear-gradient(180deg, #D4226A, #B01858)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: selectedStudentIds.size === 0 || resolving ? 'not-allowed' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {resolving ? 'Checking…' : 'Continue'}
            </button>
          </>
        )}

        {/* No fifth week — end of year */}
        {step === 'no-fifth' && (
          <>
            <div style={{
              padding: 16, borderRadius: 10,
              background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.2)',
              color: '#E0E0F4', fontSize: 13, lineHeight: 1.6, marginBottom: 14,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>📅 End of year</div>
              There are no more fifth-week makeup dates available this year.
              To call out this session, please text the studio directly so we can help you out! 🌽
            </div>
            <button
              onClick={onClose}
              style={{
                width: '100%', minHeight: 44, borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#E0E0F4', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              Close
            </button>
          </>
        )}

        {/* Call-out date was itself a fifth week */}
        {step === 'free-fifth' && (
          <>
            <div style={{
              padding: 16, borderRadius: 10,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              color: '#E0E0F4', fontSize: 13, lineHeight: 1.6, marginBottom: 14,
            }}>
              🌽 Today was actually your fifth week session anyway — no worries,
              it's already accounted for!
            </div>
            <button
              onClick={handleFreeFifthConfirm}
              disabled={confirmCallout.isPending}
              style={{
                width: '100%', minHeight: 44, borderRadius: 10,
                background: 'linear-gradient(180deg, #22C55E, #16A34A)',
                border: 'none', color: '#fff', fontSize: 14, fontWeight: 700,
                cursor: confirmCallout.isPending ? 'not-allowed' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {confirmCallout.isPending ? 'Logging…' : 'Got it'}
            </button>
          </>
        )}

        {/* Step 4 — Confirmation */}
        {step === 'confirm' && (
          <>
            {resolved.map(r => (
              <div key={r.student_id} style={{
                marginBottom: 14, padding: 14, borderRadius: 10,
                background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.15)',
                color: '#E0E0F4', fontSize: 13, lineHeight: 1.6,
              }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>
                  🎵 No worries! We've got you covered.
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>{r.student_first_name}</strong>'s next available makeup session is:
                </div>
                <div style={{
                  padding: '10px 12px', borderRadius: 8, marginBottom: 10,
                  background: 'rgba(212,34,106,0.12)', border: '1px solid rgba(212,34,106,0.3)',
                  fontSize: 14, fontWeight: 700, color: '#D4226A', textAlign: 'center',
                }}>
                  📅 {formatDate(r.makeup_date!)}
                </div>
                <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 10 }}>
                  This session has been banked in your profile and will automatically appear
                  on your schedule. No need to contact us — it's all taken care of! ✨
                </div>
                {r.previous_session_note ? (
                  <div style={{
                    padding: 10, borderRadius: 8,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: 12, color: '#A0A0C8',
                  }}>
                    In the meantime, keep working on what <strong>{r.teacher_first_name || 'your teacher'}</strong> shared
                    at your last session:
                    <div style={{ marginTop: 6, fontStyle: 'italic', color: '#E0E0F4' }}>
                      "{r.previous_session_note}"
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, color: '#A0A0C8' }}>
                    Keep practicing and we'll see you at your next session! 🌽
                  </div>
                )}
              </div>
            ))}

            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer',
              padding: 12, borderRadius: 10,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
              marginBottom: 14,
            }}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                style={{ width: 18, height: 18, marginTop: 1, accentColor: '#D4226A', flexShrink: 0 }}
              />
              <span style={{ fontSize: 12, color: '#E0E0F4', lineHeight: 1.5 }}>
                I understand my makeup session is confirmed and cannot be moved.
              </span>
            </label>

            <button
              onClick={handleConfirm}
              disabled={!acknowledged || confirmCallout.isPending}
              style={{
                width: '100%', minHeight: 44, borderRadius: 10,
                background: !acknowledged || confirmCallout.isPending
                  ? 'rgba(255,255,255,0.06)'
                  : 'linear-gradient(180deg, #D4226A, #B01858)',
                border: 'none',
                color: !acknowledged || confirmCallout.isPending ? '#606088' : '#fff',
                fontSize: 14, fontWeight: 700,
                cursor: !acknowledged || confirmCallout.isPending ? 'not-allowed' : 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {confirmCallout.isPending ? 'Confirming…' : 'Confirm Call-Out'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
