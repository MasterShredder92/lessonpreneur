import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useParentFamily } from '../../hooks/useParentFamily'
import { usePracticeStats, usePracticeHistory, useLogPractice, useLogPracticeManual } from '../../hooks/usePractice'
import MusicLoader from '../../components/shared/MusicLoader'
import { toast } from '../../components/shared/Toast'
import { Music, Plus, X, Mic, Square, Play } from 'lucide-react'
import DrumsWidget from '../../components/instruments/DrumsWidget'
import { defer } from '../../lib/defer'

const audioCache = new Map<string, HTMLAudioElement>()
function playSound(src: string) {
  let audio = audioCache.get(src)
  if (!audio) { audio = new Audio(src); audioCache.set(src, audio) }
  audio.currentTime = 0
  audio.play().catch(() => {})
}

export default function ParentPractice() {
  const { familyId, students, isLoading } = useParentFamily()
  const [searchParams] = useSearchParams()
  const initialStudent = searchParams.get('student')
  const [selectedStudent, setSelectedStudent] = useState<string | null>(initialStudent)
  const [showManualForm, setShowManualForm] = useState(false)

  useEffect(() => {
    if (students.length === 0) return
    if (initialStudent && students.some(s => s.id === initialStudent)) {
      defer(() => setSelectedStudent(initialStudent))
      return
    }
    if (!selectedStudent) defer(() => setSelectedStudent(students[0].id))
  }, [students, selectedStudent, initialStudent])

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  const student = students.find(s => s.id === selectedStudent)

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: '0 0 4px' }}>Practice Lab</h1>
      <p style={{ fontSize: 12, color: '#8080A8', margin: '0 0 16px' }}>Start a practice session for your child</p>

      {students.length > 1 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, overflowX: 'auto' }}>
          {students.map(s => (
            <button
              key={s.id}
              onClick={() => setSelectedStudent(s.id)}
              style={{
                padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: selectedStudent === s.id ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
                color: selectedStudent === s.id ? '#D4226A' : '#8080A8',
                border: `1px solid ${selectedStudent === s.id ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.06)'}`,
                whiteSpace: 'nowrap',
              }}
            >
              {s.first_name}
            </button>
          ))}
        </div>
      )}

      {student && (
        <PracticeSession
          key={student.id}
          studentId={student.id}
          studentName={student.first_name}
          instrument={student.instrument}
          familyId={familyId}
          onOpenManual={() => setShowManualForm(true)}
        />
      )}

      {showManualForm && student && (
        <ManualEntryModal
          studentId={student.id}
          studentName={student.first_name}
          instrument={student.instrument}
          familyId={familyId}
          onClose={() => setShowManualForm(false)}
        />
      )}
    </div>
  )
}

