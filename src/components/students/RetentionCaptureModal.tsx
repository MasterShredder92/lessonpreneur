import { useState } from 'react'
import { createPortal } from 'react-dom'
import { usePauseStudent } from '../../hooks/useRetention'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations } from '../../hooks/useLocations'
import { supabase } from '../../lib/supabase'
import { toast } from '../shared/Toast'

const REASONS = [
  'Schedule Conflict',
  'Cost / Financial',
  'Moving Away',
  'Taking a Break',
  'Not Enjoying It',
  'Teacher Fit',
  'Health / Personal',
  'Other',
]

const EXIT_CATEGORIES: { value: string; label: string }[] = [
  { value: 'summer_break', label: 'Summer Break' },
  { value: 'holiday_break', label: 'Holiday Break' },
  { value: 'financial', label: 'Financial' },
  { value: 'schedule_conflict', label: 'Schedule Conflict' },
  { value: 'moving', label: 'Moving' },
  { value: 'lost_interest', label: 'Lost Interest' },
  { value: 'sports', label: 'Sports' },
  { value: 'teacher_fit', label: 'Teacher Fit' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'other', label: 'Other' },
]

function calcReactivationDate(category: string, deactivatedAt: Date): string | null {
  const d = new Date(deactivatedAt)
  switch (category) {
    case 'summer_break': return `${d.getFullYear()}-08-01`
    case 'holiday_break': return `${d.getFullYear() + 1}-01-02`
    case 'financial': d.setDate(d.getDate() + 60); return d.toISOString().split('T')[0]
    case 'schedule_conflict': d.setDate(d.getDate() + 30); return d.toISOString().split('T')[0]
    case 'lost_interest': case 'sports': case 'teacher_fit': d.setDate(d.getDate() + 90); return d.toISOString().split('T')[0]
    case 'other': d.setDate(d.getDate() + 60); return d.toISOString().split('T')[0]
    case 'moving': case 'transferred': return null
    default: return null
  }
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

interface Props {
  studentId: string
  studentFirstName: string
  familyId: string
  newStatus: 'paused' | 'inactive'
  onComplete: () => void
  onCancel: () => void
}

export default function RetentionCaptureModal({ studentId, studentFirstName, familyId, newStatus, onComplete, onCancel }: Props) {
  const { tenantId } = useAuthContext()
  const pauseStudent = usePauseStudent()
  const { data: locations } = useLocations()

  const [reason, setReason] = useState('')
  const [reasonDetail, setReasonDetail] = useState('')
  const [exitCategory, setExitCategory] = useState('')
  const [transferLocationId, setTransferLocationId] = useState('')
  const [comingBack, setComingBack] = useState<boolean | null>(null)
  const [returnMonth, setReturnMonth] = useState('')
  const [returnYear, setReturnYear] = useState(String(new Date().getFullYear()))
  const [followupMonth, setFollowupMonth] = useState('')
  const [followupYear, setFollowupYear] = useState(String(new Date().getFullYear()))

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear + 1, currentYear + 2]

  const buildDate = (month: string, year: string): string | null => {
    if (!month || !year) return null
    const m = MONTHS.indexOf(month) + 1
    return `${year}-${String(m).padStart(2, '0')}-01`
  }

  const handleSkip = async () => {
    if (!tenantId) return
    try {
      await pauseStudent.mutateAsync({
        studentId, familyId, tenantId,
        newStatus,
        pauseReason: '',
        comingBack: null,
      })
      toast(`Student ${newStatus === 'paused' ? 'paused' : 'deactivated'}`, 'success')
      onComplete()
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const handleSave = async () => {
    if (!tenantId) return
    const expectedReturn = comingBack ? buildDate(returnMonth, returnYear) : null
    const followup = buildDate(followupMonth, followupYear) ?? expectedReturn
    try {
      await pauseStudent.mutateAsync({
        studentId, familyId, tenantId,
        newStatus,
        pauseReason: reason,
        pauseReasonDetail: reasonDetail || undefined,
        comingBack,
        expectedReturnDate: expectedReturn,
        followupDate: followup,
      })

      // Save exit_category and reactivation_date
      if (exitCategory) {
        const reactivationDate = calcReactivationDate(exitCategory, new Date())
        const updates: Record<string, any> = {
          exit_category: exitCategory,
          reactivation_date: reactivationDate,
        }
        if (exitCategory === 'transferred' && transferLocationId) {
          updates.transferred_to_location_id = transferLocationId
        }
        await supabase.from('students').update(updates).eq('id', studentId)
      }

      toast(`Student ${newStatus === 'paused' ? 'paused' : 'deactivated'}`, 'success')
      onComplete()
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto',
        background: '#141224', borderRadius: 20, border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ height: 3, background: 'linear-gradient(90deg, #D4226A, #7B2CBF)', borderRadius: '20px 20px 0 0' }} />
        <div style={{ padding: '24px 28px 28px' }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Before you go — {studentFirstName}</div>
          <div style={{ fontSize: 13, color: '#8080A8', marginBottom: 20 }}>Help us track why and plan a follow-up</div>

          {/* REASON */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Why are they {newStatus === 'paused' ? 'pausing' : 'leaving'}?</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {REASONS.map((r) => (
                <button key={r} onClick={() => setReason(r)} style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: reason === r ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${reason === r ? 'rgba(212,34,106,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: reason === r ? '#E8488A' : '#585878',
                }}>{r}</button>
              ))}
            </div>
            <textarea value={reasonDetail} onChange={(e) => setReasonDetail(e.target.value)} placeholder="Any additional context..." rows={2} style={{
              width: '100%', marginTop: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10, padding: '10px 14px', color: '#E0E0F4', fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
            }} />
          </div>

          {/* EXIT CATEGORY */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Exit Category</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EXIT_CATEGORIES.map((c) => (
                <button key={c.value} onClick={() => setExitCategory(c.value)} style={{
                  padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  background: exitCategory === c.value ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${exitCategory === c.value ? 'rgba(56,189,248,0.35)' : 'rgba(255,255,255,0.08)'}`,
                  color: exitCategory === c.value ? '#38BDF8' : '#585878',
                }}>{c.label}</button>
              ))}
            </div>
            {exitCategory === 'transferred' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 4 }}>Transfer to which location?</div>
                <select
                  value={transferLocationId}
                  onChange={(e) => setTransferLocationId(e.target.value)}
                  className="filter-select"
                  style={{ width: '100%' }}
                >
                  <option value="">Select location...</option>
                  {locations?.filter((l: any) => l.is_active).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name?.replace(' Music Lessons', '')}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* COMING BACK */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Are they planning to come back?</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setComingBack(true)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: comingBack === true ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${comingBack === true ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: comingBack === true ? '#22C55E' : '#585878',
              }}>Yes, planning to return</button>
              <button onClick={() => setComingBack(false)} style={{
                flex: 1, padding: '12px 16px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: comingBack === false ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${comingBack === false ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.06)'}`,
                color: comingBack === false ? '#EF4444' : '#585878',
              }}>Not sure / probably not</button>
            </div>

            {comingBack === true && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 6 }}>When do you expect them back?</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={returnMonth} onChange={(e) => setReturnMonth(e.target.value)} className="filter-select" style={{ flex: 1 }}>
                    <option value="">Month</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={returnYear} onChange={(e) => setReturnYear(e.target.value)} className="filter-select" style={{ width: 90 }}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div style={{ fontSize: 10, color: '#606088', marginTop: 4 }}>We'll remind you to reach out before this date.</div>
              </div>
            )}

            {comingBack === false && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 11, color: '#8080A8', marginBottom: 6 }}>When should we check in anyway? (optional)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={followupMonth} onChange={(e) => setFollowupMonth(e.target.value)} className="filter-select" style={{ flex: 1 }}>
                    <option value="">Month</option>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <select value={followupYear} onChange={(e) => setFollowupYear(e.target.value)} className="filter-select" style={{ width: 90 }}>
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* FOLLOW-UP DATE */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Schedule a follow-up reminder</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={followupMonth || (comingBack ? returnMonth : '')} onChange={(e) => setFollowupMonth(e.target.value)} className="filter-select" style={{ flex: 1 }}>
                <option value="">Month</option>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={followupYear || (comingBack ? returnYear : String(currentYear))} onChange={(e) => setFollowupYear(e.target.value)} className="filter-select" style={{ width: 90 }}>
                {years.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* ACTIONS */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn-ghost" onClick={handleSkip} disabled={pauseStudent.isPending} style={{ fontSize: 12 }}>
              Skip — just change status
            </button>
            <button className="btn-primary" onClick={handleSave} disabled={pauseStudent.isPending} style={{ fontSize: 13, padding: '10px 24px' }}>
              {pauseStudent.isPending ? 'Saving...' : 'Save & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
