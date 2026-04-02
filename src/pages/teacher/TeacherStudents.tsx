import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { useTeacherStudentDetail } from '../../hooks/useTeacherStudentView'
import { useTeacherUploads, useUploadTeacherFile, useTeacherStudentNotes, useSaveTeacherNote } from '../../hooks/useTeacherFiles'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Music, Upload, FileText, MessageSquare, ChevronLeft, Check } from 'lucide-react'

const ENGAGE_EMOJI: Record<number, string> = { 1: '\uD83D\uDE34', 2: '\uD83D\uDE10', 3: '\uD83D\uDE42', 4: '\uD83D\uDE04', 5: '\uD83D\uDD25' }
const PROGRESS_LABELS: Record<string, { label: string; color: string }> = { crushing_it: { label: 'Crushing It', color: '#22C55E' }, on_track: { label: 'On Track', color: '#FFB800' }, struggling: { label: 'Needs Work', color: '#EF4444' } }

export default function TeacherStudents() {
  const { profile } = useAuthContext()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: students, isLoading } = useQuery({
    queryKey: ['teacher-my-students', profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile!.id).single()
      if (!teacher) return []
      const { data } = await supabase.from('students').select('id, first_name, instrument, location_id, family_id').eq('teacher_id', teacher.id).eq('status', 'active').order('first_name')
      if (!data) return []

      // Get parent first names (LIMITED — first name only)
      const famIds = [...new Set(data.map(s => s.family_id).filter(Boolean))]
      const famMap = new Map<string, string>()
      if (famIds.length > 0) {
        const { data: fams } = await supabase.from('families').select('id, parent_name').in('id', famIds)
        fams?.forEach((f: any) => { if (f.parent_name) famMap.set(f.id, f.parent_name.split(' ')[0]) })
      }

      // Last session per student
      const { data: logs } = await supabase.from('session_log').select('student_id, block_date, worked_on').eq('teacher_id', teacher.id).in('student_id', data.map(s => s.id)).order('block_date', { ascending: false })
      const lastMap = new Map<string, { date: string; workedOn: string[] }>()
      logs?.forEach((l: any) => { if (!lastMap.has(l.student_id)) lastMap.set(l.student_id, { date: l.block_date, workedOn: l.worked_on ?? [] }) })

      return data.map((s: any) => ({
        ...s,
        parentFirstName: famMap.get(s.family_id) ?? null,
        lastSession: lastMap.get(s.id) ?? null,
      }))
    },
  })

  const filtered = (students ?? []).filter(s => !search || s.first_name.toLowerCase().includes(search.toLowerCase()))

  if (selectedId) return <StudentDetail studentId={selectedId} onBack={() => setSelectedId(null)} />

  return (
    <div className="page" style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>My Students</h1>
        <span style={{ fontSize: 12, color: '#8080A8' }}>{filtered.length} active</span>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4', fontSize: 13, outline: 'none', marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit' }} />

      {isLoading ? <MusicLoader /> : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>No students assigned.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(s => (
            <div key={s.id} onClick={() => setSelectedId(s.id)} style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(212,34,106,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Music size={14} style={{ color: '#D4226A' }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{s.first_name}</div>
                <div style={{ fontSize: 11, color: '#A0A0C8', display: 'flex', gap: 8 }}>
                  {s.instrument && <span>{s.instrument.charAt(0).toUpperCase() + s.instrument.slice(1)}</span>}
                  {s.parentFirstName && <span>Parent: {s.parentFirstName}</span>}
                </div>
                {s.lastSession && <div style={{ fontSize: 10, color: '#606088', marginTop: 2 }}>Last: {s.lastSession.workedOn.slice(0, 2).join(', ') || 'session'} ({s.lastSession.date})</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Student Detail (Teacher View) ───────────────────

function StudentDetail({ studentId, onBack }: { studentId: string; onBack: () => void }) {
  const { data: student } = useTeacherStudentDetail(studentId)
  const [tab, setTab] = useState<'progress' | 'notes' | 'files'>('progress')

  if (!student) return <div className="page" style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}><MusicLoader /></div>

  return (
    <div className="page" style={{ maxWidth: 540, margin: '0 auto', padding: 16 }}>
      <button onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 12, marginBottom: 12 }}>
        <ChevronLeft size={14} /> Back to Students
      </button>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4' }}>{student.firstName}</div>
        <div style={{ fontSize: 13, color: '#A0A0C8', display: 'flex', gap: 8 }}>
          {student.instrument && <span>{student.instrument.charAt(0).toUpperCase() + student.instrument.slice(1)}</span>}
          {student.parentFirstName && <span>Parent: {student.parentFirstName}</span>}
          {student.locationName && <span>{student.locationName}</span>}
        </div>
      </div>

      {/* Achievements */}
      {student.achievements.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
          {student.achievements.map(a => (
            <span key={a.key} title={a.name} style={{ fontSize: 20 }}>{a.emoji}</span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
        {(['progress', 'notes', 'files'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            background: tab === t ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
            color: tab === t ? '#E8488A' : '#8080A8',
            border: tab === t ? '1px solid rgba(212,34,106,0.2)' : '1px solid rgba(255,255,255,0.06)',
          }}>
            {t === 'progress' ? 'Progress' : t === 'notes' ? 'Notes' : 'Files'}
          </button>
        ))}
      </div>

      {tab === 'progress' && <ProgressTab sessions={student.recentSessions} practiceCount={student.practiceCount} />}
      {tab === 'notes' && <NotesTab studentId={studentId} />}
      {tab === 'files' && <FilesTab studentId={studentId} />}
    </div>
  )
}

// ─── Progress Tab ────────────────────────────────────

function ProgressTab({ sessions, practiceCount }: { sessions: any[]; practiceCount: number }) {
  return (
    <div>
      {practiceCount > 0 && (
        <div style={{ fontSize: 11, color: '#f59e0b', marginBottom: 10 }}>Practiced {practiceCount} times in Practice Lab</div>
      )}
      {sessions.length === 0 ? (
        <div style={{ padding: 20, textAlign: 'center', color: '#606088', fontSize: 12 }}>No sessions logged yet.</div>
      ) : sessions.map((s, i) => {
        const prog = PROGRESS_LABELS[s.progressIndicator]
        return (
          <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#E0E0F4', minWidth: 50 }}>{new Date(s.blockDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            <div style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {s.workedOn.map((t: string) => <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(212,34,106,0.08)', color: '#D4226A' }}>{t}</span>)}
            </div>
            {s.engagementLevel && <span style={{ fontSize: 13 }}>{ENGAGE_EMOJI[s.engagementLevel]}</span>}
            {prog && <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: prog.color + '18', color: prog.color }}>{prog.label}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ─── Notes Tab ───────────────────────────────────────

function NotesTab({ studentId }: { studentId: string }) {
  const { data: notes } = useTeacherStudentNotes(studentId)
  const saveNote = useSaveTeacherNote()
  const [draft, setDraft] = useState('')

  const handleSave = async () => {
    if (!draft.trim()) return
    try {
      const result = await saveNote.mutateAsync({ studentId, noteText: draft.trim() })
      toast(result.moderated ? 'Note saved (flagged for review)' : 'Note saved', result.moderated ? 'warning' : 'success')
      setDraft('')
    } catch (err: any) {
      toast(err.message ?? 'Failed to save note', 'error')
    }
  }

  return (
    <div>
      <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Add a note about this student..." style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4', fontSize: 13, resize: 'none', minHeight: 60, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', marginBottom: 8 }} />
      <button onClick={handleSave} disabled={!draft.trim() || saveNote.isPending} style={{ padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: draft.trim() ? '#22C55E' : 'rgba(255,255,255,0.06)', color: draft.trim() ? '#000' : '#606088', border: 'none', cursor: draft.trim() ? 'pointer' : 'default', marginBottom: 14 }}>
        {saveNote.isPending ? 'Saving...' : 'Save Note'}
      </button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(notes ?? []).map(n => (
          <div key={n.id} style={{ padding: '8px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 12, color: '#C0C0E0', lineHeight: 1.5 }}>{n.note_text}</div>
            <div style={{ fontSize: 9, color: '#606088', marginTop: 4 }}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Files Tab ───────────────────────────────────────

function FilesTab({ studentId }: { studentId: string }) {
  const { data: files } = useTeacherUploads(studentId)
  const uploadFile = useUploadTeacherFile()

  const handleUpload = async (file: File) => {
    try {
      await uploadFile.mutateAsync({ studentId, file })
      toast('File uploaded', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Upload failed', 'error')
    }
  }

  return (
    <div>
      {/* Upload zone */}
      <div
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleUpload(f) }}
        onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.onchange = (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) handleUpload(f) }; i.click() }}
        style={{ padding: '20px 16px', borderRadius: 10, textAlign: 'center', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', border: '2px dashed rgba(255,255,255,0.08)', marginBottom: 14 }}
      >
        <Upload size={18} style={{ color: '#8080A8', marginBottom: 4 }} />
        <div style={{ fontSize: 12, color: '#8080A8' }}>{uploadFile.isPending ? 'Uploading...' : 'Drop file or tap to upload'}</div>
      </div>

      {/* File list (read-only — teacher cannot delete or download) */}
      {(files ?? []).length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#606088', fontSize: 11 }}>No files uploaded yet.</div>
      ) : (files ?? []).map(f => (
        <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
          <FileText size={14} style={{ color: '#8080A8', flexShrink: 0 }} />
          <div style={{ flex: 1, fontSize: 12, color: '#C0C0E0' }}>{f.file_name_original}</div>
          <span style={{ fontSize: 9, color: '#606088' }}>{new Date(f.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          {f.moderation_status === 'flagged' && <span style={{ fontSize: 8, color: '#FFB800', fontWeight: 700 }}>Under Review</span>}
        </div>
      ))}
    </div>
  )
}
