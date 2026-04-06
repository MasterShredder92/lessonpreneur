import { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { getInstrumentEmoji } from '../../utils/instrumentEmoji'

/* ── helpers ── */
function fmt(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  return `${hour > 12 ? hour - 12 : hour}:${m}${hour >= 12 ? 'pm' : 'am'}`
}

/** Shift a HH:MM:SS time string by ±minutes */
function shiftTime(t: string, minutes: number): string {
  const [h, m] = t.split(':').map(Number)
  const total = h * 60 + m + minutes
  const hh = String(Math.floor(total / 60)).padStart(2, '0')
  const mm = String(total % 60).padStart(2, '0')
  return `${hh}:${mm}:00`
}

/** Minutes between two HH:MM:SS times */
function diffMinutes(a: string, b: string): number {
  const [ah, am] = a.split(':').map(Number)
  const [bh, bm] = b.split(':').map(Number)
  return (bh * 60 + bm) - (ah * 60 + am)
}

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/* ── types ── */
interface Props {
  date: string
  locationId: string
  teachers: { id: string; name: string }[]
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
  family_id: string | null
}

interface SubCandidate {
  teacher_id: string
  teacher_name: string
  instruments: string[]
  score: number
  tier: 'already_here' | 'available_today' | 'day_off'
  conflict_at_time: boolean           // has a booked block at the same time
  open_at_time: boolean               // has an available slot at the same time
}

interface AltSlot {
  label: string           // e.g. "30 min earlier" / "30 min later"
  start_time: string
  end_time: string
  available: boolean      // sub has an open/available slot here
}

interface Assignment {
  teacher_id: string
  teacher_name: string
  start_time: string      // may differ from original if alt slot chosen
  end_time: string
  is_alt_time: boolean
  alt_label?: string
}

/** Sibling warning for a specific student */
interface SiblingWarning {
  student_name: string
  sibling_name: string
  gap_minutes: number
  message: string
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
  const [altSlotsByBlock, setAltSlotsByBlock] = useState<Record<string, Record<string, AltSlot[]>>>({}) // blockId → teacherId → AltSlot[]
  const [assignments, setAssignments] = useState<Record<string, Assignment>>({})
  const [siblingWarnings, setSiblingWarnings] = useState<SiblingWarning[]>([])
  const [loadingCandidates, setLoadingCandidates] = useState(false)
  // All booked blocks at this location today (for conflict detection)
  const [allBlocksToday, setAllBlocksToday] = useState<{ teacher_id: string; start_time: string; end_time: string; status: string; student_id: string | null; block_type: string }[]>([])

  // Step 4
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  /* ── Step 1 → 2: load booked blocks with family data ── */
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

    // Get student details INCLUDING family_id
    const studentIds = [...new Set(blocks.map((b: any) => b.student_id).filter(Boolean))]
    const studentMap = new Map<string, { name: string; instrument: string; family_id: string | null }>()
    if (studentIds.length > 0) {
      const { data: students } = await supabase
        .from('students')
        .select('id, first_name, last_name, instrument, family_id')
        .in('id', studentIds)
      students?.forEach((s: any) => {
        studentMap.set(s.id, {
          name: `${s.first_name} ${s.last_name}`,
          instrument: s.instrument ?? '',
          family_id: s.family_id ?? null,
        })
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
          family_id: student?.family_id ?? null,
        }
      })

    setBookedBlocks(enriched)
    const sel: Record<string, boolean> = {}
    enriched.forEach(b => { sel[b.block_id] = true })
    setCoverageSelection(sel)
    setLoadingBlocks(false)
    setStep(2)
  }

  /* ── Step 2 → 3: find coverage with conflict detection + alt slots ── */
  const handleFindCoverage = async () => {
    const blocksNeedingCoverage = bookedBlocks.filter(b => coverageSelection[b.block_id])
    if (blocksNeedingCoverage.length === 0) {
      setStep(4)
      return
    }

    setLoadingCandidates(true)

    // 1. All active teachers
    const { data: allTeachers } = await supabase
      .from('teachers')
      .select('id, first_name, last_name, instruments, ai_context, is_active')
      .eq('is_active', true)

    // 2. ALL blocks today at this location (for conflict + alt-slot detection)
    const { data: todayBlocksRaw } = await supabase
      .from('schedule_blocks')
      .select('teacher_id, location_id, start_time, end_time, status, student_id, block_type')
      .eq('block_date', date)

    const todayBlocks = todayBlocksRaw ?? []
    setAllBlocksToday(todayBlocks as any)

    // 3. Teacher availability
    const dayName = DAY_NAMES[new Date(date + 'T00:00:00').getDay()]
    const { data: availability } = await supabase
      .from('teacher_availability')
      .select('*')
      .eq('day_of_week', dayName)
      .eq('is_active', true)

    // 4. Sibling data — find all siblings of students being moved
    const familyIds = [...new Set(blocksNeedingCoverage.map(b => b.family_id).filter(Boolean))] as string[]
    const siblingMap = new Map<string, { student_id: string; student_name: string; start_time: string; family_id: string }[]>()

    if (familyIds.length > 0) {
      // Get all students in these families
      const { data: familyStudents } = await supabase
        .from('students')
        .select('id, first_name, last_name, family_id')
        .in('family_id', familyIds)
        .eq('status', 'active')

      // Get today's blocks for those students (at this location)
      const familyStudentIds = familyStudents?.map((s: any) => s.id) ?? []
      if (familyStudentIds.length > 0) {
        const { data: siblingBlocks } = await supabase
          .from('schedule_blocks')
          .select('student_id, start_time')
          .eq('block_date', date)
          .eq('location_id', locationId)
          .eq('status', 'booked')
          .in('student_id', familyStudentIds)

        // Build sibling lookup: family_id → [{ student, time }]
        for (const s of (familyStudents ?? [])) {
          const fid = (s as any).family_id
          if (!siblingMap.has(fid)) siblingMap.set(fid, [])
          const blocks = (siblingBlocks ?? []).filter((b: any) => b.student_id === s.id)
          for (const b of blocks) {
            siblingMap.get(fid)!.push({
              student_id: s.id,
              student_name: `${(s as any).first_name} ${(s as any).last_name}`,
              start_time: (b as any).start_time,
              family_id: fid,
            })
          }
        }
      }
    }

    // Build lookups
    const teachersAtThisLoc = new Set<string>()
    const teachersAtOtherLoc = new Set<string>()
    todayBlocks.forEach((b: any) => {
      if (b.location_id === locationId) teachersAtThisLoc.add(b.teacher_id)
      else teachersAtOtherLoc.add(b.teacher_id)
    })

    const availByTeacher = new Map<string, boolean>()
    availability?.forEach((a: any) => {
      if (a.location_id === locationId) availByTeacher.set(a.teacher_id, true)
    })

    // Build sub's booked-times lookup: teacherId → Set of start_times that are booked
    const subBookedTimes = new Map<string, Set<string>>()
    const subAvailableTimes = new Map<string, Set<string>>()
    todayBlocks.forEach((b: any) => {
      if (b.location_id !== locationId) return
      if (b.status === 'booked' || (b.student_id && b.block_type !== 'open_time')) {
        if (!subBookedTimes.has(b.teacher_id)) subBookedTimes.set(b.teacher_id, new Set())
        subBookedTimes.get(b.teacher_id)!.add(b.start_time)
      } else if (b.status === 'available' && !b.student_id) {
        if (!subAvailableTimes.has(b.teacher_id)) subAvailableTimes.set(b.teacher_id, new Set())
        subAvailableTimes.get(b.teacher_id)!.add(b.start_time)
      }
    })

    // Score & rank candidates per block
    const candidatesMap: Record<string, SubCandidate[]> = {}
    const altSlotsMap: Record<string, Record<string, AltSlot[]>> = {}

    for (const block of blocksNeedingCoverage) {
      const candidates: SubCandidate[] = []
      const blockAlts: Record<string, AltSlot[]> = {}

      for (const teacher of (allTeachers ?? [])) {
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
        if (teachersAtThisLoc.has(teacher.id)) score += 8

        // +5 has availability
        if (availByTeacher.has(teacher.id)) score += 5

        // +3 ai_context match
        const aiCtx = teacher.ai_context as Record<string, any> | null
        if (aiCtx && block.instrument) {
          const keywords = JSON.stringify(aiCtx).toLowerCase()
          if (keywords.includes(block.instrument.toLowerCase())) score += 3
        }

        // -10 booked at a different location
        if (teachersAtOtherLoc.has(teacher.id) && !teachersAtThisLoc.has(teacher.id)) score -= 10

        // Conflict detection: does this sub have a booked slot at the exact same time?
        const booked = subBookedTimes.get(teacher.id)
        const available = subAvailableTimes.get(teacher.id)
        const conflict_at_time = !!booked?.has(block.start_time)
        const open_at_time = !!available?.has(block.start_time)

        // Tier
        let tier: SubCandidate['tier'] = 'day_off'
        if (teachersAtThisLoc.has(teacher.id)) tier = 'already_here'
        else if (availByTeacher.has(teacher.id) && !teachersAtOtherLoc.has(teacher.id)) tier = 'available_today'

        if (score > -10) {
          candidates.push({ teacher_id: teacher.id, teacher_name: name, instruments, score, tier, conflict_at_time, open_at_time })
        }

        // If conflict, compute alt slots (30 min before and after)
        if (conflict_at_time && score > -10) {
          const before = shiftTime(block.start_time, -30)
          const after = shiftTime(block.start_time, 30)
          const beforeEnd = shiftTime(before, 30)
          const afterEnd = shiftTime(after, 30)

          const alts: AltSlot[] = [
            {
              label: '30 min earlier',
              start_time: before,
              end_time: beforeEnd,
              available: !booked?.has(before) && (!!available?.has(before) || !booked?.has(before)),
            },
            {
              label: '30 min later',
              start_time: after,
              end_time: afterEnd,
              available: !booked?.has(after) && (!!available?.has(after) || !booked?.has(after)),
            },
          ]
          blockAlts[teacher.id] = alts
        }
      }

      candidates.sort((a, b) => {
        // Non-conflicting first, then by score
        if (a.conflict_at_time !== b.conflict_at_time) return a.conflict_at_time ? 1 : -1
        return b.score - a.score
      })

      candidatesMap[block.block_id] = candidates
      altSlotsMap[block.block_id] = blockAlts
    }

    setCandidatesByBlock(candidatesMap)
    setAltSlotsByBlock(altSlotsMap)
    setAssignments({})
    setSiblingWarnings([])
    setLoadingCandidates(false)
    setStep(3)
  }

  /* ── Step 3: assign sub (direct or alt time) ── */
  const handleAssign = (blockId: string, teacherId: string, teacherName: string, altSlot?: AltSlot) => {
    const block = bookedBlocks.find(b => b.block_id === blockId)
    if (!block) return

    const newAssignment: Assignment = altSlot
      ? { teacher_id: teacherId, teacher_name: teacherName, start_time: altSlot.start_time, end_time: altSlot.end_time, is_alt_time: true, alt_label: altSlot.label }
      : { teacher_id: teacherId, teacher_name: teacherName, start_time: block.start_time, end_time: block.end_time, is_alt_time: false }

    setAssignments(prev => ({ ...prev, [blockId]: newAssignment }))

    // Recompute sibling warnings with this new assignment
    recomputeSiblingWarnings({ ...assignments, [blockId]: newAssignment })
  }

  const handleUnassign = (blockId: string) => {
    setAssignments(prev => {
      const copy = { ...prev }
      delete copy[blockId]
      recomputeSiblingWarnings(copy)
      return copy
    })
  }

  /** Check if any assigned (or alt-time) students create sibling gap warnings */
  const recomputeSiblingWarnings = (currentAssignments: Record<string, Assignment>) => {
    const warnings: SiblingWarning[] = []

    for (const block of bookedBlocks) {
      if (!block.family_id || !coverageSelection[block.block_id]) continue
      const assignment = currentAssignments[block.block_id]
      if (!assignment) continue

      // Get sibling blocks from the sibling map data
      // We need to check: will this student's new time create a >30min gap from siblings?
      const effectiveTime = assignment.start_time

      // Find all siblings at this location today (from bookedBlocks or unaffected blocks)
      const siblingBlocks = bookedBlocks.filter(
        b => b.family_id === block.family_id && b.student_id !== block.student_id
      )

      for (const sibling of siblingBlocks) {
        // If the sibling is also being moved, use their assigned time
        const siblingAssignment = currentAssignments[sibling.block_id]
        const siblingTime = siblingAssignment ? siblingAssignment.start_time : sibling.start_time

        const gap = Math.abs(diffMinutes(effectiveTime, siblingTime))

        if (gap > 30) {
          warnings.push({
            student_name: block.student_name,
            sibling_name: sibling.student_name,
            gap_minutes: gap,
            message: `${block.student_name} and ${sibling.student_name} are siblings — moving creates a ${gap}-min gap between their lessons`,
          })
        }
      }
    }

    // Deduplicate (A↔B only once)
    const seen = new Set<string>()
    const unique = warnings.filter(w => {
      const key = [w.student_name, w.sibling_name].sort().join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    setSiblingWarnings(unique)
  }

  /* ── Step 4: apply ── */
  const callOutBlocks = bookedBlocks.filter(b => !coverageSelection[b.block_id])
  const coveredBlocks = bookedBlocks.filter(b => coverageSelection[b.block_id] && assignments[b.block_id])
  const unassignedCoverageBlocks = bookedBlocks.filter(b => coverageSelection[b.block_id] && !assignments[b.block_id])
  const totalCallOuts = callOutBlocks.length + unassignedCoverageBlocks.length
  const totalCovered = coveredBlocks.length

  const handleApply = async () => {
    setApplying(true)
    try {
      // 1. Mark uncovered blocks as call_out
      const callOutIds = [...callOutBlocks.map(b => b.block_id), ...unassignedCoverageBlocks.map(b => b.block_id)]
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

      // 2. Assign subs
      const subErrors: string[] = []
      for (const block of coveredBlocks) {
        const assignment = assignments[block.block_id]
        if (!assignment) continue

        try {
          if (assignment.is_alt_time) {
            // Alt-time flow: we need to find/create a block at the alt time for the sub,
            // then move the student there, and mark the original block as call_out

            // First: remove any open_time block the sub has at the alt time
            await supabase
              .from('schedule_blocks')
              .delete()
              .eq('teacher_id', assignment.teacher_id)
              .eq('block_date', date)
              .eq('start_time', assignment.start_time)
              .is('student_id', null)

            // Create a new block at the alt time for the sub with this student
            const { error: insertErr } = await supabase
              .from('schedule_blocks')
              .insert({
                tenant_id: (await supabase.from('schedule_blocks').select('tenant_id').eq('id', block.block_id).single()).data?.tenant_id,
                location_id: locationId,
                teacher_id: assignment.teacher_id,
                student_id: block.student_id,
                block_date: date,
                start_time: assignment.start_time,
                end_time: assignment.end_time,
                status: 'booked',
                block_type: 'sub',
                original_teacher_id: callingOutTeacherId,
                original_teacher_name: callingOutTeacherName,
                is_recurring: false,
              })
            if (insertErr) throw insertErr

            // Mark the original block as call_out (time slot freed)
            await supabase
              .from('schedule_blocks')
              .update({
                block_type: 'call_out',
                original_teacher_id: callingOutTeacherId,
                original_teacher_name: callingOutTeacherName,
              })
              .eq('id', block.block_id)
          } else {
            // Same-time flow (original logic)
            // Remove sub's open_time at this time
            await supabase
              .from('schedule_blocks')
              .delete()
              .eq('teacher_id', assignment.teacher_id)
              .eq('block_date', date)
              .eq('start_time', block.start_time)
              .is('student_id', null)

            // Transfer student to sub
            const { error: subErr } = await supabase
              .from('schedule_blocks')
              .update({
                teacher_id: assignment.teacher_id,
                block_type: 'sub',
                original_teacher_id: callingOutTeacherId,
                original_teacher_name: callingOutTeacherName,
              })
              .eq('id', block.block_id)
            if (subErr) throw subErr
          }
        } catch (err: any) {
          console.error('Sub assign error:', block.block_id, err.message)
          subErrors.push(`${block.student_name}: ${err.message}`)
        }
      }

      if (subErrors.length > 0) {
        alert(`Warning: ${subErrors.length} student(s) could not be moved:\n${subErrors.join('\n')}`)
      }

      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      qc.invalidateQueries({ queryKey: ['student-blocks'] })
      qc.invalidateQueries({ queryKey: ['dashboard'] })
      setApplied(true)
    } finally {
      setApplying(false)
    }
  }

  /* ── UI config ── */
  const STEP_LABELS = ['Pick Teacher', 'Select Students', 'Find Coverage', 'Confirm']
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
          width: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column',
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>&#10005;</button>
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
                  {isComplete ? '\u2713' : stepNum}
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
              ) : teachers.map(t => (
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
              ))}
            </div>
          )}

          {/* ── STEP 2: Select students ── */}
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
              ) : bookedBlocks.map(block => {
                // Show sibling badge if this student has a sibling also in the list
                const hasSibling = block.family_id && bookedBlocks.some(b => b.family_id === block.family_id && b.student_id !== block.student_id)
                return (
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
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#E0E0F4', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {block.student_name}
                        {hasSibling && (
                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(59,130,246,0.15)', color: '#3B82F6', fontWeight: 700 }}>
                            SIBLING
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 10, color: '#A0A0C8', display: 'flex', gap: 8 }}>
                        <span>{fmt(block.start_time)} - {fmt(block.end_time)}</span>
                        <span style={{ padding: '1px 6px', borderRadius: 4, background: 'rgba(255,184,0,0.1)', color: '#FFB800', fontSize: 9, fontWeight: 600 }}>
                          {block.instrument ? getInstrumentEmoji(block.instrument) : '\uD83C\uDFB5'}
                        </span>
                      </div>
                    </div>
                    <span style={{ fontSize: 9, color: coverageSelection[block.block_id] ? '#22C55E' : '#EF4444', fontWeight: 600 }}>
                      {coverageSelection[block.block_id] ? 'Find Sub' : 'Call Out'}
                    </span>
                  </label>
                )
              })}

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={() => setStep(1)} style={btnGhost}>Back</button>
                <button
                  onClick={handleFindCoverage}
                  disabled={loadingCandidates}
                  style={{ ...btnPrimary, opacity: loadingCandidates ? 0.6 : 1 }}
                >
                  {loadingCandidates ? 'Finding...' : Object.values(coverageSelection).some(v => v) ? 'Find Coverage \u2192' : 'Mark All as Call Out \u2192'}
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Ranked subs with conflict detection + alt time offers ── */}
          {step === 3 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Sibling warnings */}
              {siblingWarnings.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 14px', borderRadius: 10, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#3B82F6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sibling Warnings</div>
                  {siblingWarnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 11, color: '#93C5FD', lineHeight: 1.4 }}>
                      {w.message}
                    </div>
                  ))}
                </div>
              )}

              {bookedBlocks.filter(b => coverageSelection[b.block_id]).map(block => {
                const candidates = candidatesByBlock[block.block_id] ?? []
                const assigned = assignments[block.block_id]
                const blockAlts = altSlotsByBlock[block.block_id] ?? {}

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
                        <span style={{ fontSize: 10, color: '#A0A0C8', marginLeft: 8 }}>{fmt(block.start_time)} &middot; {block.instrument ? getInstrumentEmoji(block.instrument) : '\uD83C\uDFB5'}</span>
                      </div>
                      {assigned && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontSize: 10, color: '#22C55E', fontWeight: 600 }}>&rarr; {assigned.teacher_name}</span>
                            {assigned.is_alt_time && (
                              <div style={{ fontSize: 9, color: '#F59E0B', fontWeight: 600 }}>
                                {fmt(assigned.start_time)} ({assigned.alt_label})
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => handleUnassign(block.block_id)}
                            style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', padding: '0 4px' }}
                          >&#10005;</button>
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
                              {tierCandidates.map(c => {
                                const alts = blockAlts[c.teacher_id] ?? []
                                const availableAlts = alts.filter(a => a.available)

                                return (
                                  <div key={c.teacher_id} style={{ marginBottom: 4 }}>
                                    {/* Main row */}
                                    <div
                                      style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '6px 10px', borderRadius: 8,
                                        background: c.conflict_at_time ? 'rgba(249,115,22,0.06)' : cfg.bg,
                                        border: `1px solid ${c.conflict_at_time ? 'rgba(249,115,22,0.2)' : cfg.border}`,
                                        cursor: c.conflict_at_time ? 'default' : 'pointer',
                                        transition: 'all 0.15s',
                                        opacity: c.conflict_at_time ? 0.85 : 1,
                                      }}
                                      onClick={!c.conflict_at_time ? () => handleAssign(block.block_id, c.teacher_id, c.teacher_name) : undefined}
                                      onMouseEnter={!c.conflict_at_time ? e => { e.currentTarget.style.background = `${cfg.color}22` } : undefined}
                                      onMouseLeave={!c.conflict_at_time ? e => { e.currentTarget.style.background = cfg.bg } : undefined}
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
                                        {c.conflict_at_time && (
                                          <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(249,115,22,0.15)', color: '#F97316', fontWeight: 700 }}>
                                            CONFLICT
                                          </span>
                                        )}
                                      </div>
                                      <span style={{
                                        fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                                        background: c.score >= 15 ? 'rgba(34,197,94,0.15)' : c.score >= 8 ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.06)',
                                        color: c.score >= 15 ? '#22C55E' : c.score >= 8 ? '#3B82F6' : '#A0A0C8',
                                      }}>
                                        {c.score}
                                      </span>
                                    </div>

                                    {/* Alt time offers (only shown when there's a conflict) */}
                                    {c.conflict_at_time && availableAlts.length > 0 && (
                                      <div style={{ marginTop: 4, marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                        <div style={{ fontSize: 9, color: '#F59E0B', fontWeight: 600, marginBottom: 2 }}>
                                          Student already booked at {fmt(block.start_time)} &mdash; available nearby:
                                        </div>
                                        {availableAlts.map(alt => (
                                          <button
                                            key={alt.start_time}
                                            onClick={() => handleAssign(block.block_id, c.teacher_id, c.teacher_name, alt)}
                                            style={{
                                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                              padding: '5px 10px', borderRadius: 6,
                                              background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)',
                                              color: '#F59E0B', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                              transition: 'all 0.15s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.12)' }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(245,158,11,0.06)' }}
                                          >
                                            <span>{fmt(alt.start_time)} - {fmt(alt.end_time)}</span>
                                            <span style={{ fontSize: 10, color: '#A0A0C8' }}>{alt.label}</span>
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {c.conflict_at_time && availableAlts.length === 0 && (
                                      <div style={{ marginTop: 3, marginLeft: 16, fontSize: 9, color: '#8080A8', fontStyle: 'italic' }}>
                                        No nearby time slots available for this sub
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
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
                <button onClick={() => setStep(2)} style={btnGhost}>Back</button>
                <button
                  onClick={() => setStep(4)}
                  style={btnPrimary}
                >
                  Review & Apply &rarr;
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

              {/* Sibling warnings in summary */}
              {siblingWarnings.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#3B82F6', marginBottom: 4, textTransform: 'uppercase' }}>Sibling Notes</div>
                  {siblingWarnings.map((w, i) => (
                    <div key={i} style={{ fontSize: 10, color: '#93C5FD', lineHeight: 1.4 }}>{w.message}</div>
                  ))}
                </div>
              )}

              {/* Detail list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {coveredBlocks.map(b => {
                  const a = assignments[b.block_id]
                  return (
                    <div key={b.block_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#E0E0F4' }}>{b.student_name}</span>
                        <span style={{ fontSize: 9, color: '#A0A0C8', marginLeft: 6 }}>{fmt(b.start_time)}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 10, color: '#A855F7', fontWeight: 600 }}>&rarr; {a?.teacher_name}</span>
                        {a?.is_alt_time && (
                          <div style={{ fontSize: 9, color: '#F59E0B' }}>at {fmt(a.start_time)} ({a.alt_label})</div>
                        )}
                      </div>
                    </div>
                  )
                })}
                {[...callOutBlocks, ...unassignedCoverageBlocks].map(b => (
                  <div key={b.block_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.12)' }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#E0E0F4' }}>{b.student_name}</span>
                      <span style={{ fontSize: 9, color: '#A0A0C8', marginLeft: 6 }}>{fmt(b.start_time)}</span>
                    </div>
                    <span style={{ fontSize: 10, color: '#F97316', fontWeight: 600 }}>Call Out</span>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                <button onClick={() => { Object.values(coverageSelection).some(v => v) ? setStep(3) : setStep(2) }} style={btnGhost}>Back</button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  style={{ ...btnPrimary, background: applying ? '#606088' : '#EF4444', cursor: applying ? 'default' : 'pointer' }}
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
              <button onClick={onClose} style={{ ...btnPrimary, background: '#22C55E' }}>
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

/* ── shared button styles ── */
const btnGhost: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, background: 'none',
  border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8',
  fontSize: 12, cursor: 'pointer',
}

const btnPrimary: React.CSSProperties = {
  padding: '8px 20px', borderRadius: 8, background: '#EF4444',
  border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
}
