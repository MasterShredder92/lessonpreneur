import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

/* ── helpers ── */
function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour}:${m}${hour >= 12 ? 'pm' : 'am'}`
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/* ── types ── */
interface Props {
  date: string          // YYYY-MM-DD
  locationId: string
  teachers: { id: string; name: string }[]   // teachers on schedule today
  onClose: () => void
}

interface BookedBlock {
  block_id: string
  teacher_id: string
  student_id: string
  student_name: string
  instrument: string
  start_time: string
  end_time: string
}

interface SubCandidate {
  teacher_id: string
  teacher_name: string
  instruments: string[]
  score: number
  tier: 'already_here' | 'available_today' | 'day_off'
}

type Step = 1 | 2 | 3 | 4

/* ── component ── */
export default function TeacherCalloutWizard({ date, locationId, teachers, onClose }: Props) {
  const qc = useQueryClient()

  const [step, setStep] = useState<Step>(1)
  const [callingOutTeacherId, setCallingOutTeacherId] = useState('')
  const [callingOutTeacherName, setCallingOutTeacherName] = useState('')

  // Step 2
  const [bookedBlocks, setBookedBlocks] = useState<BookedBlock[]>([])
  const [coverageSelection, setCoverageSelection] = useState<Record<string, boolean>>({})
  const [loadingBlocks, setLoadingBlocks] = useState(false)

  // Step 3
  const [candidatesByBlock, setCandidatesByBlock] = useState<Record<string, SubCandidate[]>>({})
  const [assignedSubs, setAssignedSubs] = useState<Record<string, { teacher_id: string; teacher_name: string }>>({})
  const [loadingCandidates, setLoadingCandidates] = useState(false)

  // Step 4
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  /* ── Step 1 → 2: load booked blocks ── */
  const handlePickTeacher = async (teacherId: string) => {
    const teacher = teachers.find(t => t.id === teacherId)
    if (!teacher) return
    setCallingOutTeacherId(teacherId)
    setCallingOutTeacherName(teacher.name)
    setLoadingBlocks(true)

    const { data: blocks } = await supabase
      .from('schedule_blocks')
      .select('id, teacher_id, student_id, start_time, end_time')
      .eq('block_date', date)
      .eq('location_id', locationId)
      .eq('teacher_id', teacherId)
      .eq('status', 'booked')
      .order('start_time')

    if (!blocks || blocks.length === 0) {
      setBookedBlocks([])
      setLoadingBlocks(false)
      setStep(2)
      return
    }

    // Get student details
    const studentIds = [...new Set(blocks.map((b: any) => b.student_id).filter(Boolean))]
    const studentMap = new Map<string, { name: string; instrument: string }>()
    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument')
        .in('id', studentIds)
      students?.forEach((s: any) => {
        studentMap.set(s.id, { name: `${s.first_name} ${s.last_name}`, instrument: s.instrument ?? '' })
      })
    }

    const enriched: BookedBlock[] = blocks
      .filter((b: any) => b.student_id)
      .map((b: any) => {
        const student = studentMap.get(b.student_id)
        return {
          block_id: b.id,
          teacher_id: b.teacher_id,
          student_id: b.student_id,
          student_name: student?.name ?? 'Unknown',
          instrument: student?.instrument ?? '',
          start_time: b.start_time,
          end_time: b.end_time,
        }
      })

    setBookedBlocks(enriched)
    // Default all to "find coverage" (checked)
    const sel: Record<string, boolean> = {}
    enriched.forEach(b => { sel[b.block_id] = true })
    setCoverageSelection(sel)
    setLoadingBlocks(false)
    setStep(2)
  }

  /* ── Step 2 → 3: find coverage candidates ── */
  const handleFindCoverage = async () => {
    const blocksNeedingCoverage = bookedBlocks.filter(b => coverageSelection[b.block_id])
    if (blocksNeedingCoverage.length === 0) {
      // All are call-outs, skip to step 4
      setStep(4)
      return
    }

    setLoadingCandidates(true)

    // 1. All active teachers
    const { data: allTeachers } = await supabase
      .from('teachers')
      .select('id, first_name, last_name, instruments, ai_context, is_active')
      .eq('is_active', true)

    // 2. All blocks today across all locations
    const { data: todayBlocks } = await supabase
      .from('schedule_blocks')
      .select('teacher_id, location_id, start_time, end_time, status')
      .eq('block_date', date)

    // 3. Teacher availability for this day of week
    const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()]
    const { data: availability } = await supabase
      .from('teacher_availability')
      .select('*')
      .eq('day_of_week', dayName)
      .eq('is_active', true)

    // Build lookup: which teachers have blocks at this location today
    const teachersAtThisLoc = new Set<string>()
    const teachersAtOtherLoc = new Set<string>()
    todayBlocks?.forEach((b: any) => {
      if (b.location_id === locationId) teachersAtThisLoc.add(b.teacher_id)
      else teachersAtOtherLoc.add(b.teacher_id)
    })

    // Build availability lookup
    const availByTeacher = new Map<string, boolean>()
    availability?.forEach((a: any) => {
      if (a.location_id === locationId) availByTeacher.set(a.teacher_id, true)
    })

    // For each block needing coverage, score all teachers
    const candidatesMap: Record<string, SubCandidate[]> = {}

    for (const block of blocksNeedingCoverage) {
      const candidates: SubCandidate[] = []

      for (const teacher of (allTeachers ?? [])) {
        // Skip the calling-out teacher
        if (teacher.id === callingOutTeacherId) continue

        const name = `${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim() || 'Unknown'
        const instruments: string[] = Array.isArray(teacher.instruments)
          ? teacher.instruments
          : typeof teacher.instruments === 'string'
            ? (teacher.instruments as string).split(',').map((s: string) => s.trim()).filter(Boolean)
            : []

        let score = 0

        // +10 same instrument
        if (block.instrument && instruments.some(i => i.toLowerCase() === block.instrument.toLowerCase())) {
          score += 10
        }

        // +8 already at this location today
        if (teachersAtThisLoc.has(teacher.id)) {
          score += 8
        }

        // +5 has availability at this location on this day
        if (availByTeacher.has(teacher.id)) {
          score += 5
        }

        // +3 ai_context keyword match
        const aiCtx = teacher.ai_context as Record<string, any> | null
        if (aiCtx) {
          const keywords = JSON.stringify(aiCtx).toLowerCase()
          if (block.instrument && keywords.includes(block.instrument.toLowerCase())) {
            score += 3
          }
        }

        // -10 booked at a different location today
        if (teachersAtOtherLoc.has(teacher.id) && !teachersAtThisLoc.has(teacher.id)) {
          score -= 10
        }

        // Determine tier
        let tier: SubCandidate['tier'] = 'day_off'
        if (teachersAtThisLoc.has(teacher.id)) {
          tier = 'already_here'
        } else if (availByTeacher.has(teacher.id) && !teachersAtOtherLoc.has(teacher.id)) {
          tier = 'available_today'
        }

        if (score > -10) {
          candidates.push({ teacher_id: teacher.id, teacher_name: name, instruments, score, tier })
        }
      }

      // Sort by score descending
      candidates.sort((a, b) => b.score - a.score)
      candidatesMap[block.block_id] = candidates
    }

    setCandidatesByBlock(candidatesMap)
    setAssignedSubs({})
    setLoadingCandidates(false)
    setStep(3)
  }

  /* ── Step 3: assign sub to a block ── */
  const handleAssignSub = (blockId: string, teacherId: string, teacherName: string) => {
    setAssignedSubs(prev => ({ ...prev, [blockId]: { teacher_id: teacherId, teacher_name: teacherName } }))
  }

  const handleUnassignSub = (blockId: string) => {
    setAssignedSubs(prev => {
      const copy = { ...prev }
      delete copy[blockId]
      return copy
    })
  }

  /* ── Step 4: apply all changes ── */
  const callOutBlocks = bookedBlocks.filter(b => !coverageSelection[b.block_id])
  const coveredBlocks = bookedBlocks.filter(b => coverageSelection[b.block_id] && assignedSubs[b.block_id])
  const unassignedCoverageBlocks = bookedBlocks.filter(b => coverageSelection[b.block_id] && !assignedSubs[b.block_id])

  const handleApply = async () => {
    setApplying(true)
    try {
      // 1. Mark uncovered blocks as call_out
      const callOutIds = [...callOutBlocks.map(b => b.block_id), ...unassignedCoverageBlocks.map(b => b.block_id)]
      if (callOutIds.length > 0) {
        for (const id of callOutIds) {
          await supabase
            .from('schedule_blocks')
            .update({
              block_type: 'call_out',
              original_teacher_id: callingOutTeacherId,
              original_teacher_name: callingOutTeacherName,
            })
            .eq('id', id)
        }
      }

      // 2. Assign subs to covered blocks
      let subsMoved = 0
      const subErrors: string[] = []
      for (const block of coveredBlocks) {
        const sub = assignedSubs[block.block_id]
        if (!sub) continue
        try {
          // First: remove the sub teacher's open_time block at this time (if it exists)
          // This avoids the unique constraint on (teacher_id, block_date, start_time)
          await supabase
            .from('schedule_blocks')
            .delete()
            .eq('teacher_id', sub.teacher_id)
            .eq('block_date', date)
            .eq('start_time', block.start_time)
            .is('student_id', null)

          // Now update the original block to point to the sub teacher
          const { error: subErr } = await supabase
            .from('schedule_blocks')
            .update({
              teacher_id: sub.teacher_id,
              block_type: 'sub',
              original_teacher_id: callingOutTeacherId,
              original_teacher_name: callingOutTeacherName,
            })
            .eq('id', block.block_id)
          if (subErr) throw subErr
          subsMoved++
        } catch (err: any) {
          console.error('Sub assign error:', block.block_id, err.message)
          subErrors.push(`${block.student_name}: ${err.message}`)
        }
      }
      if (subErrors.length > 0) {
        alert(`Warning: ${subErrors.length} student(s) could not be moved:\n${subErrors.join('\n')}`)
      }

      // Force full cache invalidation
      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setApplied(true)
    } finally {
      setApplying(false)
    }
  }

  /* ── Derived counts for step 4 ── */
  const totalCallOuts = callOutBlocks.length + unassignedCoverageBlocks.length
  const totalCovered = coveredBlocks.length

  /* ── Step indicator colors ── */
  const STEP_LABELS = ['Pick Teacher', 'Select Students', 'Find Coverage', 'Confirm']

  /* ── tier config ── */
  const TIER_CONFIG = {
    already_here: { label: 'Already Here', color: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
    available_today: { label: 'Available Today', color: '#3B82F6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)' },
    day_off: { label: 'Day Off', color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)' },
  } as const

  /* ── render ── */
  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 540, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #1A1A2E 0%, #16162A 100%)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 16, boxShadow: '0 0 40px rgba(239,68,68,0.08), 0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#EF4444', letterSpacing: '-0.01em' }}>Teacher Call Out</h2>
            <span style={{ fontSize: 11, color: '#8080A8' }}>{new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 0, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          {STEP_LABELS.map((label, i) => {
            const stepNum = (i + 1) as Step
            const isActive = step === stepNum
            const isComplete = step > stepNum
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700,
                  background: isActive ? '#EF4444' : isComplete ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.06)',
                  color: isActive ? '#fff' : isComplete ? '#22C55E' : '#606088',
                  border: isActive ? 'none' : isComplete ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.08)',
                }}>
                  {isComplete ? '✓' : stepNum}
                </div>
                <span style={{ fontSize: 9, color: isActive ? '#E0E0F4' : '#606088', fontWeight: isActive ? 600 : 400 }}>{label}</span>
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {/* ── STEP 1: Pick Teacher ── */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#A0A0C8', margin: '0 0 8px' }}>Which teacher is calling out?</p>
              {teachers.length === 0 ? (
                <p style={{ fontSize: 12, color: '#8080A8' }}>No teachers scheduled today.</p>
              ) : (
                teachers.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handlePickTeacher(t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
                      color: '#E0E0F4', fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
                  >
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#EF4444' }}>
                      {t.name.charAt(0)}
                    </div>
                    {t.name}
                  </button>
                ))
              )}
            </div>
          )}

          {/* ── STEP 2: Select students to cover ── */}
          {step === 2 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: '#A0A0C8', margin: '0 0 4px' }}>
                <strong style={{ color: '#EF4444' }}>{callingOutTeacherName}</strong> has {bookedBlocks.length} booked lesson{bookedBlocks.length !== 1 ? 's' : ''} today.
              </p>
              <p style={{ fontSize: 11, color: '#8080A8', margin: '0 0 8px' }}>Check blocks that need a substitute. Unchecked blocks will be marked as call-outs.</p>

              {loadingBlocks ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#8080A8' }}>Loading blocks...</div>
              ) : bookedBlocks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: '#8080A8' }}>No booked lessons found for this teacher today.</div>
              ) : (
                bookedBlocks.map(block => (
                  <label
                    key={block.block_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                      background: coverageSelection[block.block_id] ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.04)',
                      border: `1px solid ${coverageSelection[block.block_id] ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                      borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={coverageSelection[block.block_id] ?? false}
                      onChange={e => setCoverageSelection(prev => ({ ...prev, [block.block_id]: e.target.checked }))}
                      style={{ accentColor: '#22C55E', width: 16, height: 16 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4' }}>{block.student_name}</div>
                      <div style={{ fontSize: 10, color: '#A0A0C8', display: 'flex', gap: 8 }}>
                        <span>{formatTime(block.start_time)} - {formatTime(block.end_time)}</span>
                        <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(255,184,0,0.1)', color: '#FFB800', fontSize: 9, fontWeight: 600 }}>
                          {block.instrument ? block.instrument.charAt(0).toUpperCase() + block.instrument.slice(1) : 'N/A'}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: 9, color: coverageSelection[block.block_id] ? '#22C55E' : '#EF4444', fontWeight: 600 }}>
                      {coverageSelection[block.block_id] ? 'Find Sub' : 'Call Out'}
                    </span>
                  </label>
                ))
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={() => setStep(1)} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: 12, cursor: 'pointer' }}>Back</button>
                <button
                  onClick={handleFindCoverage}
                  disabled={loadingCandidates}
                  style={{ padding: '8px 20px', borderRadius: 8, background: '#EF4444', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: loadingCandidates ? 0.6 : 1 }}
                >
                  {loadingCandidates ? 'Finding...' : Object.values(coverageSelection).some(v => v) ? 'Find Coverage →' : 'Mark All as Call Out →'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Ranked sub list per block ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {bookedBlocks.filter(b => coverageSelection[b.block_id]).map(block => {
                const candidates = candidatesByBlock[block.block_id] ?? []
                const assigned = assignedSubs[block.block_id]

                // Group by tier
                const tiers: Record<string, SubCandidate[]> = { already_here: [], available_today: [], day_off: [] }
                candidates.forEach(c => tiers[c.tier].push(c))

                return (
                  <div key={block.block_id} style={{
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12,
                    overflow: 'hidden',
                  }}>
                    {/* Block header */}
                    <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#E0E0F4' }}>{block.student_name}</span>
                        <span style={{ fontSize: 10, color: '#A0A0C8', marginLeft: 8 }}>{formatTime(block.start_time)} · {block.instrument ? block.instrument.charAt(0).toUpperCase() + block.instrument.slice(1) : ''}</span>
                      </div>
                      {assigned && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>→ {assigned.teacher_name}</span>
                          <button
                            onClick={() => handleUnassignSub(block.block_id)}
                            style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', padding: '0 4px' }}
                          >✕</button>
                        </div>
                      )}
                    </div>

                    {/* Candidate tiers */}
                    {!assigned && (
                      <div style={{ padding: '8px 14px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {(['already_here', 'available_today', 'day_off'] as const).map(tierKey => {
                          const tierCandidates = tiers[tierKey]
                          if (tierCandidates.length === 0) return null
                          const cfg = TIER_CONFIG[tierKey]
                          return (
                            <div key={tierKey}>
                              <div style={{ fontSize: 9, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                                {cfg.label}
                              </div>
                              {tierCandidates.map(c => (
                                <div
                                  key={c.teacher_id}
                                  style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '6px 10px', marginBottom: 3, borderRadius: 8,
                                    background: cfg.bg, border: `1px solid ${cfg.border}`,
                                    cursor: 'pointer', transition: 'all 0.15s',
                                  }}
                                  onClick={() => handleAssignSub(block.block_id, c.teacher_id, c.teacher_name)}
                                  onMouseEnter={e => { e.currentTarget.style.background = `${cfg.color}22` }}
                                  onMouseLeave={e => { e.currentTarget.style.background = cfg.bg }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4' }}>{c.teacher_name}</span>
                                    <div style={{ display: 'flex', gap: 3 }}>
                                      {c.instruments.slice(0, 3).map(inst => (
                                        <span key={inst} style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,184,0,0.1)', color: '#FFB800', fontWeight: 600 }}>
                                          {inst}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                  <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                    background: c.score >= 15 ? 'rgba(34,197,94,0.15)' : c.score >= 8 ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                                    color: c.score >= 15 ? '#22C55E' : c.score >= 8 ? '#3B82F6' : '#A0A0C8',
                                  }}>
                                    {c.score}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )
                        })}
                        {candidates.length === 0 && (
                          <div style={{ padding: 8, fontSize: 11, color: '#8080A8', textAlign: 'center' }}>No substitute teachers available</div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                <button onClick={() => setStep(2)} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: 12, cursor: 'pointer' }}>Back</button>
                <button
                  onClick={() => setStep(4)}
                  style={{ padding: '8px 20px', borderRadius: 8, background: '#EF4444', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                >
                  Review & Apply →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 4: Confirm & Apply ── */}
          {step === 4 && !applied && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <p style={{ fontSize: 13, color: '#E0E0F4', margin: '0 0 4px', fontWeight: 600 }}>
                  Summary for {callingOutTeacherName}
                </p>
                <p style={{ fontSize: 11, color: '#8080A8', margin: 0 }}>
                  {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 4 }}>
                <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 10, background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#A855F7' }}>{totalCovered}</div>
                  <div style={{ fontSize: 9, color: '#A0A0C8', fontWeight: 600 }}>Covered</div>
                </div>
                <div style={{ textAlign: 'center', padding: '10px 18px', borderRadius: 10, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)' }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#F97316' }}>{totalCallOuts}</div>
                  <div style={{ fontSize: 9, color: '#A0A0C8', fontWeight: 600 }}>Call Out</div>
                </div>
              </div>

              {/* Detail list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {coveredBlocks.map(b => {
                  const sub = assignedSubs[b.block_id]
                  return (
                    <div key={b.block_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#E0E0F4' }}>{b.student_name}</span>
                        <span style={{ fontSize: 9, color: '#A0A0C8', marginLeft: 6 }}>{formatTime(b.start_time)}</span>
                      </div>
                      <span style={{ fontSize: 10, color: '#A855F7', fontWeight: 600 }}>→ {sub?.teacher_name}</span>
                    </div>
                  )
                })}
                {[...callOutBlocks, ...unassignedCoverageBlocks].map(b => (
                  <div key={b.block_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.12)' }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#E0E0F4' }}>{b.student_name}</span>
                      <span style={{ fontSize: 9, color: '#A0A0C8', marginLeft: 6 }}>{formatTime(b.start_time)}</span>
                    </div>
                    <span style={{ fontSize: 10, color: '#F97316', fontWeight: 600 }}>Call Out</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={() => { step === 4 && Object.values(coverageSelection).some(v => v) ? setStep(3) : setStep(2) }} style={{ padding: '8px 16px', borderRadius: 8, background: 'none', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: 12, cursor: 'pointer' }}>Back</button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  style={{ padding: '8px 24px', borderRadius: 8, background: applying ? '#606088' : '#EF4444', border: 'none', color: '#fff', fontSize: 12, fontWeight: 700, cursor: applying ? 'default' : 'pointer' }}
                >
                  {applying ? 'Applying...' : 'Apply Changes'}
                </button>
              </div>
            </div>
          )}

          {/* ── Applied success ── */}
          {step === 4 && applied && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>&#10003;</div>
              <h3 style={{ margin: '0 0 6px', fontSize: 15, color: '#22C55E', fontWeight: 700 }}>Changes Applied</h3>
              <p style={{ fontSize: 12, color: '#A0A0C8', margin: '0 0 16px' }}>
                {totalCovered} block{totalCovered !== 1 ? 's' : ''} assigned to subs, {totalCallOuts} marked as call out{totalCallOuts !== 1 ? 's' : ''}.
              </p>
              <button
                onClick={onClose}
                style={{ padding: '8px 24px', borderRadius: 8, background: '#22C55E', border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
