import { useState, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useTeacherStudentCard, useTeacherStudentFiles, useUploadStudentFile, useSaveTeacherNoteWithAudit } from '../../hooks/useTeacherDashboard'
import { useTeacherStudentNotes } from '../../hooks/useTeacherFiles'
import { toast } from '../shared/Toast'
import { getLocationColor } from '../../utils/locationColor'
import { X, Upload, FileText, ExternalLink, ChevronDown, ChevronUp, ArrowRightLeft, Lock } from 'lucide-react'
import MusicLoader from '../shared/MusicLoader'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'

interface Props {
  studentId: string
  /** Optional: recurring schedule label e.g. "Tuesdays 3:00 PM" */
  scheduleLabel?: string
  onClose: () => void
}

/** Fetch previous teacher's notes for handoff */
function useHandoffNotes(studentId: string, previousTeacherId: string | null | undefined) {
  return useQuery<{ id: string; note_text: string; created_at: string }[]>({
    queryKey: ['handoff_notes', studentId, previousTeacherId],
    enabled: !!previousTeacherId,
    queryFn: async () => {
      if (!previousTeacherId) return []
      const { data } = await supabase
        .from('teacher_student_notes')
        .select('id, note_text, created_at')
        .eq('student_id', studentId)
        .eq('teacher_id', previousTeacherId)
        .order('created_at', { ascending: false })
        .limit(10)
      return data ?? []
    },
  })
}

function getEnrollmentDuration(startDate: string | null): string | null {
  if (!startDate) return null
  const start = new Date(startDate + 'T12:00:00')
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  if (diffMs < 0) return null
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''}`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`
  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (remainingMonths === 0) return `${years} year${years !== 1 ? 's' : ''}`
  return `${years}y ${remainingMonths}m`
}

function getFrequencyLabel(blocksPerWeek: number | null): string | null {
  if (!blocksPerWeek || blocksPerWeek <= 0) return null
  if (blocksPerWeek === 1) return '1x per week'
  return `${blocksPerWeek}x per week`
}

