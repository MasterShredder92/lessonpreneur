import { useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Home, Calendar, CreditCard, Trophy, FolderOpen, Lock, Music, Upload, Sparkles, ChevronDown, ChevronUp, MapPin, Clock } from 'lucide-react'
import MusicLoader from '../../components/shared/MusicLoader'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'
import {
  usePortalFamily,
  usePortalSchedule,
  usePortalNotes,
  usePortalMilestones,
  usePortalReports,
  usePortalSessionCount,
  usePortalFiles,
} from '../../hooks/useParentPortal'

type Tab = 'home' | 'schedule' | 'bills' | 'progress' | 'files'

const TABS: { id: Tab; icon: typeof Home; label: string }[] = [
  { id: 'home', icon: Home, label: 'Home' },
  { id: 'schedule', icon: Calendar, label: 'Schedule' },
  { id: 'bills', icon: CreditCard, label: 'Bills' },
  { id: 'progress', icon: Trophy, label: 'Progress' },
  { id: 'files', icon: FolderOpen, label: 'Files' },
]

const MOOD_EMOJI: Record<string, string> = {
  great: '\u{1F604}',
  good: '\u{1F642}',
  okay: '\u{1F610}',
  struggling: '\u{1F61F}',
}

// ── Helpers ──

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m} ${ampm}`
}

function monthsEnrolled(createdAt: string): number {
  const start = new Date(createdAt)
  const now = new Date()
  return Math.max(1, Math.floor((now.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)))
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMonthYear(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function studentGreeting(names: string[]): string {
  if (names.length === 0) return 'Welcome'
  if (names.length === 1) return `Here's how ${names[0]} is doing`
  if (names.length === 2) return `Here's how ${names[0]} and ${names[1]} are doing`
  const last = names[names.length - 1]
  const rest = names.slice(0, -1).join(', ')
  return `Here's how ${rest}, and ${last} are doing`
}

// ── Shared styles ──

const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 16,
  padding: 16,
  marginBottom: 12,
}

const primaryText: React.CSSProperties = { color: '#E0E0F4', margin: 0 }
const secondaryText: React.CSSProperties = { color: '#A0A0C8', margin: 0, fontSize: 13 }
const mutedText: React.CSSProperties = { color: '#606088', margin: 0, fontSize: 12 }
const goldText: React.CSSProperties = { color: '#FFB800', margin: 0 }
const pinkText: React.CSSProperties = { color: '#D4226A', margin: 0 }

// ── Component ──