function PracticeSession({ studentId, studentName, instrument, familyId, onOpenManual }: {
  studentId: string; studentName: string; instrument: string | null; familyId: string | null; onOpenManual: () => void
}) {
  const logPractice = useLogPractice()
  const { data: stats } = usePracticeStats(studentId)
  const { data: history } = usePracticeHistory(studentId)
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startTimer = useCallback((tool: string) => {
    setActiveTool(tool)
    setTimer(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (activeTool && timer > 5) {
      logPractice.mutate(
        { studentId, familyId, instrument: instrument ?? activeTool, toolUsed: activeTool, durationSeconds: timer },
        {
          onSuccess: () => toast('Practice logged!', 'success'),
          onError: (err: unknown) =>
            toast(err instanceof Error ? err.message : 'Failed to log practice', 'error'),
        }
      )
    }
    setActiveTool(null)
    setTimer(0)
  }, [activeTool, studentId, familyId, instrument, timer, logPractice])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const logDrumsSession = useCallback(() => {
    logPractice.mutate(
      { studentId, familyId, instrument: 'drums', toolUsed: 'drums_widget', durationSeconds: 0 },
      {
        onSuccess: () => toast('Practice session logged! 🥁', 'success'),
        onError: (err: unknown) =>
          toast(err instanceof Error ? err.message : 'Failed to log practice', 'error'),
      }
    )
  }, [logPractice, studentId, familyId])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const inst = instrument?.toLowerCase() ?? 'piano'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{studentName}'s Practice</div>
        <button
          onClick={onOpenManual}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 6,
            fontSize: 11, fontWeight: 700, background: 'rgba(212,34,106,0.08)', color: '#D4226A',
            border: '1px solid rgba(212,34,106,0.2)', cursor: 'pointer',
          }}
        >
          <Plus size={11} /> Log After the Fact
        </button>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <StatBox value={stats.currentStreak} label="day streak" color="#FFB800" />
          <StatBox value={stats.totalSessions} label="practices" color="#22C55E" />
          <StatBox value={stats.totalMinutes} label="minutes" color="#D4226A" />
        </div>
      )}

      {stats && stats.recentSuggestions.length > 0 && (
        <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 10, background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>From Their Teacher</div>
          <div style={{ fontSize: 13, color: '#C0C0E0' }}>
            Practice: {stats.recentSuggestions.map((s, i) => (
              <span key={s} style={{ fontWeight: 600, color: '#E0E0F4' }}>{s}{i < stats.recentSuggestions.length - 1 ? ', ' : ''}</span>
            ))}
          </div>
        </div>
      )}

      {activeTool && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, textAlign: 'center', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Practicing: {activeTool}</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: '#22C55E', fontFamily: 'monospace' }}>{fmt(timer)}</div>
          <button onClick={stopTimer} style={{ marginTop: 8, padding: '8px 24px', borderRadius: 8, fontSize: 13, fontWeight: 700, background: '#22C55E', color: '#000', border: 'none', cursor: 'pointer' }}>Done</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Their Instrument</div>
        <ToolCard tool={inst} primary onStart={startTimer} isActive={activeTool === inst} onLogDrums={inst === 'drums' ? logDrumsSession : undefined} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8 }}>Try Something New</div>
        {['piano', 'drums', 'guitar', 'voice'].filter(t => t !== inst).map(tool => (
          <ToolCard key={tool} tool={tool} onStart={startTimer} isActive={activeTool === tool} onLogDrums={tool === 'drums' ? logDrumsSession : undefined} />
        ))}
      </div>

      {history && history.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Recent Practices
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {history.slice(0, 10).map(h => (
              <div key={h.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4' }}>
                    {new Date(h.practice_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {h.is_manual_entry && <span style={{ fontSize: 9, color: '#8080A8', marginLeft: 6, fontWeight: 500 }}>· manual</span>}
                  </div>
                  <div style={{ fontSize: 10, color: '#8080A8', marginTop: 1 }}>
                    {h.tool_used && h.tool_used !== 'manual' ? `${h.tool_used}` : (h.instrument ?? 'practice')}
                    {h.notes ? ` · ${h.notes}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#D4226A', flexShrink: 0 }}>
                  {h.duration_minutes}m
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ManualEntryModal({ studentId, studentName, instrument, familyId, onClose }: {
  studentId: string; studentName: string; instrument: string | null; familyId: string | null; onClose: () => void
}) {
  const logManual = useLogPracticeManual()
  const today = new Date().toISOString().split('T')[0]
  const [practiceDate, setPracticeDate] = useState(today)
  const [durationMinutes, setDurationMinutes] = useState('15')
  const [notes, setNotes] = useState('')

  const mins = parseInt(durationMinutes)
  const canSave = !isNaN(mins) && mins > 0 && mins <= 600 && practiceDate

  const handleSave = async () => {
    if (!canSave) return
    try {
      await logManual.mutateAsync({
        studentId, familyId, instrument,
        practiceDate, durationMinutes: mins, notes: notes.trim() || null,
      })
      toast('Practice logged', 'success')
      onClose()
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : 'Failed to log practice', 'error')
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#E8E8FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 440, background: '#0c0b16', borderRadius: 16,
        border: '1px solid rgba(255,255,255,0.08)', padding: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Log Practice After the Fact</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 16 }}>For {studentName}</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Date</label>
            <input type="date" value={practiceDate} max={today} onChange={e => setPracticeDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Duration (minutes)</label>
            <input type="number" min={1} max={600} value={durationMinutes} onChange={e => setDurationMinutes(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#A0A0C8', marginBottom: 4, display: 'block' }}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="What did they work on?"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <button
            onClick={handleSave}
            disabled={!canSave || logManual.isPending}
            style={{
              padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
              cursor: (!canSave || logManual.isPending) ? 'not-allowed' : 'pointer',
              background: canSave ? '#D4226A' : 'rgba(255,255,255,0.06)',
              color: canSave ? '#fff' : '#606088',
              opacity: logManual.isPending ? 0.5 : 1, marginTop: 4,
            }}
          >
            {logManual.isPending ? 'Saving...' : 'Log Practice'}
          </button>
        </div>
      </div>
    </div>
  )
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div style={{ flex: 1, padding: '12px 14px', borderRadius: 10, background: `${color}08`, border: `1px solid ${color}18`, textAlign: 'center' }}>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: '#8080A8' }}>{label}</div>
    </div>
  )
}

function ToolCard({ tool, primary, onStart, isActive, onLogDrums }: {
  tool: string; primary?: boolean; onStart: (t: string) => void; isActive: boolean; onLogDrums?: () => void
}) {
  const colors: Record<string, string> = { piano: '#3b82f6', drums: '#EF4444', guitar: '#FFB800', voice: '#22C55E' }
  const color = colors[tool] ?? '#D4226A'
  const showInstrument = primary || isActive
  const isDrums = tool === 'drums'
  return (
    <div style={{
      padding: isDrums && showInstrument ? 0 : 16, borderRadius: 12, overflow: 'hidden',
      background: isActive ? `${color}10` : 'rgba(255,255,255,0.02)',
      border: `1px solid ${isActive ? `${color}30` : 'rgba(255,255,255,0.06)'}`,
      borderLeft: primary ? `3px solid ${color}` : undefined,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: showInstrument ? 12 : 0,
        padding: isDrums && showInstrument ? '16px 16px 0' : undefined,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Music size={16} style={{ color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
        </div>
        {!isActive && <button onClick={() => onStart(tool)} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: `${color}15`, color, border: `1px solid ${color}30`, cursor: 'pointer' }}>Practice</button>}
      </div>
      {showInstrument && tool === 'piano' && <FullPiano />}
      {showInstrument && isDrums && (
        <div>
          <div style={{ margin: '0 -0px' }}><DrumsWidget /></div>
          {onLogDrums && (
            <div style={{ padding: '0 16px 16px', textAlign: 'center' }}>
              <button
                onClick={onLogDrums}
                style={{
                  width: '100%', maxWidth: 320, padding: '12px 24px', borderRadius: 10,
                  fontSize: 14, fontWeight: 800, cursor: 'pointer',
                  background: '#D4226A', color: '#fff', border: 'none',
                }}
              >
                Log This Session
              </button>
            </div>
          )}
        </div>
      )}
      {showInstrument && tool === 'guitar' && <GuitarChords />}
      {showInstrument && tool === 'voice' && <VocalsRecorder />}
    </div>
  )
}

function FullPiano() {
  // White keys with black keys overlaid
  const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C2']
  // position: index of white key after which black key appears
  const blackKeys: { note: string; afterIdx: number }[] = [
    { note: 'Cs', afterIdx: 0 }, { note: 'Ds', afterIdx: 1 },
    { note: 'Fs', afterIdx: 3 }, { note: 'Gs', afterIdx: 4 }, { note: 'As', afterIdx: 5 },
  ]
  const keyWidth = 40
  const gap = 3
  return (
    <div style={{ position: 'relative', display: 'flex', gap, justifyContent: 'center', overflowX: 'auto', paddingBottom: 2 }}>
      <div style={{ position: 'relative', display: 'flex', gap }}>
        {whiteKeys.map(n => (
          <button key={n} onClick={() => playSound(`/audio/piano/${n}.wav`)} style={{
            width: keyWidth, height: 110, borderRadius: '0 0 6px 6px', background: 'linear-gradient(180deg, #fff 70%, #e0e0e0)',
            border: '1px solid #ccc', cursor: 'pointer', fontSize: 10, color: '#666', fontWeight: 600,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6,
          }}>{n.replace('2', '')}</button>
        ))}
        {blackKeys.map(bk => {
          const left = (bk.afterIdx + 1) * (keyWidth + gap) - (keyWidth * 0.35) - gap / 2
          return (
            <button key={bk.note}
              onClick={e => { e.stopPropagation(); playSound(`/audio/piano/${bk.note}.wav`) }}
              style={{
                position: 'absolute', top: 0, left, width: keyWidth * 0.7, height: 68,
                borderRadius: '0 0 4px 4px', background: 'linear-gradient(180deg, #222 70%, #000)',
                border: '1px solid #000', cursor: 'pointer', zIndex: 2,
              }} />
          )
        })}
      </div>
    </div>
  )
}


// Standard open chord voicings: [E2, A2, D3, G3, B3, E4] — null = muted
const CHORDS: Record<string, (number | null)[]> = {
  C:  [null, 3, 2, 0, 1, 0],
  G:  [3, 2, 0, 0, 3, 3],
  D:  [null, null, 0, 2, 3, 2],
  A:  [null, 0, 2, 2, 2, 0],
  E:  [0, 2, 2, 1, 0, 0],
  Am: [null, 0, 2, 2, 1, 0],
  Em: [0, 2, 2, 0, 0, 0],
  Dm: [null, null, 0, 2, 3, 1],
  F:  [1, 3, 3, 2, 1, 1],
}
const GUITAR_STRINGS = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']

function strumChord(name: string) {
  const voicing = CHORDS[name]
  if (!voicing) return
  voicing.forEach((fret, i) => {
    if (fret === null) return
    setTimeout(() => playSound(`/audio/guitar/${GUITAR_STRINGS[i]}/${fret}.wav`), i * 35)
  })
}

function GuitarChords() {
  const chords = Object.keys(CHORDS)
  return (
    <div>
      <div style={{ fontSize: 10, color: '#8080A8', textAlign: 'center', marginBottom: 8 }}>Tap a chord to strum</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {chords.map(ch => (
          <button key={ch} onClick={() => strumChord(ch)} style={{
            height: 52, borderRadius: 10, background: 'rgba(255,184,0,0.08)',
            border: '2px solid rgba(255,184,0,0.25)', color: '#FFB800', fontSize: 16, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{ch}</button>
        ))}
      </div>
    </div>
  )
}

function VocalsRecorder() {
  const [recording, setRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (tickRef.current) clearInterval(tickRef.current)
    mediaRecorderRef.current?.stream.getTracks().forEach(t => t.stop())
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }, [audioUrl])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream)
      chunksRef.current = []
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (audioUrl) URL.revokeObjectURL(audioUrl)
        setAudioUrl(URL.createObjectURL(blob))
        stream.getTracks().forEach(t => t.stop())
      }
      mr.start()
      mediaRecorderRef.current = mr
      setRecording(true)
      setElapsed(0)
      tickRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } catch {
      toast('Microphone permission denied', 'error')
    }
  }

  const stopRecording = () => {
    mediaRecorderRef.current?.stop()
    setRecording(false)
    if (tickRef.current) clearInterval(tickRef.current)
  }

  const playRecording = () => {
    if (audioUrl) {
      const a = new Audio(audioUrl)
      a.play().catch(() => {})
    }
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  return (
    <div>
      <div style={{ fontSize: 10, color: '#8080A8', textAlign: 'center', marginBottom: 10 }}>
        {recording ? 'Recording...' : audioUrl ? 'Recorded — play it back' : 'Record a vocal take'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        {!recording ? (
          <button onClick={startRecording} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10,
            background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.35)',
            color: '#22C55E', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>
            <Mic size={16} /> Record
          </button>
        ) : (
          <button onClick={stopRecording} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', borderRadius: 10,
            background: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.4)',
            color: '#EF4444', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>
            <Square size={14} fill="#EF4444" /> Stop · {fmt(elapsed)}
          </button>
        )}
        {audioUrl && !recording && (
          <button onClick={playRecording} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 18px', borderRadius: 10,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
            color: '#22C55E', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>
            <Play size={14} /> Play
          </button>
        )}
      </div>
    </div>
  )
}