export default function StudentProfileCard({ studentId, scheduleLabel, onClose }: Props) {
  const { data: student, isLoading } = useTeacherStudentCard(studentId)
  const { data: notes } = useTeacherStudentNotes(studentId)
  const { data: files } = useTeacherStudentFiles(studentId)
  const { data: handoffNotes } = useHandoffNotes(studentId, student?.previous_teacher_id)
  const saveNote = useSaveTeacherNoteWithAudit()
  const uploadFile = useUploadStudentFile()
  const [draft, setDraft] = useState('')
  const [showNoteInput, setShowNoteInput] = useState(false)
  const [handoffExpanded, setHandoffExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const locationColor = student?.location_id ? getLocationColor(student.location_id) : '#D4226A'

  const handleSaveNote = async () => {
    if (!draft.trim() || !student) return
    if (draft.length > 1000) { toast('Note must be under 1000 characters', 'error'); return }
    try {
      await saveNote.mutateAsync({ studentId, studentFirstName: student.first_name, noteText: draft.trim() })
      toast('Student note saved', 'success')
      setDraft('')
      setShowNoteInput(false)
    } catch (err: any) {
      toast(err.message ?? 'Failed to save note', 'error')
    }
  }

  const handleUpload = async (file: File) => {
    if (!student) return
    try {
      await uploadFile.mutateAsync({ studentId, studentFirstName: student.first_name, file })
      toast('File uploaded to student record', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Upload failed', 'error')
    }
  }

  const enrollmentDuration = student ? getEnrollmentDuration(student.start_date || student.first_lesson_date) : null
  const frequencyLabel = student ? getFrequencyLabel(student.blocks_per_week) : null
  const hasHandoff = student?.previous_teacher_id && student?.previous_teacher_name

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(2,2,9,0.85)', backdropFilter: 'blur(8px)',
    }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto',
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
            {/* HEADER */}
            <div style={{
              padding: '20px 20px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>
                  {student.first_name} {student.instrument ? `— ${getInstrumentEmoji(student.instrument)} ${capitalize(student.instrument)}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {student.location_name && (
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                      color: locationColor, background: `${locationColor}18`,
                      border: `1px solid ${locationColor}30`,
                    }}>
                      {student.location_name}
                    </span>
                  )}
                  {scheduleLabel && (
                    <span style={{ fontSize: 12, color: '#8080A8' }}>{scheduleLabel}</span>
                  )}
                  {frequencyLabel && (
                    <span style={{
                      padding: '3px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
                      color: '#7B2CBF', background: 'rgba(123,44,191,0.1)',
                    }}>
                      {frequencyLabel}
                    </span>
                  )}
                </div>
              </div>
              <button onClick={onClose} style={{
                background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: 8,
                padding: 6, cursor: 'pointer', color: '#8080A8', flexShrink: 0,
              }}>
                <X size={16} />
              </button>
            </div>

            <div style={{ padding: '16px 20px 20px' }}>
              {/* ABOUT */}
              {(student.age || student.experience || student.has_instrument || enrollmentDuration || student.total_lessons_taken) && (
                <Section title="About">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {student.age && <InfoRow label="Age" value={student.age} />}
                    {student.experience && <InfoRow label="Experience" value={student.experience} />}
                    {student.has_instrument && <InfoRow label="Has own instrument" value={student.has_instrument} />}
                    {enrollmentDuration && (
                      <InfoRow label="Enrolled" value={enrollmentDuration} />
                    )}
                    {student.total_lessons_taken != null && student.total_lessons_taken > 0 && (
                      <InfoRow label="Total sessions" value={String(student.total_lessons_taken)} />
                    )}
                  </div>
                </Section>
              )}

              {/* GOALS & LEARNING STYLE */}
              <Section title="Goals & Learning Style">
                <div style={{ marginBottom: 10 }}>
                  <MiniLabel>Goals</MiniLabel>
                  <p style={{ fontSize: 13, color: student.goals ? '#C8C8E0' : '#606088', lineHeight: 1.6, margin: 0, fontStyle: student.goals ? 'normal' : 'italic' }}>
                    {student.goals ?? 'Not yet recorded — ask your director to add this.'}
                  </p>
                </div>
                <div style={{ marginBottom: student.bio ? 10 : 0 }}>
                  <MiniLabel>Learning Style</MiniLabel>
                  <p style={{ fontSize: 13, color: student.learning_style ? '#C8C8E0' : '#606088', lineHeight: 1.6, margin: 0, fontStyle: student.learning_style ? 'normal' : 'italic' }}>
                    {student.learning_style ?? 'Not yet recorded — ask your director to add this.'}
                  </p>
                </div>
                {student.bio && (
                  <div>
                    <MiniLabel>Personality / About</MiniLabel>
                    <p style={{ fontSize: 13, color: '#C8C8E0', lineHeight: 1.6, margin: 0 }}>{student.bio}</p>
                  </div>
                )}
              </Section>

              {/* TEACHER HANDOFF */}
              {hasHandoff && (
                <Section title="Teacher Handoff">
                  <div style={{
                    padding: '12px 14px', borderRadius: 10,
                    background: 'rgba(123,44,191,0.06)',
                    border: '1px solid rgba(123,44,191,0.15)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <ArrowRightLeft size={14} style={{ color: '#7B2CBF' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#C8C8E0' }}>
                        Transferred from {student.previous_teacher_name}
                      </span>
                    </div>
                    {student.teacher_changed_at && (
                      <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 10 }}>
                        {formatDate(student.teacher_changed_at.split('T')[0])}
                      </div>
                    )}

                    {/* Previous teacher's notes */}
                    {handoffNotes && handoffNotes.length > 0 ? (
                      <>
                        <button
                          onClick={() => setHandoffExpanded(prev => !prev)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
                            padding: '6px 0', background: 'none', border: 'none',
                            cursor: 'pointer', color: '#A0A0C8', fontSize: 11, fontWeight: 600,
                          }}
                        >
                          {handoffExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {handoffExpanded ? 'Hide' : 'View'} {handoffNotes.length} note{handoffNotes.length !== 1 ? 's' : ''} from {student.previous_teacher_name}
                        </button>
                        {handoffExpanded && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                            {handoffNotes.map(n => (
                              <div key={n.id} style={{
                                padding: '8px 10px', borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)',
                              }}>
                                <div style={{ fontSize: 12, color: '#B0B0D0', lineHeight: 1.5 }}>{n.note_text}</div>
                                <div style={{ fontSize: 9, color: '#606088', marginTop: 3 }}>
                                  {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <p style={{ fontSize: 11, color: '#606088', fontStyle: 'italic', margin: 0 }}>
                        No student notes from previous teacher.
                      </p>
                    )}
                  </div>
                </Section>
              )}

              {/* STUDENT NOTES */}
              <Section title="Student Notes" subtitle={`${(notes ?? []).length} note${(notes ?? []).length !== 1 ? 's' : ''}`}
                action={!showNoteInput ? (
                  <button onClick={() => setShowNoteInput(true)} style={{
                    padding: '5px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    background: '#D4226A', color: '#fff',
                    border: 'none', cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(212,34,106,0.3)',
                  }}>
                    Add Student Note
                  </button>
                ) : undefined}
              >
                {showNoteInput && (
                  <div style={{ marginBottom: 14 }}>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
                      placeholder="What did you work on? How did the session go? Any focus areas for next time?"
                      autoFocus
                      spellCheck={true}
                      lang="en"
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#E0E0F4', fontSize: 13, resize: 'none', minHeight: 80,
                        fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <span style={{ fontSize: 10, color: '#606088' }}>{draft.length}/1000</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setShowNoteInput(false); setDraft('') }} style={{
                          padding: '6px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                          background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                        }}>Cancel</button>
                        <button onClick={handleSaveNote} disabled={!draft.trim() || saveNote.isPending} style={{
                          padding: '6px 14px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                          background: draft.trim() ? '#D4226A' : 'rgba(255,255,255,0.06)',
                          color: draft.trim() ? '#fff' : '#606088', border: 'none', cursor: draft.trim() ? 'pointer' : 'default',
                        }}>
                          {saveNote.isPending ? 'Saving...' : 'Save Note'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {(!notes || notes.length === 0) && !showNoteInput ? (
                  <p style={{ fontSize: 12, color: '#606088', fontStyle: 'italic', margin: 0 }}>
                    No student notes yet. Add your first note after your next session.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(notes ?? []).map(n => (
                      <div key={n.id} style={{
                        padding: '10px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <div style={{ fontSize: 13, color: '#C0C0E0', lineHeight: 1.5 }}>{n.note_text}</div>
                        <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>
                          {new Date(n.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                          {' at '}
                          {new Date(n.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {/* STUDENT FILES */}
              <Section title="Student Files" subtitle="Upload documents to this student's file."
                action={
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                      style={{ display: 'none' }}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = '' }}
                    />
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploadFile.isPending} style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                      background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                      border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer',
                      opacity: uploadFile.isPending ? 0.6 : 1,
                    }}>
                      <Upload size={12} />
                      {uploadFile.isPending ? 'Uploading...' : 'Upload File'}
                    </button>
                  </>
                }
              >
                {(!files || files.length === 0) ? (
                  <p style={{ fontSize: 12, color: '#606088', fontStyle: 'italic', margin: 0 }}>No files uploaded yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map(f => (
                      <div key={f.id} style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.03)',
                      }}>
                        <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, color: '#C0C0E0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</div>
                          <div style={{ fontSize: 10, color: '#606088' }}>
                            {new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </div>
                        </div>
                        {f.file_url && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 4,
                            fontSize: 10, fontWeight: 600, color: '#606088',
                            background: 'rgba(255,255,255,0.04)',
                          }} title="Downloads are available to students and families only.">
                            <Lock size={10} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────

function Section({ title, subtitle, action, children }: {
  title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 10, color: '#606088', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 3 }}>{children}</div>
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: '#8080A8' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#C8C8E0' }}>{value}</span>
    </div>
  )
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1) }

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
