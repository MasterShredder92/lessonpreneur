import { useState, useEffect, useMemo } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useCheckIn } from '../../hooks/useCheckIn'
import { useRooms } from '../../hooks/useRooms'
import { useChangeBlockType, useUnassignBlock, type GridBlock, type BlockType } from '../../hooks/useScheduleGrid'
import { supabase } from '../../lib/supabase'
import { sendAppointmentNotification } from '../../lib/appointmentNotifications'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from '../shared/Toast'
import { Check, Phone, UserX, X, Bell, BellOff, RefreshCw, ExternalLink, Video } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

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

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

// Shared responsive styles for modal shell
const MOBILE_BP = 600
function useIsMobile() {
  const [m, setM] = useState(window.innerWidth < MOBILE_BP)
  useEffect(() => {
    const h = () => setM(window.innerWidth < MOBILE_BP)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

export default function CheckInModal({ block, onClose }: Props) {
  const { user } = useAuthContext()
  const { canDo } = usePermissions()
  const canCheckIn = canDo('schedule.check_in')
  const qc = useQueryClient()
  const checkIn = useCheckIn()
  const changeBlockType = useChangeBlockType()
  const unassignBlock = useUnassignBlock()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [familyId, setFamilyId] = useState<string | null>(null)

  // Fetch student's family_id for quick nav
  useEffect(() => {
    if (!block.student_id) return
    let cancelled = false
    supabase.from('students').select('family_id').eq('id', block.student_id).single()
      .then(({ data }) => { if (!cancelled && data?.family_id) setFamilyId(data.family_id) })
    return () => { cancelled = true }
  }, [block.student_id])

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
  const [unlocking, setUnlocking] = useState(false)

  // Substitute teacher change
  const [selectedSubTeacherId, setSelectedSubTeacherId] = useState<string>(block.teacher_id)
  const [subTeachers, setSubTeachers] = useState<{ id: string; name: string; score: number; tier: string }[]>([])
  const [subChanging, setSubChanging] = useState(false)

  // Virtual session conversion
  const [showVirtualConfirm, setShowVirtualConfirm] = useState(false)
  const [virtualConverting, setVirtualConverting] = useState(false)

  // Load and score sub candidates when block is a sub
  useEffect(() => {
    if (!block.original_teacher_name) return
    let cancelled = false
    ;(async () => {
      const dayOfWeek = new Date(block.block_date + 'T12:00:00').getDay()
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      const dayName = dayNames[dayOfWeek]

      const [{ data: teachers }, { data: todayBlocks }, { data: avail }] = await Promise.all([
        supabase.from('teachers').select('id, first_name, last_name, instruments, is_active, profile:profiles!teachers_profile_id_fkey(first_name, last_name)').eq('is_active', true),
        supabase.from('schedule_blocks').select('teacher_id, location_id, student_id').eq('block_date', block.block_date).eq('status', 'booked'),
        supabase.from('teacher_availability').select('teacher_id, location_id').eq('day_of_week', dayName).eq('is_active', true),
      ])

      if (cancelled) return

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
    return () => { cancelled = true }
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

      const { error: subErr } = await supabase.from('schedule_blocks').update({ teacher_id: selectedSubTeacherId }).eq('id', block.block_id)
      if (subErr) throw new Error(subErr.message)

      await supabase.from('activity_log').insert({
        tenant_id: block.tenant_id, entity_type: 'schedule_block', entity_id: block.block_id,
        action: 'sub_changed',
        description: `Sub changed: ${block.student_name} — ${block.teacher_name} → ${subTeachers.find(t => t.id === selectedSubTeacherId)?.name ?? 'Unknown'} @ ${formatTime(block.start_time)} on ${dateStr}`,
        performed_by: user?.id ?? null,
      }).then(() => {})

      qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
      toast('Substitute changed', 'success')
      onClose()
    } catch (err: any) { setError(err.message) }
    finally { setSubChanging(false) }
  }

  const currentOption = TYPE_OPTIONS.find(o => o.value === currentType)

  // Notification log for this block
  const { data: blockNotifications } = useQuery({
    queryKey: ['block-notifications', block.block_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('appointment_notifications')
        .select('id, event_type, channel, recipient_type, recipient_name, success, error_message, sent_at')
        .eq('block_id', block.block_id)
        .order('sent_at', { ascending: false })
        .limit(20)
      return data ?? []
    },
  })

  const dateStr = new Date(block.block_date + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })

  // Responsive modal styles — centered on desktop, bottom-sheet on mobile
  const overlayStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(2px)' }
    : {}
  const modalStyle: React.CSSProperties = isMobile
    ? { maxWidth: '100vw', width: '100%', borderRadius: '20px 20px 0 0', maxHeight: '85vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }
    : { maxWidth: 420 }
  // Touch-friendly button min height
  const btnMinH = isMobile ? 48 : undefined

  const handleCheckIn = async () => {
    if (!user) return
    setError(null)
    try {
      const result = await checkIn.mutateAsync({ blockId: block.block_id, action: 'check_in', userId: user.id })
      if (result?.payment_gated) {
        toast('⏳ Session checked in — tally held (billing inactive)', 'warning')
      } else {
        toast('✓ Session checked in — tally credited', 'success')
      }
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
        const { error: e } = await supabase.from('schedule_blocks').update({ block_type: 'call_out', is_family_callout: true, notes: logNote }).eq('id', block.block_id)
        if (e) throw new Error(e.message)
      } else if (cancelType === 'student_leaving') {
        // Mark as last day, revert all future recurring to open
        const { error: e } = await supabase.from('schedule_blocks').update({ block_type: 'last_day', notes: logNote }).eq('id', block.block_id)
        if (e) throw new Error(e.message)
        if (block.is_recurring && block.student_id) {
          const { error: fe } = await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: null })
            .eq('teacher_id', block.teacher_id).eq('start_time', block.start_time).eq('student_id', block.student_id).gt('block_date', block.block_date)
          if (fe) throw new Error(fe.message)
        }
      } else {
        // our_end or accidental — revert to open
        const { error: e } = await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: logNote }).eq('id', block.block_id)
        if (e) throw new Error(e.message)
        if (cancelType === 'our_end' && block.is_recurring && block.student_id) {
          const { error: fe } = await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: null })
            .eq('teacher_id', block.teacher_id).eq('start_time', block.start_time).eq('student_id', block.student_id).gt('block_date', block.block_date)
          if (fe) throw new Error(fe.message)
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

      // Fire cancelled notification (non-blocking)
      sendAppointmentNotification('cancelled', {
        block_id: block.block_id,
        student_name: block.student_name ?? 'Student',
        student_first_name: (block.student_name ?? 'Student').split(' ')[0],
        instrument: block.instrument,
        teacher_name: block.teacher_name,
        teacher_first_name: block.teacher_name.split(' ')[0],
        location_name: block.location_name ?? 'Studio',
        block_date: block.block_date,
        start_time: block.start_time,
        family_id: null, // buildBlockContext will be used for full lookup
        teacher_id: block.teacher_id,
      })

      qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
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
      <div className={isMobile ? undefined : 'modal-overlay'} style={overlayStyle} onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={isMobile ? { ...modalStyle } : { maxWidth: 420 }}>
          {/* Drag handle on mobile */}
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>
          )}
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#EF4444' }}>Cancel Lesson</span>
              <div style={{ fontSize: 13, color: '#C0C0E0', marginTop: 6 }}>{block.student_name} — {formatTime(block.start_time)}, {dateStr}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
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
                          const { error: accErr } = await supabase.from('schedule_blocks').update({ student_id: null, status: 'available', block_type: 'open_time', is_recurring: false, notes: '[Accidental Booking]' }).eq('id', block.block_id)
                          if (accErr) throw new Error(accErr.message)
                          await supabase.from('activity_log').insert({
                            tenant_id: block.tenant_id, entity_type: 'schedule_block', entity_id: block.block_id,
                            action: 'cancel_accidental',
                            description: `Accidental Booking: ${block.student_name} — ${block.teacher_name} @ ${formatTime(block.start_time)} on ${dateStr}`,
                            performed_by: user?.id ?? null,
                          }).then(() => {})
                          sendAppointmentNotification('cancelled', {
                            block_id: block.block_id, student_name: block.student_name ?? 'Student', student_first_name: (block.student_name ?? 'Student').split(' ')[0],
                            instrument: block.instrument, teacher_name: block.teacher_name, teacher_first_name: block.teacher_name.split(' ')[0],
                            location_name: block.location_name ?? 'Studio', block_date: block.block_date, start_time: block.start_time,
                            family_id: null, teacher_id: block.teacher_id,
                          })
                          qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
                          onClose()
                        } catch (err: any) { setError(err.message) }
                        finally { setCancelSubmitting(false) }
                      } else {
                        setCancelType(opt.key)
                      }
                    }}
                    disabled={cancelSubmitting}
                    style={{ padding: '14px 14px', borderRadius: 10, background: opt.bg, border: `1px solid ${opt.border}`, cursor: 'pointer', textAlign: 'left', transition: 'transform 100ms ease', minHeight: btnMinH }}
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

  // Locked time view — show unlock options with series awareness
  const isLockedTime = block.block_type === 'not_bookable' && !block.callout_id
  if (isLockedTime) {
    const dayLabel = new Date(block.block_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long' })

    const handleUnlock = async (scope: 'single' | 'future' | 'all') => {
      setUnlocking(true)
      setError(null)
      try {
        if (scope === 'single') {
          const { error: e } = await supabase.from('schedule_blocks').update({ block_type: 'open_time', notes: null, is_recurring: false }).eq('id', block.block_id)
          if (e) throw new Error(e.message)
        } else {
          // Find sibling blocks: same teacher, same time, same day-of-week, not_bookable
          const dow = new Date(block.block_date + 'T00:00:00').getDay()
          const dateFilter = scope === 'future' ? block.block_date : '1970-01-01'
          const { data: siblings } = await supabase.from('schedule_blocks').select('id, block_date')
            .eq('teacher_id', block.teacher_id).eq('start_time', block.start_time).eq('block_type', 'not_bookable')
            .gte('block_date', dateFilter)
          const targetIds = (siblings ?? [])
            .filter((s: any) => new Date(s.block_date + 'T00:00:00').getDay() === dow)
            .map((s: any) => s.id)
          if (targetIds.length > 0) {
            const { error: e } = await supabase.from('schedule_blocks').update({ block_type: 'open_time', notes: null, is_recurring: false }).in('id', targetIds)
            if (e) throw new Error(e.message)
          }
        }
        qc.invalidateQueries({ queryKey: ['schedule-grid'] })
        qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
        toast('Time unlocked', 'success')
        onClose()
      } catch (err: any) {
        setError(err.message || 'Failed to unlock')
        setUnlocking(false)
      }
    }

    return (
      <div className={isMobile ? undefined : 'modal-overlay'} style={overlayStyle} onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={isMobile ? { ...modalStyle } : { maxWidth: 400 }}>
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>
          )}
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Locked Time</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 6 }}>
              {block.teacher_name} · {formatTime(block.start_time)} · {dayLabel}
            </div>
            {block.notes && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(100,100,140,0.08)', border: '1px solid rgba(100,100,140,0.15)', marginBottom: 16, fontSize: 12, color: '#C0C0E0' }}>
                {block.notes.replace('[Locked] ', '')}
              </div>
            )}

            {block.is_recurring ? (
              <div>
                <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 10 }}>This is a recurring locked time. How should the unlock apply?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => handleUnlock('single')} disabled={unlocking} style={{ width: '100%', padding: isMobile ? '14px 16px' : '10px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E', fontSize: 13, fontWeight: 700, cursor: unlocking ? 'default' : 'pointer', textAlign: 'left', minHeight: isMobile ? 48 : undefined }}>
                    Just this one
                    <div style={{ fontSize: 11, fontWeight: 400, color: '#8080A8', marginTop: 2 }}>Unlock only {dateStr}. All other locked times remain.</div>
                  </button>
                  <button onClick={() => handleUnlock('future')} disabled={unlocking} style={{ width: '100%', padding: isMobile ? '14px 16px' : '10px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E', fontSize: 13, fontWeight: 700, cursor: unlocking ? 'default' : 'pointer', textAlign: 'left', minHeight: isMobile ? 48 : undefined }}>
                    This and all future
                    <div style={{ fontSize: 11, fontWeight: 400, color: '#8080A8', marginTop: 2 }}>Unlock every {dayLabel} at {formatTime(block.start_time)} from {dateStr} forward.</div>
                  </button>
                  <button onClick={() => handleUnlock('all')} disabled={unlocking} style={{ width: '100%', padding: isMobile ? '14px 16px' : '10px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontSize: 13, fontWeight: 700, cursor: unlocking ? 'default' : 'pointer', textAlign: 'left', minHeight: isMobile ? 48 : undefined }}>
                    Entire series
                    <div style={{ fontSize: 11, fontWeight: 400, color: '#8080A8', marginTop: 2 }}>Unlock all past and future locked times in this series.</div>
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => handleUnlock('single')} disabled={unlocking} style={{ width: '100%', padding: isMobile ? '14px 16px' : '10px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', color: '#22C55E', fontSize: 13, fontWeight: 700, cursor: unlocking ? 'default' : 'pointer', minHeight: isMobile ? 48 : undefined }}>
                {unlocking ? 'Unlocking...' : 'Unlock This Time'}
              </button>
            )}

            {error && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 12, color: '#EF4444', marginTop: 10 }}>{error}</div>}
          </div>
        </div>
      </div>
    )
  }

  // Teacher callout view — show locked status + "Remove Callout" option
  const isTeacherCallout = block.block_type === 'call_out' && !block.is_family_callout
  if (isTeacherCallout) {
    return (
      <div className={isMobile ? undefined : 'modal-overlay'} style={overlayStyle} onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()} style={isMobile ? { ...modalStyle } : { maxWidth: 400 }}>
          {isMobile && (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
            </div>
          )}
          <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(217,119,6,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Phone size={14} style={{ color: '#D97706' }} />
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#D97706' }}>Called Out</span>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>{block.teacher_name}</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginBottom: 12 }}>
              {formatTime(block.start_time)} · {dateStr}
            </div>
            {block.callout_reason && (
              <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(217,119,6,0.06)', border: '1px solid rgba(217,119,6,0.15)', marginBottom: 16, fontSize: 12, color: '#D4C5A0' }}>
                — {block.callout_reason}
              </div>
            )}
            <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 16, lineHeight: 1.5 }}>
              This block is locked because the teacher was marked called out. Students need to be rescheduled manually or via sub coverage.
            </div>
            {block.callout_id && (
              <button
                onClick={async () => {
                  try {
                    const { useUndoTeacherCallout } = await import('../../hooks/useTeacherCallout')
                    // We can't use hooks outside a component, so do it inline
                    const { error: updateErr } = await (await import('../../lib/supabase')).supabase
                      .from('schedule_blocks')
                      .update({ block_type: 'open_time', status: 'available', student_id: null, callout_reason: null, callout_id: null, teacher_tally: false })
                      .eq('callout_id', block.callout_id!)
                    if (updateErr) throw updateErr
                    const { error: deleteErr } = await (await import('../../lib/supabase')).supabase
                      .from('teacher_callouts')
                      .delete()
                      .eq('id', block.callout_id!)
                    if (deleteErr) throw deleteErr
                    qc.invalidateQueries({ queryKey: ['schedule-grid'] })
                    qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
                    qc.invalidateQueries({ queryKey: ['dashboard'] })
                    qc.invalidateQueries({ queryKey: ['teacher-callout-tally'] })
                    qc.invalidateQueries({ queryKey: ['teacher-callout-history'] })
                    toast('Callout removed — blocks restored to open time', 'success')
                    onClose()
                  } catch (err: any) {
                    toast(err.message || 'Failed to remove callout', 'error')
                  }
                }}
                style={{
                  width: '100%', padding: isMobile ? '14px 16px' : '10px 16px', borderRadius: 10,
                  background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                  color: '#EF4444', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Remove Callout
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Main view
  return (
    <div className={isMobile ? undefined : 'modal-overlay'} style={overlayStyle} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={modalStyle}>
        {/* Drag handle on mobile */}
        {isMobile && (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)' }} />
          </div>
        )}
        {/* Header */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Lesson Details</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', padding: 4, minHeight: 44, minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '16px 20px' }}>
          {/* Student info */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{block.student_name}</div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 4 }}>
              {instrumentWithEmojiTitle(block.instrument)} · {block.teacher_name} · {formatTime(block.start_time)} · {dateStr}
            </div>
            {block.original_teacher_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', color: '#22C55E', fontWeight: 700 }}>Sub</span>
                <span style={{ fontSize: 11, color: '#FF8C00', fontWeight: 600 }}>{block.original_teacher_name} called out</span>
              </div>
            )}
            {block.fifth_week && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(255,184,0,0.15)', color: '#FFB800', fontWeight: 700, display: 'inline-block', marginTop: 6 }}>5th Week</span>}
            {block.student_id && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={() => { onClose(); navigate(`/admin/students/${block.student_id}`) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '8px 14px' : '3px 10px', minHeight: isMobile ? 44 : undefined, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: isMobile ? 13 : 11, fontWeight: 600, cursor: 'pointer' }}>
                  <ExternalLink size={isMobile ? 14 : 10} /> Go to Student
                </button>
                <button onClick={() => { onClose(); navigate(familyId ? `/admin/families?family=${familyId}` : `/admin/families`) }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: isMobile ? '8px 14px' : '3px 10px', minHeight: isMobile ? 44 : undefined, borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8', fontSize: isMobile ? 13 : 11, fontWeight: 600, cursor: 'pointer' }}>
                  <ExternalLink size={isMobile ? 14 : 10} /> Go to Family
                </button>
              </div>
            )}
          </div>

          {/* Session Log — from teacher quick-input */}
          {block.has_session_log && block.session_log && (
            <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#22C55E', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Session Log</div>
              {(block.session_log.worked_on?.length ?? 0) > 0 && (
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {block.session_log.worked_on.map((tag: string) => (
                    <span key={tag} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: 'rgba(34,197,94,0.1)', color: '#22C55E', fontWeight: 600 }}>{tag}</span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#A0A0C8' }}>
                {block.session_log.engagement_level && (
                  <span>Energy: {['', '😴', '😐', '🙂', '😄', '🔥'][block.session_log.engagement_level]}</span>
                )}
                {block.session_log.progress_indicator && (
                  <span style={{ color: block.session_log.progress_indicator === 'crushing_it' ? '#22C55E' : block.session_log.progress_indicator === 'on_track' ? '#FFB800' : '#EF4444' }}>
                    {block.session_log.progress_indicator === 'crushing_it' ? 'Crushing It' : block.session_log.progress_indicator === 'on_track' ? 'On Track' : 'Needs Work'}
                  </span>
                )}
                {block.session_log.parent_update_status === 'sent' && (
                  <span style={{ color: '#8080A8' }}>Parent update sent</span>
                )}
              </div>
              {block.session_log.teacher_note && (
                <div style={{ fontSize: 11, color: '#C0C0E0', marginTop: 6, fontStyle: 'italic' }}>"{block.session_log.teacher_note}"</div>
              )}
            </div>
          )}

          {/* Change Substitute Teacher */}
          {block.original_teacher_name && subTeachers.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Substitute Teacher</div>
              <select
                value={selectedSubTeacherId}
                onChange={(e) => setSelectedSubTeacherId(e.target.value)}
                style={{
                  width: '100%', padding: isMobile ? '14px 14px' : '10px 14px', borderRadius: 10,
                  border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)',
                  color: '#E0E0F4', fontSize: isMobile ? 14 : 13, outline: 'none', fontFamily: 'inherit',
                  minHeight: isMobile ? 48 : undefined,
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
              style={{ width: '100%', padding: isMobile ? '14px 14px' : '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: isMobile ? 14 : 13, outline: 'none', minHeight: isMobile ? 48 : undefined }}
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

          {/* Virtual session toggle */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Virtual Session</div>
            {block.is_virtual && block.meet_link ? (
              <div style={{ padding: '10px 14px', background: 'rgba(0,188,212,0.06)', border: '1px solid rgba(0,188,212,0.15)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Video size={14} style={{ color: '#00BCD4' }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#00BCD4' }}>Virtual — Google Meet</span>
                </div>
                <a href={block.meet_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#38BDF8', wordBreak: 'break-all' }}>{block.meet_link}</a>
                <button
                  onClick={() => setShowVirtualConfirm(true)}
                  style={{ marginTop: 8, width: '100%', padding: '8px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  Convert Back to In-Person
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowVirtualConfirm(true)}
                disabled={virtualConverting}
                style={{ width: '100%', padding: isMobile ? '14px 14px' : '10px 14px', borderRadius: 10, background: 'rgba(0,188,212,0.06)', border: '1px solid rgba(0,188,212,0.15)', color: '#00BCD4', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: isMobile ? 48 : undefined }}
              >
                <Video size={14} /> {virtualConverting ? 'Converting...' : 'Make Virtual (Google Meet)'}
              </button>
            )}
          </div>

          {/* Virtual confirmation modal */}
          {showVirtualConfirm && (
            <div style={{ position: 'fixed', inset: 0, zIndex: 10001, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={() => setShowVirtualConfirm(false)}>
              <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, margin: '0 16px', background: '#141224', border: '1px solid rgba(0,188,212,0.2)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', padding: '24px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 8 }}>
                  {block.is_virtual ? 'Convert Back to In-Person?' : 'Convert to Virtual Session?'}
                </div>
                <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.5, marginBottom: 20 }}>
                  {block.is_virtual
                    ? 'The Google Meet link will be deactivated and teacher and parent will be notified it\'s back in-person.'
                    : `You're about to convert ${block.student_name}'s session on ${dateStr} at ${formatTime(block.start_time)} to a Google Meet virtual session. A Meet link will be generated and sent to ${block.teacher_name.split(' ')[0]} and the family immediately.`}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowVirtualConfirm(false)} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', fontWeight: 600, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Cancel</button>
                  <button
                    disabled={virtualConverting}
                    onClick={async () => {
                      setVirtualConverting(true)
                      try {
                        if (block.is_virtual) {
                          // Revert to in-person
                          const { error: vErr } = await supabase.from('schedule_blocks').update({ is_virtual: false, meet_link: null, meet_event_id: null }).eq('id', block.block_id)
                          if (vErr) throw new Error(vErr.message)
                          qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
                          toast('Converted back to in-person', 'success')
                        } else {
                          // Convert to virtual
                          const token = (await supabase.auth.getSession()).data.session?.access_token
                          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-google-meet`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                            body: JSON.stringify({ block_id: block.block_id, tenant_id: block.tenant_id, user_id: user?.id }),
                          })
                          const result = await res.json()
                          if (!result.success) throw new Error(result.error)

                          // Send virtual notification
                          sendAppointmentNotification('virtual_converted', {
                            block_id: block.block_id, student_name: block.student_name ?? 'Student',
                            student_first_name: (block.student_name ?? 'Student').split(' ')[0],
                            instrument: block.instrument, teacher_name: block.teacher_name,
                            teacher_first_name: block.teacher_name.split(' ')[0],
                            location_name: block.location_name ?? 'Studio',
                            block_date: block.block_date, start_time: block.start_time,
                            family_id: null, teacher_id: block.teacher_id,
                            meet_link: result.meet_link,
                          })

                          qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
                          toast('Virtual session created. Link sent to teacher and parent.', 'success')
                        }
                        setShowVirtualConfirm(false)
                        onClose()
                      } catch (err: any) {
                        toast(err.message || 'Failed to convert', 'error')
                      } finally { setVirtualConverting(false) }
                    }}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: 10, background: block.is_virtual ? '#EF4444' : '#00BCD4', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: virtualConverting ? 'default' : 'pointer', minHeight: 44, opacity: virtualConverting ? 0.6 : 1 }}
                  >
                    {virtualConverting ? 'Processing...' : block.is_virtual ? 'Yes, Back to In-Person' : 'Yes, Make it Virtual'}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                            const { error: undoErr } = await supabase.from('schedule_blocks').update({ checked_in: false, teacher_tally: false }).eq('id', block.block_id)
                            if (undoErr) throw new Error(undoErr.message)
                            await supabase.from('activity_log').insert({
                              tenant_id: block.tenant_id, entity_type: 'schedule_block', entity_id: block.block_id,
                              action: 'undo_checkin',
                              description: `Undo check-in: ${block.student_name} — ${block.teacher_name} @ ${formatTime(block.start_time)} on ${dateStr}. Reason: ${undoReason.trim()}`,
                              performed_by: user?.id ?? null,
                            }).then(() => {})
                            qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
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

          {/* Notification log */}
          {blockNotifications && blockNotifications.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#606088', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Notifications sent</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {blockNotifications.map((n: any) => {
                  const ago = timeAgo(n.sent_at)
                  const eventLabels: Record<string, string> = { booked: 'Session booked', cancelled: 'Cancelled', rescheduled: 'Rescheduled', reminder_24hr: '24hr reminder', reminder_4hr: '4hr reminder', reminder_1hr: '1hr reminder', virtual_converted: 'Virtual converted' }
                  return (
                    <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#8080A8', padding: '3px 0' }}>
                      <span style={{ fontSize: 11 }}>{n.channel === 'sms' ? '📱' : '✉️'}</span>
                      <span style={{ textTransform: 'capitalize' }}>{n.recipient_type}</span>
                      <span style={{ color: '#363656' }}>·</span>
                      <span>{eventLabels[n.event_type] ?? n.event_type}</span>
                      <span style={{ color: '#363656' }}>·</span>
                      <span style={{ color: '#606088' }}>{ago}</span>
                      <span title={n.success ? 'Sent' : n.error_message || 'Failed'} style={{ color: n.success ? '#22C55E' : '#EF4444', fontSize: 11 }}>{n.success ? '✓' : '✗'}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bottom actions — Check-in prominent on top, then Update + Cancel */}
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', paddingBottom: isMobile ? 20 : 0 }}>
            {/* Check-in — THE primary action, big and satisfying */}
            {!block.fifth_week && !block.checked_in && canCheckIn && (
              <button
                onClick={handleCheckIn}
                disabled={checkIn.isPending}
                style={{
                  width: '100%', padding: isMobile ? '16px 20px' : '13px 16px', borderRadius: 12,
                  background: 'linear-gradient(180deg, #22C55E, #16A34A)',
                  boxShadow: '0 4px 20px rgba(34,197,94,0.3)',
                  border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  color: '#fff', fontWeight: 800, fontSize: isMobile ? 16 : 14,
                  minHeight: isMobile ? 56 : 44,
                  marginBottom: 10,
                  transition: 'transform 150ms ease, box-shadow 150ms ease',
                }}
                onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
                onTouchStart={e => (e.currentTarget.style.transform = 'scale(0.97)')}
                onTouchEnd={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <Check size={isMobile ? 22 : 18} /> {checkIn.isPending ? 'Checking in...' : 'Check In'}
              </button>
            )}

            {/* Update Appointment */}
            <button
              onClick={async () => {
                if (currentType !== block.block_type) {
                  await handleTypeChange(currentType)
                  await new Promise(r => setTimeout(r, 200))
                }
                onClose()
              }}
              disabled={changeBlockType.isPending}
              style={{ width: '100%', padding: isMobile ? '14px 16px' : '11px 16px', borderRadius: 10, background: '#FACC15', border: 'none', cursor: 'pointer', color: '#1A1A2E', fontWeight: 700, fontSize: 13, marginBottom: 8, minHeight: isMobile ? 48 : undefined }}
            >
              {changeBlockType.isPending ? 'Saving...' : 'Update Appointment'}
            </button>

            {/* Cancel — secondary action */}
            {!block.fifth_week && !block.checked_in && (
              <button
                onClick={() => setShowCancel(true)}
                style={{ width: '100%', padding: isMobile ? '14px 12px' : '9px 12px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', cursor: 'pointer', color: '#EF4444', fontWeight: 600, fontSize: 12, minHeight: isMobile ? 48 : undefined }}
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
  const mobile = window.innerWidth < MOBILE_BP

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
    const { error: roomErr } = await supabase.from('schedule_blocks').update({ room_id: roomId || null, room: room?.name ?? null }).eq('id', block.block_id)
    if (roomErr) { toast('Failed to update room: ' + roomErr.message, 'error'); return }
    setCurrentRoom(roomId)
    qc.invalidateQueries({ queryKey: ['schedule-grid'] }); qc.invalidateQueries({ queryKey: ['schedule-intelligence'] })
    toast(roomId ? `Moved to ${room?.name}` : 'Room removed', 'success')
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Room</div>
      <select value={currentRoom} onChange={(e) => handleChange(e.target.value)} style={{ width: '100%', padding: mobile ? '14px 12px' : '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: mobile ? 14 : 12, outline: 'none', minHeight: mobile ? 48 : undefined }}>
        <option value="">No room</option>
        {activeRooms.map((r: any) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
    </div>
  )
}
