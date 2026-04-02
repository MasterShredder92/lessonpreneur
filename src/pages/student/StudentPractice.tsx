import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { usePracticeStats, useLogPractice } from '../../hooks/usePractice'
import MusicLoader from '../../components/shared/MusicLoader'
import { Music } from 'lucide-react'

const audioCache = new Map<string, HTMLAudioElement>()
function playSound(src: string) {
  let audio = audioCache.get(src)
  if (!audio) { audio = new Audio(src); audioCache.set(src, audio) }
  audio.currentTime = 0
  audio.play().catch(() => {})
}

export default function StudentPractice() {
  const { profile } = useAuthContext()
  const logPractice = useLogPractice()
  const [activeTool, setActiveTool] = useState<string | null>(null)
  const [timer, setTimer] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const { data: student } = useQuery({
    queryKey: ['student-self', profile?.id],
    enabled: !!profile?.email,
    queryFn: async () => {
      const { data: fam } = await supabase.from('families').select('id').ilike('primary_email', profile!.email!).limit(1).single()
      if (!fam) return null
      const { data: stu } = await supabase.from('students').select('id, first_name, instrument, tenant_id').eq('family_id', fam.id).eq('status', 'active').limit(1).single()
      return stu
    },
  })

  const { data: stats } = usePracticeStats(student?.id)

  const startTimer = useCallback((tool: string) => {
    setActiveTool(tool)
    setTimer(0)
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
  }, [])

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (activeTool && student && timer > 5) {
      logPractice.mutate({ studentId: student.id, instrument: student.instrument ?? activeTool, toolUsed: activeTool, durationSeconds: timer })
    }
    setActiveTool(null)
    setTimer(0)
  }, [activeTool, student, timer, logPractice])

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (!profile) return <div className="page" style={{ padding: 40, textAlign: 'center' }}><MusicLoader /></div>

  const instrument = student?.instrument?.toLowerCase() ?? 'piano'

  return (
    <div className="page" style={{ maxWidth: 560, margin: '0 auto', padding: 16 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#E0E0F4', margin: '0 0 4px' }}>Practice Lab</h1>
        {student && <div style={{ fontSize: 13, color: '#A0A0C8' }}>Hey {student.first_name}!</div>}
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
          <div style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>From Your Teacher</div>
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
        <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your Instrument</div>
        <ToolCard tool={instrument} primary onStart={startTimer} isActive={activeTool === instrument} />
        <div style={{ fontSize: 11, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 8 }}>Try Something New</div>
        {['piano', 'drums', 'guitar'].filter(t => t !== instrument).map(tool => (
          <ToolCard key={tool} tool={tool} onStart={startTimer} isActive={activeTool === tool} />
        ))}
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

function ToolCard({ tool, primary, onStart, isActive }: { tool: string; primary?: boolean; onStart: (t: string) => void; isActive: boolean }) {
  const colors: Record<string, string> = { piano: '#3b82f6', drums: '#EF4444', guitar: '#FFB800', voice: '#22C55E' }
  const color = colors[tool] ?? '#D4226A'
  return (
    <div style={{ padding: 16, borderRadius: 12, background: isActive ? `${color}10` : 'rgba(255,255,255,0.02)', border: `1px solid ${isActive ? `${color}30` : 'rgba(255,255,255,0.06)'}`, borderLeft: primary ? `3px solid ${color}` : undefined }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: primary ? 12 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Music size={16} style={{ color }} />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#E0E0F4' }}>{tool.charAt(0).toUpperCase() + tool.slice(1)}</span>
        </div>
        {!isActive && <button onClick={() => onStart(tool)} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: `${color}15`, color, border: `1px solid ${color}30`, cursor: 'pointer' }}>Practice</button>}
      </div>
      {primary && tool === 'piano' && <MiniPiano />}
      {primary && tool === 'drums' && <MiniDrums />}
      {primary && tool === 'guitar' && <MiniGuitar />}
    </div>
  )
}

function MiniPiano() {
  const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C2']
  return (
    <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
      {notes.map(n => (
        <button key={n} onClick={() => playSound(`/audio/piano/${n}.wav`)} style={{
          width: 40, height: 80, borderRadius: '0 0 6px 6px', background: 'linear-gradient(180deg, #fff 70%, #e0e0e0)',
          border: '1px solid #ccc', cursor: 'pointer', fontSize: 10, color: '#666', fontWeight: 600,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 6,
        }}>{n.replace('2', '')}</button>
      ))}
    </div>
  )
}

function MiniDrums() {
  const pads = [{ name: 'Kick', file: 'kick', c: '#EF4444' }, { name: 'Snare', file: 'snare', c: '#fb923c' }, { name: 'Hi-Hat', file: 'hihat', c: '#FFB800' }, { name: 'Crash', file: 'crash', c: '#22C55E' }]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      {pads.map(p => (
        <button key={p.name} onClick={() => playSound(`/audio/drums/${p.file}.wav`)} style={{
          padding: '16px 8px', borderRadius: 10, background: `${p.c}15`, border: `2px solid ${p.c}30`,
          color: p.c, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>{p.name}</button>
      ))}
    </div>
  )
}

function MiniGuitar() {
  const chords = ['C', 'G', 'Am', 'F', 'D', 'Em']
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
      {chords.map(ch => (
        <button key={ch} onClick={() => { const m: Record<string, string> = { C: 'E2', G: 'B3', Am: 'A2', F: 'E2', D: 'D3', Em: 'E4' }; playSound(`/audio/guitar/${m[ch] ?? 'E2'}/strum.wav`) }} style={{
          width: 52, height: 52, borderRadius: 10, background: 'rgba(255,184,0,0.08)',
          border: '2px solid rgba(255,184,0,0.2)', color: '#FFB800', fontSize: 16, fontWeight: 800,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{ch}</button>
      ))}
    </div>
  )
}
