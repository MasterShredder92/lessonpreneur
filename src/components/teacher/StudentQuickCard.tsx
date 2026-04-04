import { useState } from 'react'
import { useTeacherStudentCard } from '../../hooks/useTeacherDashboard'
import { useTeacherStudentNotes, useSaveTeacherNote } from '../../hooks/useTeacherFiles'
import { toast } from '../shared/Toast'
import { getLocationColor } from '../../utils/locationColor'
import { X } from 'lucide-react'
import MusicLoader from '../shared/MusicLoader'

interface Props {
  studentId: string
  onClose: () => void
}

export default function StudentQuickCard({ studentId, onClose }: Props) {
  const { data: student, isLoading } = useTeacherStudentCard(studentId)
  const { data: notes } = useTeacherStudentNotes(studentId)
  const saveNote = useSaveTeacherNote()
  const [draft, setDraft] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)

  const handleSaveNote = async () => {
    if (!draft.trim()) return
    if (draft.length > 500) { toast('Note must be under 500 characters', 'error'); return }
    try {
      const result = await saveNote.mutateAsync({ studentId, noteText: draft.trim() })
      toast(result.moderated ? 'Note saved (flagged for review)' : 'Note saved', result.moderated ? 'warning' : 'success')
      setDraft('')
      setShowNoteInput(false)
    } catch (err: any) {
      toast(err.message ?? 'Failed to save note', 'error')
    }
  }

  const locationColor = student?.location_id ? getLocationColor(student.location_id) : '#D4226A'

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2,2,9,0.85)', backdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, maxHeight: '85vh', overflowY: 'auto',
          margin: 16, borderRadius: 16,
          background: 'rgba(16,14,32,0.98)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        }}
      >
        {isLoading || !student ? (
          <div style={{ padding: 60, textAlign: 'center' }}><MusicLoader /></div>
        ) : (
          <>
            {/* Header */}
            <div style={{
              padding: '20px 20px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>
                  {student.first_name} {student.instrument ? `— ${capitalize(student.instrument)}` : ''}
                </div>
                {student.location_name && (
                  <span style={{
                    display: 'inline-block', marginTop: 6,
                    padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                    color: locationColor, background: `${locationColor}18`,
                    border: `1px solid ${locationColor}30`,
                  }}>
                    {student.location_name}
                  </span>
                )}
              </div>
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
                padding: 6, cursor: 'pointer', color: '#8080A8', flexShrink: 0,
              }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px 20px 20px' }}>
              {/* About This Student */}
              {(student.age || student.experience || student.has_instrument || student.start_date || student.first_lesson_date || student.total_lessons_taken) && (
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel>About This Student</SectionLabel>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {student.age && <InfoRow label="Age" value={student.age} />}
                    {student.experience && <InfoRow label="Experience" value={student.experience} />}
                    {student.has_instrument && <InfoRow label="Has their own instrument" value={student.has_instrument} />}
                    {(student.start_date || student.first_lesson_date) && (
                      <InfoRow label="On your schedule since" value={formatDate(student.start_date || student.first_lesson_date!)} />
                    )}
                    {student.total_lessons_taken != null && student.total_lessons_taken > 0 && (
                      <InfoRow label="Total sessions" value={String(student.total_lessons_taken)} />
                    )}
                  </div>
                </div>
              )}

              {/* Goals */}
              <div style={{ marginBottom: 20 }}>
                <SectionLabel>Goals</SectionLabel>
                <p style={{ fontSize: 13, color: student.goals ? '#C8C8E0' : '#606088', lineHeight: 1.6, margin: 0, fontStyle: student.goals ? 'normal' : 'italic' }}>
                  {student.goals ?? 'No goals recorded yet'}
                </p>
              </div>

              {/* Learning Style */}
              <div style={{ marginBottom: 20 }}>
                <SectionLabel>Learning Style</SectionLabel>
                <p style={{ fontSize: 13, color: student.learning_style ? '#C8C8E0' : '#606088', lineHeight: 1.6, margin: 0, fontStyle: student.learning_style ? 'normal' : 'italic' }}>
                  {student.learning_style ?? 'No learning style notes yet'}
                </p>
              </div>

              {/* About (bio) */}
              {student.bio && (
                <div style={{ marginBottom: 20 }}>
                  <SectionLabel>About</SectionLabel>
                  <p style={{ fontSize: 13, color: '#C8C8E0', lineHeight: 1.6, margin: 0 }}>
                    {student.bio}
                  </p>
                </div>
              )}

              {/* Session Notes */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <SectionLabel style={{ marginBottom: 0 }}>Your Session Notes</SectionLabel>
                  {!showNoteInput && (
                    <button onClick={() => setShowNoteInput(true)} style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: 'rgba(212,34,106,0.1)', color: '#D4226A',
                      border: '1px solid rgba(212,34,106,0.2)', cursor: 'pointer',
                    }}>
                      Add Note
                    </button>
                  )}
                </div>

                {showNoteInput && (
                  <div style={{ marginBottom: 12 }}>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, 500))}
                      placeholder="Add a session note..."
                      autoFocus
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#E0E0F4', fontSize: 13, resize: 'none', minHeight: 70,
                        fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: '#606088' }}>{draft.length}/500</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setShowNoteInput(false); setDraft('') }} style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                        }}>Cancel</button>
                        <button onClick={handleSaveNote} disabled={!draft.trim() || saveNote.isPending} style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: draft.trim() ? '#D4226A' : 'rgba(255,255,255,0.06)',
                          color: draft.trim() ? '#fff' : '#606088', border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
                        }}>
                          {saveNote.isPending ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {(!notes || notes.length === 0) && !showNoteInput ? (
                  <p style={{ fontSize: 12, color: '#606088', fontStyle: 'italic', margin: 0 }}>No session notes yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(notes ?? []).map(n => (
                      <div key={n.id} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.5 }}>{n.note_text}</div>
                        <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>
                          {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 8, ...style,
    }}>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8080A8' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#C8C8E0' }}>{value}</span>
    </div>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
