import { useState, useEffect } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useCheckIn } from '../../hooks/useCheckIn'
import { useRooms } from '../../hooks/useRooms'
import { useChangeBlockType, useUnassignBlock, type GridBlock, type BlockType } from '../../hooks/useScheduleGrid'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '../shared/Toast'
import { Check, Phone, UserX, X, Bell, BellOff, RefreshCw } from 'lucide-react'

function formatTime(t: string) {
  const [h, m] = t.split(':')
  const hour = parseInt(h)
  const ampm = hour >= 12 ? 'pm' : 'am'
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour
  return `${display}:${m}${ampm}`
}

interface Props {
  block: GridBlock
  onClose: () => void
}

const TYPE_OPTIONS: { value: BlockType; label: string; color: string; tally: boolean }[] = [
  { value: 'student_session', label: 'Music Session', color: '#FACC15', tally: true },
  { value: 'first_day', label: 'First Day', color: '#0EA5E9', tally: true },
  { value: 'last_day', label: 'Last Day', color: '#DC2626', tally: true },
  { value: 'call_out', label: 'Call Out', color: '#EA580C', tally: true },
  { value: 'meet_greet', label: 'Meet & Greet', color: '#0D9488', tally: true },
  { value: 'sub', label: 'Sub', color: '#7C3AED', tally: true },
  { value: 'teacher_training', label: 'Training', color: '#4F46E5', tally: false },
]