export default function FamilyPortal() {
  const { familyId } = useParams<{ familyId: string }>()
  const [activeTab, setActiveTab] = useState<Tab>('home')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [expandedBilling, setExpandedBilling] = useState(false)
  const [showAskStar, setShowAskStar] = useState(false)

  // ── Data hooks ──
  const { data: familyData, isLoading: familyLoading } = usePortalFamily(familyId)
  const family = familyData?.family
  const students = familyData?.students ?? []
  const studentIds = useMemo(() => students.map((s: any) => s.id), [students])

  const { data: schedule } = usePortalSchedule(studentIds)
  const { data: sessionCounts } = usePortalSessionCount(studentIds)

  // Progress tab: selected student
  const progressStudentId = selectedStudentId ?? students[0]?.id
  const { data: notes } = usePortalNotes(activeTab === 'progress' ? progressStudentId : undefined)
  const { data: milestones } = usePortalMilestones(activeTab === 'progress' ? progressStudentId : undefined)
  const { data: reports } = usePortalReports(activeTab === 'progress' ? progressStudentId : undefined)

  // Files tab
  const { data: files } = usePortalFiles(activeTab === 'files' ? studentIds : [])

  // ── Loading state ──
  if (familyLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#020209' }}>
        <MusicLoader size={32} />
      </div>
    )
  }

  if (!family) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#020209', color: '#A0A0C8', fontFamily: 'Plus Jakarta Sans, sans-serif', padding: 24, textAlign: 'center' }}>
        <div>
          <Music size={48} style={{ color: '#606088', marginBottom: 16 }} />
          <p style={{ fontSize: 18, color: '#E0E0F4', marginBottom: 8 }}>Family not found</p>
          <p style={{ fontSize: 14, color: '#A0A0C8' }}>This link may be expired or invalid. Contact your music school for help.</p>
        </div>
      </div>
    )
  }

  // ── Next lesson per student (for home tab) ──
  const nextLessonMap = new Map<string, any>()
  if (schedule) {
    for (const b of schedule) {
      if (!nextLessonMap.has(b.student_id)) {
        nextLessonMap.set(b.student_id, b)
      }
    }
  }

  // ── Latest note per student (for home tab) ──
  // We'll fetch notes lazily on progress tab, so for home we just show schedule info
  // Actually let's get a quick recent note inline for home cards
  // We'll rely on the schedule data for next lesson

  const totalSessionsThisMonth = studentIds.reduce((sum: number, id: string) => sum + (sessionCounts?.get(id) ?? 0), 0)
  const familyMonthlyRate = students.reduce((sum: number, s: any) => sum + (s.rate_per_session ?? 0) * (s.blocks_per_week ?? 1) * 4, 0)
  const memberSince = family.created_at ? formatMonthYear(family.created_at) : 'N/A'

  // ── Render ──
  return (
    <div style={{ minHeight: '100vh', background: '#020209', fontFamily: "'Plus Jakarta Sans', sans-serif", color: '#E0E0F4' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 16px', paddingBottom: 'calc(76px + env(safe-area-inset-bottom))' }}>
        {activeTab === 'home' && <HomeTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
        {activeTab === 'bills' && <BillsTab />}
        {activeTab === 'progress' && <ProgressTab />}
        {activeTab === 'files' && <FilesTab />}
      </div>

      {/* ── Bottom Tab Bar ── */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 60,
        background: 'rgba(2,2,9,0.95)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '0.5px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom)',
        zIndex: 100,
      }}>
        {TABS.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                background: 'none',
                border: 'none',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                padding: '8px 12px',
                cursor: 'pointer',
                transition: 'color 0.2s',
                color: isActive ? '#FFB800' : '#606088',
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.2 : 1.5} />
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, letterSpacing: 0.3 }}>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Ask Star modal */}
      {showAskStar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }} onClick={() => setShowAskStar(false)}>
          <div style={{ ...card, maxWidth: 340, textAlign: 'center', padding: 32 }} onClick={e => e.stopPropagation()}>
            <Sparkles size={40} style={{ color: '#FFB800', marginBottom: 12 }} />
            <p style={{ ...primaryText, fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Ask Star</p>
            <p style={{ ...secondaryText, marginBottom: 20 }}>AI-powered progress insights are coming soon. You'll be able to ask questions about your child's musical journey.</p>
            <button onClick={() => setShowAskStar(false)} style={{ background: '#FFB800', color: '#020209', border: 'none', borderRadius: 10, padding: '10px 28px', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ══════════════════════════════════════
  // TAB 1: HOME
  // ══════════════════════════════════════
  function HomeTab() {
    const studentNames = students.map((s: any) => s.first_name)
    return (
      <>
        {/* Greeting */}
        <div style={{ paddingTop: 24, paddingBottom: 8 }}>
          <p style={{ ...goldText, fontSize: 22, fontWeight: 800, lineHeight: 1.3, marginBottom: 4 }}>
            {studentGreeting(studentNames)}
          </p>
          <p style={{ ...secondaryText, fontSize: 14 }}>{family!.name} family</p>
        </div>

        {/* Student Cards */}
        {students.map((s: any) => {
          const nextLesson = nextLessonMap.get(s.id)
          const sessionsThisMonth = sessionCounts?.get(s.id) ?? 0
          const months = monthsEnrolled(s.created_at)
          const emoji = s.instrument ? getInstrumentEmoji(s.instrument) : '\u{1F3B5}'

          return (
            <div key={s.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 28 }}>{emoji}</span>
                <div>
                  <p style={{ ...primaryText, fontSize: 16, fontWeight: 700 }}>{s.first_name} {s.last_name}</p>
                  <p style={{ ...secondaryText, fontSize: 12 }}>
                    {s.instrument ?? 'Music'}{s.teacherName ? ` with ${s.teacherName}` : ''}{s.locationName ? ` \u00B7 ${s.locationName}` : ''}
                  </p>
                </div>
              </div>

              {/* Next lesson */}
              {nextLesson ? (
                <div style={{ background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.12)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                  <p style={{ ...mutedText, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Next Lesson</p>
                  <p style={{ ...primaryText, fontSize: 14, fontWeight: 600 }}>
                    {formatDate(nextLesson.block_date)}
                  </p>
                  <p style={{ ...secondaryText, fontSize: 12 }}>
                    {formatTime(nextLesson.start_time)}{nextLesson.locationName ? ` \u00B7 ${nextLesson.locationName}` : ''}
                  </p>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 10, padding: '10px 12px', marginBottom: 10 }}>
                  <p style={{ ...mutedText, fontSize: 13 }}>No upcoming lessons scheduled</p>
                </div>
              )}

              {/* Quick stats row */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ ...goldText, fontSize: 20, fontWeight: 800 }}>{sessionsThisMonth}</p>
                  <p style={{ ...mutedText }}>lessons this month</p>
                </div>
                <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                  <p style={{ ...primaryText, fontSize: 20, fontWeight: 800 }}>{months}</p>
                  <p style={{ ...mutedText }}>{months === 1 ? 'month enrolled' : 'months enrolled'}</p>
                </div>
              </div>
            </div>
          )
        })}

        {/* Family quick stats */}
        <div style={{ ...card, display: 'flex', justifyContent: 'space-around', textAlign: 'center', marginTop: 8 }}>
          <div>
            <p style={{ ...goldText, fontSize: 22, fontWeight: 800 }}>{totalSessionsThisMonth}</p>
            <p style={{ ...mutedText }}>total lessons</p>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div>
            <p style={{ ...primaryText, fontSize: 22, fontWeight: 800 }}>${familyMonthlyRate}</p>
            <p style={{ ...mutedText }}>monthly</p>
          </div>
          <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
          <div>
            <p style={{ ...secondaryText, fontSize: 13, fontWeight: 600 }}>{memberSince}</p>
            <p style={{ ...mutedText }}>member since</p>
          </div>
        </div>
      </>
    )
  }

  // ══════════════════════════════════════
  // TAB 2: SCHEDULE
  // ══════════════════════════════════════
  function ScheduleTab() {
    const grouped = useMemo(() => {
      const groups = new Map<string, any[]>()
      for (const b of (schedule ?? [])) {
        const arr = groups.get(b.block_date) ?? []
        arr.push(b)
        groups.set(b.block_date, arr)
      }
      return groups
    }, [schedule])

    return (
      <>
        <div style={{ paddingTop: 24, paddingBottom: 12 }}>
          <p style={{ ...primaryText, fontSize: 20, fontWeight: 800 }}>Upcoming Lessons</p>
          <p style={{ ...secondaryText, fontSize: 13 }}>Next 2 weeks</p>
        </div>

        {grouped.size === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 32 }}>
            <Calendar size={36} style={{ color: '#606088', marginBottom: 12 }} />
            <p style={{ ...primaryText, fontSize: 15, fontWeight: 600, marginBottom: 6 }}>No upcoming lessons scheduled</p>
            <p style={{ ...secondaryText, fontSize: 13 }}>Contact us to get started!</p>
          </div>
        ) : (
          Array.from(grouped.entries()).map(([date, lessons]) => (
            <div key={date} style={{ marginBottom: 16 }}>
              <p style={{ ...goldText, fontSize: 13, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                {formatDate(date)}
              </p>
              {lessons.map((lesson: any) => (
                <div key={lesson.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(255,184,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
                    {lesson.studentInstrument ? getInstrumentEmoji(lesson.studentInstrument) : '\u{1F3B5}'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ ...primaryText, fontSize: 14, fontWeight: 700 }}>
                      {students.length > 1 && lesson.studentName ? `${lesson.studentName} \u2014 ` : ''}{lesson.studentInstrument ?? 'Lesson'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                      <span style={{ ...secondaryText, fontSize: 12, display: 'flex', alignItems: 'center', gap: 3 }}>
                        <Clock size={11} /> {formatTime(lesson.start_time)} - {formatTime(lesson.end_time)}
                      </span>
                      {lesson.teacherName && (
                        <span style={{ ...mutedText, fontSize: 12 }}>\u00B7 {lesson.teacherName}</span>
                      )}
                      {lesson.locationName && (
                        <span style={{ ...mutedText, fontSize: 12, display: 'flex', alignItems: 'center', gap: 2 }}>
                          <MapPin size={10} /> {lesson.locationName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </>
    )
  }

  // ══════════════════════════════════════
  // TAB 3: BILLS
  // ══════════════════════════════════════
  function BillsTab() {
    const isCurrent = family!.billing_status === 'current' || !family!.billing_status
    return (
      <>
        <div style={{ paddingTop: 24, paddingBottom: 12 }}>
          <p style={{ ...primaryText, fontSize: 20, fontWeight: 800 }}>Billing</p>
        </div>

        {/* Monthly total */}
        <div style={{ ...card, textAlign: 'center', padding: 24 }}>
          <p style={{ ...mutedText, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Monthly Total</p>
          <p style={{ ...goldText, fontSize: 40, fontWeight: 900, marginBottom: 8 }}>${familyMonthlyRate}</p>
          <span style={{
            display: 'inline-block',
            padding: '4px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 700,
            background: isCurrent ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: isCurrent ? '#22c55e' : '#ef4444',
            border: `1px solid ${isCurrent ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
          }}>
            {isCurrent ? 'Current' : 'Overdue'}
          </span>
        </div>

        {/* Card on file */}
        <div style={card}>
          <p style={{ ...mutedText, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Payment Method</p>
          {family!.card_last_four ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CreditCard size={20} style={{ color: '#A0A0C8' }} />
              <p style={{ ...primaryText, fontSize: 14 }}>
                {family!.card_brand ?? 'Card'} ending in {family!.card_last_four}
              </p>
            </div>
          ) : (
            <p style={{ ...secondaryText, fontSize: 13 }}>No card on file</p>
          )}
        </div>

        {/* Per-student breakdown */}
        <div style={card}>
          <button
            onClick={() => setExpandedBilling(!expandedBilling)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 0, color: '#E0E0F4' }}
          >
            <p style={{ ...primaryText, fontSize: 14, fontWeight: 700 }}>Student Breakdown</p>
            {expandedBilling ? <ChevronUp size={18} style={{ color: '#A0A0C8' }} /> : <ChevronDown size={18} style={{ color: '#A0A0C8' }} />}
          </button>
          {expandedBilling && (
            <div style={{ marginTop: 12 }}>
              {students.map((s: any) => {
                const weekly = s.blocks_per_week ?? 1
                const rate = s.rate_per_session ?? 0
                const monthly = rate * weekly * 4
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div>
                      <p style={{ ...primaryText, fontSize: 13, fontWeight: 600 }}>{s.first_name} \u2014 {s.instrument ?? 'Music'}</p>
                      <p style={{ ...mutedText, fontSize: 11 }}>${rate}/lesson \u00D7 {weekly}/wk \u00D7 4 wks</p>
                    </div>
                    <p style={{ ...primaryText, fontSize: 14, fontWeight: 700 }}>${monthly}</p>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Balance */}
        {family!.balance !== null && family!.balance !== undefined && family!.balance !== 0 && (
          <div style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ ...primaryText, fontSize: 14, fontWeight: 600 }}>Account Balance</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: family!.balance > 0 ? '#22c55e' : '#ef4444', margin: 0 }}>
                {family!.balance > 0 ? '+' : ''}${Math.abs(family!.balance).toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {/* Invoice history placeholder */}
        <div style={{ ...card, textAlign: 'center', padding: 24 }}>
          <Lock size={24} style={{ color: '#606088', marginBottom: 8 }} />
          <p style={{ ...secondaryText, fontSize: 13 }}>Invoice history coming soon</p>
        </div>
      </>
    )
  }

  // ══════════════════════════════════════
  // TAB 4: PROGRESS
  // ══════════════════════════════════════
  function ProgressTab() {
    const selectedStudent = students.find((s: any) => s.id === progressStudentId) ?? students[0]

    return (
      <>
        <div style={{ paddingTop: 24, paddingBottom: 8 }}>
          <p style={{ ...primaryText, fontSize: 20, fontWeight: 800 }}>Progress</p>
        </div>

        {/* Student picker pills */}
        {students.length > 1 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto', paddingBottom: 4 }}>
            {students.map((s: any) => {
              const isActive = s.id === progressStudentId
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedStudentId(s.id)}
                  style={{
                    background: isActive ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? 'rgba(255,184,0,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 20,
                    padding: '6px 16px',
                    color: isActive ? '#FFB800' : '#A0A0C8',
                    fontSize: 13,
                    fontWeight: isActive ? 700 : 500,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    fontFamily: 'inherit',
                  }}
                >
                  {s.first_name}
                </button>
              )
            })}
          </div>
        )}

        {/* Session notes timeline */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ ...secondaryText, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Lesson Notes</p>
          {!notes || notes.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', padding: 24 }}>
              <Music size={28} style={{ color: '#606088', marginBottom: 8 }} />
              <p style={{ ...primaryText, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No lesson notes yet</p>
              <p style={{ ...secondaryText, fontSize: 13 }}>
                Check back after {selectedStudent?.first_name ?? 'your child'}'s next lesson. Their teacher will share updates here.
              </p>
            </div>
          ) : (
            notes.map((note: any) => (
              <div key={note.id} style={{ ...card, position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <p style={{ ...primaryText, fontSize: 13, fontWeight: 700 }}>{formatShortDate(note.note_date)}</p>
                    <p style={{ ...mutedText, fontSize: 11 }}>with {note.teacherName}</p>
                  </div>
                  {note.mood && (
                    <span style={{ fontSize: 20 }}>{MOOD_EMOJI[note.mood] ?? ''}</span>
                  )}
                </div>
                <p style={{ ...secondaryText, fontSize: 13, lineHeight: 1.5 }}>
                  {note.ai_enhanced_note ?? note.raw_note ?? 'No details'}
                </p>
                {note.topics_covered && Array.isArray(note.topics_covered) && note.topics_covered.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {note.topics_covered.map((topic: string, i: number) => (
                      <span key={i} style={{
                        background: 'rgba(212,34,106,0.1)',
                        border: '1px solid rgba(212,34,106,0.15)',
                        borderRadius: 12,
                        padding: '3px 10px',
                        fontSize: 11,
                        color: '#D4226A',
                        fontWeight: 600,
                      }}>
                        {topic}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Milestones */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ ...secondaryText, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Milestones</p>
          {!milestones || milestones.length === 0 ? (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <Trophy size={20} style={{ color: '#FFB800' }} />
                <p style={{ ...primaryText, fontSize: 14, fontWeight: 600 }}>Working toward first milestone</p>
              </div>
              <div style={{ background: 'rgba(255,184,0,0.08)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  borderRadius: 6,
                  background: 'linear-gradient(90deg, #FFB800, #FF5500)',
                  width: `${Math.min(100, (sessionCounts?.get(progressStudentId ?? '') ?? 0) * 10)}%`,
                  transition: 'width 0.6s ease',
                }} />
              </div>
              <p style={{ ...mutedText, marginTop: 6 }}>
                {sessionCounts?.get(progressStudentId ?? '') ?? 0} lessons completed
              </p>
            </div>
          ) : (
            milestones.map((m: any) => (
              <div key={m.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,184,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trophy size={18} style={{ color: '#FFB800' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ ...primaryText, fontSize: 13, fontWeight: 700 }}>{m.milestone_label}</p>
                  <p style={{ ...mutedText, fontSize: 11 }}>
                    {m.achieved_at ? formatShortDate(m.achieved_at) : ''}{m.milestone_value ? ` \u00B7 ${m.milestone_value}` : ''}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Ask Star button */}
        <button
          onClick={() => setShowAskStar(true)}
          style={{
            width: '100%',
            background: 'linear-gradient(135deg, rgba(255,184,0,0.1), rgba(255,85,0,0.1))',
            border: '1px solid rgba(255,184,0,0.2)',
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            marginBottom: 20,
            color: '#FFB800',
            fontFamily: 'inherit',
          }}
        >
          <Sparkles size={18} />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Ask Star about progress</span>
          <span style={{ fontSize: 10, color: '#A0A0C8', marginLeft: 4 }}>Coming Soon</span>
        </button>

        {/* Progress reports */}
        {reports && reports.length > 0 && (
          <div>
            <p style={{ ...secondaryText, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Progress Reports</p>
            {reports.map((r: any) => (
              <div key={r.id} style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ ...primaryText, fontSize: 14, fontWeight: 700 }}>{r.report_type === 'monthly' ? 'Monthly' : 'Quarterly'} Report</p>
                  <p style={{ ...mutedText, fontSize: 11 }}>
                    {formatShortDate(r.period_start)} - {formatShortDate(r.period_end)}
                  </p>
                </div>
                {r.attendance_rate !== null && (
                  <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
                    <div>
                      <p style={{ ...goldText, fontSize: 18, fontWeight: 800 }}>{Math.round(r.attendance_rate * 100)}%</p>
                      <p style={{ ...mutedText }}>attendance</p>
                    </div>
                    <div>
                      <p style={{ ...primaryText, fontSize: 18, fontWeight: 800 }}>{r.sessions_attended}/{r.sessions_scheduled}</p>
                      <p style={{ ...mutedText }}>lessons</p>
                    </div>
                  </div>
                )}
                {r.ai_summary && <p style={{ ...secondaryText, fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}>{r.ai_summary}</p>}
                {r.ai_highlights && Array.isArray(r.ai_highlights) && r.ai_highlights.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {r.ai_highlights.map((h: string, i: number) => (
                      <p key={i} style={{ ...secondaryText, fontSize: 12, marginBottom: 3 }}>\u2022 {h}</p>
                    ))}
                  </div>
                )}
                {r.ai_encouragement && (
                  <p style={{ ...goldText, fontSize: 13, fontStyle: 'italic', marginTop: 8 }}>"{r.ai_encouragement}"</p>
                )}
              </div>
            ))}
          </div>
        )}
      </>
    )
  }

  // ══════════════════════════════════════
  // TAB 5: FILES
  // ══════════════════════════════════════
  function FilesTab() {
    return (
      <>
        <div style={{ paddingTop: 24, paddingBottom: 12 }}>
          <p style={{ ...primaryText, fontSize: 20, fontWeight: 800 }}>Files</p>
        </div>

        {/* From your teacher */}
        <p style={{ ...secondaryText, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>From Your Teacher</p>
        {!files || files.length === 0 ? (
          <div style={{ ...card, textAlign: 'center', padding: 24 }}>
            <FolderOpen size={28} style={{ color: '#606088', marginBottom: 8 }} />
            <p style={{ ...primaryText, fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No files yet</p>
            <p style={{ ...secondaryText, fontSize: 13 }}>Your teacher may share resources here after lessons.</p>
          </div>
        ) : (
          files.map((f: any) => (
            <div key={f.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(212,34,106,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <FolderOpen size={18} style={{ color: '#D4226A' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ ...primaryText, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.file_name}</p>
                <p style={{ ...mutedText, fontSize: 11 }}>{formatShortDate(f.created_at)}</p>
              </div>
            </div>
          ))
        )}

        {/* Your uploads (placeholder) */}
        <p style={{ ...secondaryText, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 24 }}>Your Uploads</p>
        <div style={{
          ...card,
          textAlign: 'center',
          padding: 32,
          border: '2px dashed rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.01)',
        }}>
          <Upload size={28} style={{ color: '#606088', marginBottom: 8 }} />
          <p style={{ ...secondaryText, fontSize: 13, marginBottom: 4 }}>Upload files for your teacher</p>
          <p style={{ ...mutedText, fontSize: 12 }}>Coming soon</p>
        </div>
      </>
    )
  }
}