export default function CheckInModal({ block, onClose }: Props) {
  const { user } = useAuthContext()
  const { canDo } = usePermissions()
  const canCheckIn = canDo('schedule.check_in')
  const qc = useQueryClient()
  const checkIn = useCheckIn()
  const changeBlockType = useChangeBlockType()
  const unassignBlock = useUnassignBlock()

  const [currentType, setCurrentType] = useState<BlockType>(block.block_type)
  const [showCancel, setShowCancel] = useState(false)
  const [cancelType, setCancelType] = useState<'call_out' | 'student_leaving' | 'our_end' | 'accidental' | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [sendNotification, setSendNotification] = useState(true)
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [showUndoCheckin, setShowUndoCheckin] = useState(false)
  const [undoReason, setUndoReason] = useState('')
  const [undoSubmitting, setUndoSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Substitute teacher change
  const [selectedSubTeacherId, setSelectedSubTeacherId] = useState<string>(block.teacher_id)
  const [subTeachers, setSubTeachers] = useState<{ id: string; name: string; score: number; tier: string }[]>([])
  const [subChanging, setSubChanging] = useState(false)

  // Load and score sub candidates when block is a sub
  useEffect(() => {
    if (!block.original_teacher_name) return
    ;(async () => {
      const dayOfWeek = new Date(block.block_date + 'T12:00:00').getDay()
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const dayName = dayNames[dayOfWeek]

      const [{ data: teachers }, { data: todayBlocks }, { data: avail }] = await Promise.all([
        supabase.from('teachers').select('id, first_name, last_name, instruments, is_active, profile:profiles!teachers_profile_id_fkey(first_name, last_name)').eq('is_active', true),
        supabase.from('schedule_blocks').select('teacher_id, location_id, student_id').eq('block_date', block.block_date).eq('status', 'booked'),
        supabase.from('teacher_availability').select('teacher_id, location_id').eq('day_of_week', dayName).eq('is_active', true),
      ])

      const hereToday = new Set((todayBlocks ?? []).filter(b => b.location_id === block.location_id).map(b => b.teacher_id))
      const elsewhereToday = new Set((todayBlocks ?? []).filter(b => b.location_id !== block.location_id).map(b => b.teacher_id))
      const availHere = new Set((avail ?? []).filter(a => a.location_id === block.location_id).map(a => a.teacher_id))

      const scored = (teachers ?? [])
        .filter(t => t.id !== block.original_teacher_id)
        .map((t: any) => {
          const name = `${t.first_name ?? t.profile?.first_name ?? ''} ${t.last_name ?? t.profile?.last_name ?? ''}`.trim()
          let score = 0
          if (block.instrument && t.instruments?.includes(block.instrument.toLowerCase())) score += 10
          if (hereToday.has(t.id)) score += 8
          if (availHere.has(t.id)) score += 5
          if (elsewhereToday.has(t.id)) score -= 10
          const tier = hereToday.has(t.id) ? 'Here Today' : availHere.has(t.id) ? 'Available' : 'Other'
          return { id: t.id, name, score, tier }
        })
        .sort((a, b) => b.score - a.score)

      setSubTeachers(scored)
    })()
  }, [block.original_teacher_name, block.block_date, block.location_id, block.instrument, block.original_teacher_id])

  const handleSubChange = async () => {
    if (selectedSubTeacherId === block.teacher_id) return
    setSubChanging(true)
    setError(null)
    try {
      // Remove new sub's open_time block at this time if it exists (avoid constraint violation)
      await supabase.from('schedule_blocks').delete()
        .eq('teacher_id', selectedSubTeacherId)
        .eq('block_date', block.block_date)
        .eq('start_time', block.start_time)
        .eq('status', 'available')

      await supabase.from('schedule_blocks').update({ teacher_id: selectedSubTeacherId }).eq('id', block.block_id)

      await supabase.from('activity_log').insert({
        tenant_id: block.tenant_id, entity_type: 'schedule_block', entity_id: block.block_id,
        action: 'sub_changed',
        description: `Sub changed: ${block.student_name} — ${block.teacher_name} → ${subTeachers.find(t => t.id === selectedSubTeacherId)?.name ?? 'Unknown'} @ ${formatTime(block.start_time)} on ${dateStr}`,
        performed_by: user?.id ?? null,
      }).then(() => {})

      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      toast('Substitute changed', 'success')
      onClose()
    } catch (err: any) { setError(err.message) }
    finally { setSubChanging(false) }
  }

  const currentOption = TYPE_OPTIONS.find(o => o.value === currentType)

  const dateStr = new Date(block.block_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  const handleCheckIn = async () => {
    if (!user) return
    setError(null)
    try {
      await checkIn.mutateAsync({ blockId: block.block_id, action: 'check_in', userId: user.id })
      onClose()
    } catch (err: any) { setError(err.message) }
  }

  const handleTypeChange = async (newType: BlockType) => {
    try {
      // For last_day and first_day, trigger special RPCs
      if (newType === 'last_day') {
        await changeBlockType.mutateAsync({ blockId: block.block_id, blockType: newType, runLastDayRevert: true })
      } else if (newType === 'first_day') {
        await changeBlockType.mutateAsync({ blockId: block.block_id, blockType: newType, runFirstDayLock: true })
      } else {
        await changeBlockType.mutateAsync({ blockId: block.block_id, blockType: newType })
      }
    } catch (err: any) {
      setError(err.message)
      setCurrentType(block.block_type)
    }
  }

  // Submit cancel with reason + activity log
  const handleCancelSubmit = async () => {
    if (!cancelType) return
    if (!cancelReason.trim()) { setError('Please enter a reason'); return }
    setCancelSubmitting(true)
    setError(null)

    const labels = { call_out: 'Call Out', student_leaving: 'Student Leaving', our_end: 'Studio Canceled', accidental: 'Accidental Booking' }
    const label = labels[cancelType]
    const logNote = `[${label}] ${cancelReason.trim()}`
    const now = new Date().toISOString()

    try {
      if (cancelType === 'call_out') {
        // Today only — change to call_out, future stays
        await supabase.from('schedule_blocks').update({ block_type: 'call_out', notes: logNote }).eq('id', block.block_id)
      } else if (cancelType === 'student_leaving') {
        // Mark as last day, revert all future recurring to open
        await supabase.from('schedule_blocks').update({ block_type: 'last_day', notes: logNote }).eq('id', block.block_id)
        if (block.is_recurring && block.student_id) {
          await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: null })
            .eq('teacher_id', block.teacher_id).eq('start_time', block.start_time).eq('student_id', block.student_id).gt('block_date', block.block_date)
        }
      } else {
        // our_end or accidental — revert to open
        await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: logNote }).eq('id', block.block_id)
        if (cancelType === 'our_end' && block.is_recurring && block.student_id) {
          await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: null })
            .eq('teacher_id', block.teacher_id).eq('start_time', block.start_time).eq('student_id', block.student_id).gt('block_date', block.block_date)
        }
      }

      // Log to activity_log
      await supabase.from('activity_log').insert({
        tenant_id: block.tenant_id,
        entity_type: 'schedule_block',
        entity_id: block.block_id,
        action: `cancel_${cancelType}`,
        description: `${label}: ${block.student_name} — ${block.teacher_name} @ ${formatTime(block.start_time)} on ${dateStr}. Reason: ${cancelReason.trim()}`,
        performed_by: user?.id ?? null,
      }).then(() => {}) // fire and forget if table doesn't exist yet

      qc.invalidateQueries({ queryKey: ['schedule-grid'] })
      onClose()
    } catch (err: any) { setError(err.message) }
    finally { setCancelSubmitting(false) }
  }

  // Cancel view — Step 1: pick type, Step 2: enter reason
  if (showCancel) {
    const cancelOptions = [
      { key: 'call_out' as const, label: 'Call Out — Today Only', desc: 'Student called in. Counts toward teacher tally. Future lessons stay.', color: '#F97316', bg: 'rgba(249,115,22,0.1)', border: 'rgba(249,115,22,0.2)' },
      { key: 'student_leaving' as const, label: 'Student Leaving — Cancel All Future', desc: 'Marks as Last Day. All future recurring lessons revert to open time.', color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.15)' },
      { key: 'our_end' as const, label: 'Cancel on Our End', desc: 'Studio-initiated. This and all future recurring revert to open time.', color: '#C0C0E0', bg: 'rgba(255,255,255,0.03)', border: 'rgba(255,255,255,0.08)' },
      { key: 'accidental' as const, label: 'Accidental Booking — Wrong Spot', desc: "Shouldn't have been booked here. Reverts this slot to open time. No reason needed.", color: '#A0A0C8', bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)' },
    ]

    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444' }}>Cancel Lesson</span>
            <div style={{ fontSize: 13, color: '#C0C0E0', marginTop: 6 }}>{block.student_name} — {formatTime(block.start_time)}, {dateStr}</div>
          </div>

          <div style={{ padding: '16px 20px' }}>
            {/* Step 1: Pick cancel type */}
            {!cancelType ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Why is this being canceled?</div>
                {cancelOptions.map((opt) => (
                  <button
                    key={opt.key}
                    onClick={async () => {
                      if (opt.key === 'accidental') {
                        // Accidental — no reason needed, just revert to open
                        setCancelSubmitting(true)
                        try {
                          await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: '[Accidental Booking]' }).eq('id', block.block_id)
                          await supabase.from('activity_log').insert({
                            tenant_id: block.tenant_id, entity_type: 'schedule_block', entity_id: block.block_id,
                            action: 'cancel_accidental',
                            description: `Accidental Booking: ${block.student_name} — ${block.teacher_name} @ ${formatTime(block.start_time)} on ${dateStr}`,
                            performed_by: user?.id ?? null,
                          }).then(() => {})
                          qc.invalidateQueries({ queryKey: ['schedule-grid'] })
                          onClose()
                        } catch (err: any) { setError(err.message) }
                        finally { setCancelSubmitting(false) }
                      } else {
                        setCancelType(opt.key)
                      }
                    }}
                    disabled={cancelSubmitting}
                    style={{ padding: '12px 14px', borderRadius: 10, background: opt.bg, border: `1px solid ${opt.border}`, cursor: 'pointer', textAlign: 'left', transition: 'transform 100ms ease' }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.01)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: opt.color }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 2 }}>{opt.desc}</div>
                  </button>
                ))}
                <button onClick={() => setShowCancel(false)} style={{ marginTop: 6, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Go Back</button>
              </div>
            ) : (
              /* Step 2: Enter reason */
              <div>
                <div style={{ padding: '10px 14px', borderRadius: 10, background: cancelOptions.find(o => o.key === cancelType)?.bg, border: `1px solid ${cancelOptions.find(o => o.key === cancelType)?.border}`, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: cancelOptions.find(o => o.key === cancelType)?.color }}>{cancelOptions.find(o => o.key === cancelType)?.label}</span>
                    <button onClick={() => setCancelType(null)} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>Change</button>
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>Reason — Required</label>
                  <textarea
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="Give a reason for this cancellation..."
                    autoFocus
                    rows={3}
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1px solid ${cancelReason.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.3)'}`, background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>

                {/* Notification toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, cursor: 'pointer' }}>
                  <input type="checkbox" checked={sendNotification} onChange={(e) => setSendNotification(e.target.checked)} style={{ accentColor: '#E8488A' }} />
                  <span style={{ fontSize: 12, color: '#A0A0C8', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {sendNotification ? <Bell size={13} /> : <BellOff size={13} />}
                    {sendNotification ? 'Send notification' : "Don't send notification"}
                  </span>
                </label>

                {error && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 12, color: '#EF4444', marginBottom: 10 }}>{error}</div>}

                <button
                  onClick={handleCancelSubmit}
                  disabled={!cancelReason.trim() || cancelSubmitting}
                  style={{ width: '100%', padding: '11px 16px', borderRadius: 10, background: cancelReason.trim() ? '#DC2626' : '#606088', border: 'none', cursor: cancelReason.trim() ? 'pointer' : 'not-allowed', color: '#fff', fontWeight: 700, fontSize: 13, opacity: cancelReason.trim() ? 1 : 0.5 }}
                >
                  {cancelSubmitting ? 'Processing...' : 'Confirm Cancellation'}
                </button>
                <button onClick={() => { setCancelType(null); setCancelReason('') }} style={{ width: '100%', marginTop: 6, padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Go Back</button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Main view
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Lesson Details</span>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Student info */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{block.student_name}</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 4 }}>
              {block.instrument} · {block.teacher_name} · {formatTime(block.start_time)} · {dateStr}
            </div>
            {block.original_teacher_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#22C55E', fontWeight: 700 }}>Sub</span>
                <span style={{ fontSize: 11, color: '#FF8C00', fontWeight: 600 }}>{block.original_teacher_name} called out</span>
              </div>
            )}
            {block.fifth_week && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,184,0,0.15)', color: '#FFB800', fontWeight: 700, display: 'inline-block', marginTop: 6 }}>5th Week</span>}
          </div>

          {/* Change Substitute Teacher */}
          {block.original_teacher_name && subTeachers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Substitute Teacher</div>
              <select
                value={selectedSubTeacherId}
                onChange={(e) => setSelectedSubTeacherId(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 10,
                  border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                  color: '#E0E0F4', fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              >
                {subTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.id === block.teacher_id ? ' (current)' : ` — ${t.tier} (${t.score})`}
                  </option>
                ))}
              </select>
              {selectedSubTeacherId !== block.teacher_id && (
                <button
                  onClick={handleSubChange}
                  disabled={subChanging}
                  style={{
                    width: '100%', marginTop: 8, padding: '9px 14px', borderRadius: 8,
                    background: subChanging ? '#606088' : '#22C55E', border: 'none',
                    color: '#fff', fontWeight: 700, fontSize: 12, cursor: subChanging ? 'default' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <RefreshCw size={12} /> {subChanging ? 'Changing...' : 'Change Substitute'}
                </button>
              )}
            </div>
          )}

          {/* Session Type — dropdown (first) */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Session Type</div>
            <select
              value={currentType}
              onChange={(e) => setCurrentType(e.target.value as BlockType)}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none' }}
            >
              {TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}{opt.tally ? '' : ' (no tally)'}</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>
              {currentOption?.tally ? 'Counts toward teacher session tally' : 'Does not count toward tally'}
            </div>
          </div>

          {/* Room selector */}
          <RoomSelector block={block} />

          {/* Check-in status (if already checked in) */}
          {!block.fifth_week && block.checked_in && (
            <div style={{ marginBottom: 16 }}>
              {block.checked_in ? (
                showUndoCheckin ? (
                  <div style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#EF4444', marginBottom: 8 }}>Undo Check-In & Remove Tally</div>
                    <label style={{ fontSize: 10, fontWeight: 700, color: '#EF4444', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Reason — Required</label>
                    <input
                      value={undoReason}
                      onChange={(e) => setUndoReason(e.target.value)}
                      placeholder="Why are you undoing this check-in?"
                      autoFocus
                      style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${undoReason.trim() ? 'rgba(255,255,255,0.1)' : 'rgba(239,68,68,0.3)'}`, background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 8 }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={async () => {
                          if (!undoReason.trim()) { setError('Please enter a reason'); return }
                          setUndoSubmitting(true)
                          try {
                            await supabase.from('schedule_blocks').update({ checked_in: false, teacher_tally: false }).eq('id', block.block_id)
                            await supabase.from('activity_log').insert({
                              tenant_id: block.tenant_id, entity_type: 'schedule_block', entity_id: block.block_id,
                              action: 'undo_checkin',
                              description: `Undo check-in: ${block.student_name} — ${block.teacher_name} @ ${formatTime(block.start_time)} on ${dateStr}. Reason: ${undoReason.trim()}`,
                              performed_by: user?.id ?? null,
                            }).then(() => {})
                            qc.invalidateQueries({ queryKey: ['schedule-grid'] })
                            onClose()
                          } catch (err: any) { setError(err.message) }
                          finally { setUndoSubmitting(false) }
                        }}
                        disabled={!undoReason.trim() || undoSubmitting}
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 8, background: undoReason.trim() ? '#DC0000' : '#606088', border: 'none', cursor: undoReason.trim() ? 'pointer' : 'not-allowed', color: '#fff', fontWeight: 700, fontSize: 12, opacity: undoReason.trim() ? 1 : 0.5 }}
                      >
                        {undoSubmitting ? 'Undoing...' : 'Confirm Undo'}
                      </button>
                      <button onClick={() => { setShowUndoCheckin(false); setUndoReason('') }} style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check size={16} style={{ color: '#22C55E' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#22C55E' }}>Checked In</span>
                    </div>
                    <button onClick={() => setShowUndoCheckin(true)} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>Undo</button>
                  </div>
                )
              ) : null}
            </div>
          )}

          {error && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 12, color: '#EF4444', marginBottom: 12 }}>{error}</div>}

          {/* Bottom actions — Update on top, spacer, then Check-in + Cancel on same line */}
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Update Appointment — primary action */}
            <button
              onClick={async () => {
                if (currentType !== block.block_type) {
                  await handleTypeChange(currentType)
                  await new Promise(r => setTimeout(r, 200))
                }
                onClose()
              }}
              disabled={changeBlockType.isPending}
              style={{ width: '100%', padding: '11px 16px', borderRadius: 10, background: '#FACC15', border: 'none', cursor: 'pointer', color: '#1A1A2E', fontWeight: 700, fontSize: 13, marginBottom: 12 }}
            >
              {changeBlockType.isPending ? 'Saving...' : 'Update Appointment'}
            </button>

            {/* Spacer line */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', marginBottom: 12 }} />

            {/* Check-in (75%) + Cancel (25%) on same line */}
            {!block.fifth_week && !block.checked_in && canCheckIn && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={handleCheckIn}
                  disabled={checkIn.isPending}
                  style={{ flex: 3, padding: '11px 16px', borderRadius: 10, background: '#22C55E', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff', fontWeight: 700, fontSize: 13 }}
                >
                  <Check size={16} /> {checkIn.isPending ? 'Checking in...' : 'Check In'}
                </button>
                <button
                  onClick={() => setShowCancel(true)}
                  style={{ flex: 1, padding: '11px 8px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', cursor: 'pointer', color: '#EF4444', fontWeight: 600, fontSize: 11, opacity: 0.7 }}
                >
                  Cancel
                </button>
              </div>
            )}
            {!block.fifth_week && !block.checked_in && !canCheckIn && (
              <button
                onClick={() => setShowCancel(true)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', cursor: 'pointer', color: '#EF4444', fontWeight: 600, fontSize: 12, opacity: 0.7 }}
              >
                Cancel Session
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function RoomSelector({ block }: { block: GridBlock }) {
  const { data: rooms } = useRooms(block.location_id)
  const qc = useQueryClient()
  const [currentRoom, setCurrentRoom] = useState(block.room_id ?? '')

  const activeRooms = (rooms ?? []).filter((r: any) => r.is_active && r.status === 'active')
  if (activeRooms.length === 0) return null

  const handleChange = async (roomId: string) => {
    const room = activeRooms.find((r: any) => r.id === roomId)
    // Conflict check
    if (roomId) {
      const { data: conflict } = await supabase
        .from('schedule_blocks')
        .select('id')
        .eq('block_date', block.block_date)
        .eq('start_time', block.start_time)
        .eq('room_id', roomId)
        .neq('id', block.block_id)
        .not('student_id', 'is', null)
        .limit(1)
      if (conflict && conflict.length > 0) {
        toast(`Room "${room?.name ?? ''}" is already booked at this time`, 'error')
        return
      }
    }
    await supabase.from('schedule_blocks').update({ room_id: roomId || null, room: room?.name ?? null }).eq('id', block.block_id)
    setCurrentRoom(roomId)
    qc.invalidateQueries({ queryKey: ['schedule-grid'] })
    toast(roomId ? `Moved to ${room?.name}` : 'Room removed', 'success')
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Room</div>
      <select value={currentRoom} onChange={(e) => handleChange(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 12, outline: 'none' }}>
        <option value="">No room</option>
        {activeRooms.map((r: any) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </div>
  )
}
