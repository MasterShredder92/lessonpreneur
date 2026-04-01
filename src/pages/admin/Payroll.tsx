import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useTeachers } from '../../hooks/useTeachers'
import { usePermissions } from '../../hooks/usePermissions'
import {
  usePayrollPeriods,
  usePayrollEntries,
  useCreatePayrollPeriod,
  useUpdatePayrollPeriod,
  useCreatePayrollEntry,
  useUpdatePayrollEntry,
  useTips,
  useCreateTip,
  type PayrollEntry,
} from '../../hooks/usePayroll'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Lock,
  Plus,
  X,
  Pencil,
  FileText,
  AlertTriangle,
  BarChart3,
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const DIRECTOR_ROLES = ['Studio Director', 'admin', 'company_director']

// ─── Bonus Auto-Calc ─────────────────────────────────────────
function calcBonus(sessions: number): number {
  if (sessions >= 160) return 200
  if (sessions >= 120) return 100
  return 0
}

// ─── Dollar Format ───────────────────────────────────────────
function fmt(cents: number): string {
  const abs = Math.abs(cents)
  const str = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cents < 0 ? `-$${str}` : `$${str}`
}

// ─── Styles ──────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  position: 'relative',
  overflow: 'hidden',
}
const cardEdge: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: 4,
  height: '100%',
  background: 'linear-gradient(180deg, #FFB800 0%, #FF6B00 100%)',
  borderRadius: '14px 0 0 14px',
}
const thStyle: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 10,
  fontWeight: 700,
  color: '#8080A8',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}
const thRight: React.CSSProperties = { ...thStyle, textAlign: 'right' }
const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 12,
  color: '#C0C0E0',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
}
const numTd: React.CSSProperties = {
  ...tdStyle,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
const inputStyle: React.CSSProperties = {
  padding: '6px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E0E0F4',
  fontSize: 12,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: 'linear-gradient(135deg, #FFB800, #FF6B00)',
  border: 'none',
  color: '#0A0918',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
const btnOutlined: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: 'transparent',
  border: '1px solid rgba(255,184,0,0.4)',
  color: '#FFB800',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
const btnDestructive: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.3)',
  color: '#EF4444',
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
}
const btnGhost: React.CSSProperties = {
  padding: '6px 14px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#A0A0C8',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
}
const badge = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-block',
  fontSize: 10,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '3px 10px',
  borderRadius: 6,
  background: bg,
  color,
})

// ─── Inline Edit Cell ────────────────────────────────────────
function EditableCell({
  value,
  onSave,
  type = 'number',
  prefix = '',
  disabled = false,
  style,
}: {
  value: number
  onSave: (v: number) => void
  type?: 'number' | 'dollar'
  prefix?: string
  disabled?: boolean
  style?: React.CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      setDraft(String(value))
      ref.current?.focus()
      ref.current?.select()
    }
  }, [editing, value])

  if (disabled) {
    return (
      <span style={style}>
        {prefix}{type === 'dollar' ? fmt(value) : value}
      </span>
    )
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        style={{ ...style, cursor: 'pointer', borderBottom: '1px dashed rgba(255,255,255,0.15)', paddingBottom: 1 }}
        title="Click to edit"
      >
        {prefix}{type === 'dollar' ? fmt(value) : value}
      </span>
    )
  }

  return (
    <input
      ref={ref}
      type="number"
      min={0}
      step={type === 'dollar' ? 0.01 : 1}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const parsed = type === 'dollar' ? parseFloat(draft) : parseInt(draft, 10)
        if (!isNaN(parsed) && parsed >= 0) onSave(parsed)
        setEditing(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setEditing(false)
      }}
      style={{ ...inputStyle, width: 80, textAlign: 'right' }}
    />
  )
}

// ═════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════
export default function Payroll() {
  const { role, tenantId, profile } = useAuthContext()
  const { canDo, isAtLeast } = usePermissions()
  const { data: teachers } = useTeachers()
  const { data: periods } = usePayrollPeriods()
  const createPeriod = useCreatePayrollPeriod()
  const updatePeriod = useUpdatePayrollPeriod()
  const createEntry = useCreatePayrollEntry()
  const updateEntry = useUpdatePayrollEntry()
  const createTip = useCreateTip()
  const queryClient = useQueryClient()

  // ─── Month Selector State ──────────────────────────────────
  const now = new Date()
  const [selYear, setSelYear] = useState(now.getFullYear())
  const [selMonth, setSelMonth] = useState(now.getMonth()) // 0-indexed

  const monthLabel = `${MONTHS[selMonth]} ${selYear}`

  const goNext = () => {
    if (selMonth === 11) { setSelMonth(0); setSelYear((y) => y + 1) }
    else setSelMonth((m) => m + 1)
  }
  const goPrev = () => {
    if (selMonth === 0) { setSelMonth(11); setSelYear((y) => y - 1) }
    else setSelMonth((m) => m - 1)
  }

  // Match period to selected month
  const activePeriod = useMemo(() => {
    if (!periods) return undefined
    return periods.find((p) => {
      const d = new Date(p.billing_date + 'T00:00:00')
      return d.getFullYear() === selYear && d.getMonth() === selMonth
    })
  }, [periods, selYear, selMonth])

  const activePeriodId = activePeriod?.id ?? ''

  // ─── Data Loading ──────────────────────────────────────────
  const { data: entries } = usePayrollEntries(activePeriodId || undefined)
  const { data: tips } = useTips(activePeriodId || undefined)

  // Students for tips dropdown
  const { data: students } = useQuery({
    queryKey: ['students-for-tips'],
    queryFn: async () => {
      const { data } = await supabase
        .from('students')
        .select('id, first_name, last_name, teacher_id')
        .eq('status', 'active')
        .order('last_name')
      return data ?? []
    },
  })

  const activeTeachers = useMemo(() => {
    return (teachers ?? []).filter((t: any) => {
      const status = t.status ?? (t.is_active ? 'active' : 'inactive')
      return status !== 'inactive'
    })
  }, [teachers])

  // ─── Estimate State ────────────────────────────────────────
  const [estimates, setEstimates] = useState<Map<string, { actual: number; remaining: number }> | null>(null)

  // ─── Tip Modal State ───────────────────────────────────────
  const [showTipModal, setShowTipModal] = useState(false)
  const [tipStudentId, setTipStudentId] = useState('')
  const [tipAmount, setTipAmount] = useState('')
  const [tipMode, setTipMode] = useState<'single' | 'split' | 'custom'>('single')
  const [tipTeacherId, setTipTeacherId] = useState('')
  const [tipCustomAmounts, setTipCustomAmounts] = useState<Record<string, string>>({})

  // Tip totals per teacher from tip_attributions
  const tipsByTeacher = useMemo(() => {
    const map = new Map<string, number>()
    tips?.forEach((tip) => {
      tip.tip_attributions?.forEach((attr) => {
        map.set(attr.teacher_id, (map.get(attr.teacher_id) ?? 0) + attr.amount)
      })
    })
    return map
  }, [tips])

  // Student's teachers for attribution prompt
  const selectedStudentTeachers = useMemo(() => {
    if (!tipStudentId || !students) return []
    const student = students.find((s) => s.id === tipStudentId)
    if (!student?.teacher_id) return []
    return activeTeachers.filter((t: any) => t.id === student.teacher_id)
  }, [tipStudentId, students, activeTeachers])

  // ─── Permission Checks ─────────────────────────────────────
  const isOwner = role === 'owner'
  const canEdit = isAtLeast('admin') // owner + admin/company_director
  const canView = isAtLeast('studio_director')

  // ─── Handlers ──────────────────────────────────────────────

  // Create period for selected month if it doesn't exist
  const handleCreatePeriod = useCallback(async () => {
    if (!tenantId) return
    const billingDate = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`
    await createPeriod.mutateAsync({
      tenant_id: tenantId,
      period_label: monthLabel,
      billing_date: billingDate,
      status: 'open',
    })
  }, [tenantId, selYear, selMonth, monthLabel, createPeriod])

  // Populate entries for all active teachers that don't have one
  const handlePopulateEntries = useCallback(async () => {
    if (!activePeriodId || !tenantId) return
    const existingTeacherIds = new Set((entries ?? []).map((e) => e.teacher_id))
    for (const t of activeTeachers) {
      if (existingTeacherIds.has(t.id)) continue
      const rate = (t as any).rate_per_block ?? (t as any).pay_rate_per_half_hour ?? 0
      await createEntry.mutateAsync({
        tenant_id: tenantId,
        period_id: activePeriodId,
        teacher_id: t.id,
        sessions_taught: 0,
        pay_rate: rate,
        bonus_amount: 0,
        director_pay: 0,
      })
    }
  }, [activePeriodId, tenantId, entries, activeTeachers, createEntry])

  // Update sessions count for an entry
  const handleUpdateSessions = useCallback(async (entry: PayrollEntry, sessions: number) => {
    const bonus = entry.bonus_overridden ? entry.bonus_amount : calcBonus(sessions)
    await updateEntry.mutateAsync({
      id: entry.id,
      period_id: entry.period_id,
      sessions_taught: sessions,
      bonus_amount: bonus,
    })
  }, [updateEntry])

  // Update director pay
  const handleUpdateDirectorPay = useCallback(async (entry: PayrollEntry, amount: number) => {
    await updateEntry.mutateAsync({
      id: entry.id,
      period_id: entry.period_id,
      director_pay: amount,
    })
  }, [updateEntry])

  // Override bonus (owner only)
  const handleOverrideBonus = useCallback(async (entry: PayrollEntry, amount: number) => {
    await updateEntry.mutateAsync({
      id: entry.id,
      period_id: entry.period_id,
      bonus_amount: amount,
      bonus_overridden: true,
      bonus_overridden_by: profile?.id ?? null,
      bonus_overridden_at: new Date().toISOString(),
    })
  }, [updateEntry, profile])

  // Update tips on an entry
  const handleUpdateTips = useCallback(async (entry: PayrollEntry, amount: number) => {
    await updateEntry.mutateAsync({
      id: entry.id,
      period_id: entry.period_id,
      tips: amount,
    })
  }, [updateEntry])

  // Close payroll (owner only)
  const handleClosePeriod = useCallback(async () => {
    if (!activePeriod || !isOwner) return
    if (!window.confirm('Close payroll for ' + monthLabel + '? This marks the period as finalized.')) return
    await updatePeriod.mutateAsync({ id: activePeriod.id, status: 'closed' })
  }, [activePeriod, isOwner, monthLabel, updatePeriod])

  // Generate Estimate
  const handleGenerateEstimate = useCallback(async () => {
    const monthStart = `${selYear}-${String(selMonth + 1).padStart(2, '0')}-01`
    const nextMonth = selMonth === 11
      ? `${selYear + 1}-01-01`
      : `${selYear}-${String(selMonth + 2).padStart(2, '0')}-01`
    const todayStr = new Date().toISOString().split('T')[0]

    // Count checked_in sessions this month per teacher
    const { data: checkedIn } = await supabase
      .from('schedule_blocks')
      .select('teacher_id')
      .eq('checked_in', true)
      .gte('block_date', monthStart)
      .lt('block_date', nextMonth)

    // Count remaining booked blocks for rest of month
    const { data: remaining } = await supabase
      .from('schedule_blocks')
      .select('teacher_id')
      .eq('status', 'booked')
      .not('student_id', 'is', null)
      .gt('block_date', todayStr)
      .lt('block_date', nextMonth)

    const map = new Map<string, { actual: number; remaining: number }>()

    checkedIn?.forEach((b: any) => {
      const prev = map.get(b.teacher_id) ?? { actual: 0, remaining: 0 }
      prev.actual += 1
      map.set(b.teacher_id, prev)
    })

    remaining?.forEach((b: any) => {
      const prev = map.get(b.teacher_id) ?? { actual: 0, remaining: 0 }
      prev.remaining += 1
      map.set(b.teacher_id, prev)
    })

    setEstimates(map)
  }, [selYear, selMonth])

  // Create tip
  const handleCreateTip = useCallback(async () => {
    if (!tipStudentId || !tipAmount || !activePeriodId || !tenantId) return
    const amt = parseFloat(tipAmount)
    if (isNaN(amt) || amt <= 0) return

    let attributions: { teacher_id: string; amount: number }[] = []

    if (tipMode === 'single' && tipTeacherId) {
      attributions = [{ teacher_id: tipTeacherId, amount: amt }]
    } else if (tipMode === 'split' && selectedStudentTeachers.length > 0) {
      const split = amt / selectedStudentTeachers.length
      attributions = selectedStudentTeachers.map((t: any) => ({
        teacher_id: t.id,
        amount: parseFloat(split.toFixed(2)),
      }))
    } else if (tipMode === 'custom') {
      attributions = Object.entries(tipCustomAmounts)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([tid, v]) => ({ teacher_id: tid, amount: parseFloat(v) }))
    }

    if (attributions.length === 0) return

    await createTip.mutateAsync({
      tenant_id: tenantId,
      period_id: activePeriodId,
      student_id: tipStudentId,
      amount: amt,
      attributions,
    })

    // Update tips on the relevant entries
    for (const attr of attributions) {
      const entry = entries?.find((e) => e.teacher_id === attr.teacher_id)
      if (entry) {
        const currentTips = (tipsByTeacher.get(attr.teacher_id) ?? 0) + attr.amount
        await updateEntry.mutateAsync({
          id: entry.id,
          period_id: entry.period_id,
          tips: currentTips,
        })
      }
    }

    setShowTipModal(false)
    setTipStudentId('')
    setTipAmount('')
    setTipMode('single')
    setTipTeacherId('')
    setTipCustomAmounts({})
  }, [tipStudentId, tipAmount, activePeriodId, tenantId, tipMode, tipTeacherId, selectedStudentTeachers, tipCustomAmounts, createTip, entries, tipsByTeacher, updateEntry])

  // PDF Export
  const handleExportPDF = useCallback(() => {
    const monthStr = MONTHS[selMonth]
    const filename = `Payroll_${monthStr}${selYear}`
    document.title = filename
    window.print()
    document.title = 'Music School OS'
  }, [selMonth, selYear])

  // ─── Totals ────────────────────────────────────────────────
  const totals = useMemo(() => {
    let sessions = 0, sessionTotal = 0, directorPay = 0, bonus = 0, tipTotal = 0, totalPay = 0
    ;(entries ?? []).forEach((e) => {
      sessions += e.sessions_taught
      sessionTotal += e.session_total ?? (e.sessions_taught * e.pay_rate)
      directorPay += e.director_pay ?? 0
      bonus += e.bonus_amount
      tipTotal += e.tips ?? 0
      totalPay += e.total_pay ?? ((e.sessions_taught * e.pay_rate) + e.bonus_amount + (e.tips ?? 0) + (e.director_pay ?? 0))
    })
    return { sessions, sessionTotal, directorPay, bonus, tipTotal, totalPay }
  }, [entries])

  // ─── Access Control ────────────────────────────────────────
  if (!canView) {
    return (
      <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <Lock size={40} style={{ color: '#606088', marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#8080A8' }}>No access</p>
        </div>
      </div>
    )
  }

  const isOpen = activePeriod?.status === 'open'
  const isClosed = activePeriod?.status === 'closed'

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="page">
      {/* Print-only header */}
      <div className="print-only" style={{ display: 'none' }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#000', marginBottom: 4 }}>
          Adkins Music Lessons — Payroll
        </h1>
        <p style={{ fontSize: 14, color: '#333', marginBottom: 16 }}>
          {monthLabel} &middot; Generated {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* ─── Page Header ─────────────────────────────────────── */}
      <div className="page-header no-print">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <DollarSign size={20} style={{ color: '#FFB800' }} />
          <h1>Payroll</h1>
        </div>
      </div>

      {/* ─── Top Bar ─────────────────────────────────────────── */}
      <div className="no-print" style={{ ...card, padding: '16px 24px', marginBottom: 24 }}>
        <div style={cardEdge} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {/* Month/Year Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={goPrev} style={{ ...btnGhost, padding: '6px 8px' }} title="Previous month">
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', minWidth: 160, textAlign: 'center' }}>
              {monthLabel}
            </span>
            <button onClick={goNext} style={{ ...btnGhost, padding: '6px 8px' }} title="Next month">
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Status Badge */}
          {activePeriod ? (
            isOpen ? (
              <span style={badge('rgba(34,197,94,0.12)', '#22C55E')}>Open</span>
            ) : (
              <span style={badge('rgba(128,128,168,0.15)', '#A0A0C8')}>Closed</span>
            )
          ) : (
            <span style={badge('rgba(128,128,168,0.1)', '#8080A8')}>No Period</span>
          )}

          <div style={{ flex: 1 }} />

          {/* Action Buttons */}
          {activePeriodId && canEdit && (
            <button onClick={handleGenerateEstimate} style={btnOutlined}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BarChart3 size={13} /> Generate Estimate
              </span>
            </button>
          )}

          {activePeriodId && (
            <button onClick={handleExportPDF} style={btnPrimary}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={13} /> Export PDF
              </span>
            </button>
          )}

          {activePeriodId && isOwner && isOpen && (
            <button onClick={handleClosePeriod} style={btnDestructive}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={13} /> Close Payroll
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ─── No Period? Create One ───────────────────────────── */}
      {!activePeriod && canEdit && (
        <div style={{ ...card, padding: '32px 24px', marginBottom: 24, textAlign: 'center' }}>
          <div style={cardEdge} />
          <p style={{ fontSize: 14, color: '#A0A0C8', marginBottom: 16 }}>
            No payroll period exists for {monthLabel}.
          </p>
          <button onClick={handleCreatePeriod} style={btnPrimary} disabled={createPeriod.isPending}>
            {createPeriod.isPending ? 'Creating...' : `Create Period for ${monthLabel}`}
          </button>
        </div>
      )}

      {/* ─── Estimate Warning Banner ─────────────────────────── */}
      {estimates && (
        <div className="no-print" style={{
          background: 'rgba(255,184,0,0.08)',
          border: '1px solid rgba(255,184,0,0.25)',
          borderRadius: 10,
          padding: '12px 20px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <AlertTriangle size={16} style={{ color: '#FFB800', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: '#FFB800', fontWeight: 600 }}>
            Estimate mode — showing projected session counts based on check-ins and remaining booked sessions this month. Refresh to dismiss.
          </span>
          <button
            onClick={() => setEstimates(null)}
            style={{ ...btnGhost, marginLeft: 'auto', padding: '4px 10px', fontSize: 10 }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ─── Populate Button ─────────────────────────────────── */}
      {activePeriodId && canEdit && isOpen && (
        <div className="no-print" style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
          <button onClick={handlePopulateEntries} style={btnGhost} disabled={createEntry.isPending}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={12} /> Populate Teachers
            </span>
          </button>
        </div>
      )}

      {/* ─── Main Payroll Grid ───────────────────────────────── */}
      {activePeriodId && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={cardEdge} />
          <div style={{
            padding: '16px 24px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>
              {monthLabel} — Payroll
              {isClosed && (
                <span style={{ ...badge('rgba(239,68,68,0.1)', '#EF4444'), marginLeft: 10 }}>Closed</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: '#8080A8' }}>
              {entries?.length ?? 0} teachers
            </div>
          </div>

          <div style={{ overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, position: 'sticky', left: 0, background: '#0D0B1A', zIndex: 1, minWidth: 160 }}>Name</th>
                  <th style={{ ...thStyle, width: 100 }}>Role</th>
                  <th style={{ ...thRight, width: 100 }}>
                    Sessions
                    {estimates && <span style={{ color: '#FFB800', marginLeft: 4 }}>/ Est.</span>}
                  </th>
                  <th style={{ ...thRight, width: 100 }}>Rate</th>
                  <th style={{ ...thRight, width: 120 }}>Session Total</th>
                  <th style={{ ...thRight, width: 120 }}>Director Pay</th>
                  <th style={{ ...thRight, width: 120 }}>Bonus</th>
                  <th style={{ ...thRight, width: 100 }}>Tips</th>
                  <th style={{ ...thRight, width: 130 }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                {(entries ?? []).map((entry) => {
                  const t = entry.teacher
                  const teacherName = t ? `${t.first_name} ${t.last_name}` : 'Unknown'
                  const teacherRole = t?.teacher_role ?? 'Teacher'
                  const isDirector = DIRECTOR_ROLES.some((r) =>
                    (t?.teacher_role ?? '').toLowerCase().includes(r.toLowerCase())
                  )
                  const sessionTotal = entry.session_total ?? (entry.sessions_taught * entry.pay_rate)
                  const tipAmt = entry.tips ?? 0
                  const dirPay = entry.director_pay ?? 0
                  const totalPay = entry.total_pay ?? (sessionTotal + entry.bonus_amount + tipAmt + dirPay)

                  const est = estimates?.get(entry.teacher_id)
                  const estTotal = est ? est.actual + est.remaining : null

                  return (
                    <tr key={entry.id} style={{ background: 'rgba(255,255,255,0.01)' }}>
                      {/* Name */}
                      <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#0D0B1A', zIndex: 1, fontWeight: 600 }}>
                        {teacherName}
                      </td>

                      {/* Role */}
                      <td style={{ ...tdStyle, fontSize: 11, color: '#A0A0C8' }}>
                        {teacherRole}
                      </td>

                      {/* Sessions (editable) */}
                      <td style={numTd}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <EditableCell
                            value={entry.sessions_taught}
                            onSave={(v) => handleUpdateSessions(entry, v)}
                            disabled={!canEdit || !isOpen}
                          />
                          {estTotal !== null && (
                            <span style={{ fontSize: 10, color: '#A0A0C8', fontStyle: 'italic' }}>
                              / {estTotal}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Rate (read-only) */}
                      <td style={numTd}>
                        {fmt(entry.pay_rate)}/session
                      </td>

                      {/* Session Total (read-only, GENERATED) */}
                      <td style={numTd}>{fmt(sessionTotal)}</td>

                      {/* Director Pay (editable only for directors) */}
                      <td style={numTd}>
                        {isDirector ? (
                          <EditableCell
                            value={dirPay}
                            onSave={(v) => handleUpdateDirectorPay(entry, v)}
                            type="dollar"
                            disabled={!canEdit || !isOpen}
                          />
                        ) : (
                          <span style={{ color: '#606088' }}>--</span>
                        )}
                      </td>

                      {/* Bonus */}
                      <td style={numTd}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {entry.bonus_overridden ? (
                            <>
                              <EditableCell
                                value={entry.bonus_amount}
                                onSave={(v) => handleOverrideBonus(entry, v)}
                                type="dollar"
                                disabled={!isOwner || !isOpen}
                              />
                              <span style={{
                                fontSize: 8,
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                color: '#F59E0B',
                                background: 'rgba(245,158,11,0.1)',
                                padding: '2px 5px',
                                borderRadius: 3,
                              }}>
                                edited
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{fmt(entry.bonus_amount)}</span>
                              {isOwner && isOpen && (
                                <button
                                  onClick={() => {
                                    const val = prompt('Override bonus amount:', String(entry.bonus_amount))
                                    if (val !== null) {
                                      const parsed = parseFloat(val)
                                      if (!isNaN(parsed) && parsed >= 0) handleOverrideBonus(entry, parsed)
                                    }
                                  }}
                                  title="Override bonus (owner only)"
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#8080A8' }}
                                >
                                  <Pencil size={11} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>

                      {/* Tips (editable) */}
                      <td style={numTd}>
                        <EditableCell
                          value={tipAmt}
                          onSave={(v) => handleUpdateTips(entry, v)}
                          type="dollar"
                          disabled={!canEdit || !isOpen}
                        />
                      </td>

                      {/* TOTAL (read-only, GENERATED) */}
                      <td style={{ ...numTd, fontWeight: 700, color: '#22C55E' }}>
                        {fmt(totalPay)}
                      </td>
                    </tr>
                  )
                })}

                {/* ─── Totals Row ─────────────────────────────── */}
                {entries && entries.length > 0 && (
                  <tr style={{ background: 'rgba(255,184,0,0.04)' }}>
                    <td style={{ ...tdStyle, position: 'sticky', left: 0, background: '#0D0B1A', zIndex: 1, fontWeight: 800, color: '#FFB800', borderTop: '2px solid rgba(255,184,0,0.2)' }}>
                      TOTALS
                    </td>
                    <td style={{ ...tdStyle, borderTop: '2px solid rgba(255,184,0,0.2)' }} />
                    <td style={{ ...numTd, fontWeight: 700, color: '#FFB800', borderTop: '2px solid rgba(255,184,0,0.2)' }}>
                      {totals.sessions}
                    </td>
                    <td style={{ ...numTd, borderTop: '2px solid rgba(255,184,0,0.2)', color: '#606088' }}>--</td>
                    <td style={{ ...numTd, fontWeight: 700, color: '#FFB800', borderTop: '2px solid rgba(255,184,0,0.2)' }}>
                      {fmt(totals.sessionTotal)}
                    </td>
                    <td style={{ ...numTd, fontWeight: 700, color: '#FFB800', borderTop: '2px solid rgba(255,184,0,0.2)' }}>
                      {fmt(totals.directorPay)}
                    </td>
                    <td style={{ ...numTd, fontWeight: 700, color: '#FFB800', borderTop: '2px solid rgba(255,184,0,0.2)' }}>
                      {fmt(totals.bonus)}
                    </td>
                    <td style={{ ...numTd, fontWeight: 700, color: '#FFB800', borderTop: '2px solid rgba(255,184,0,0.2)' }}>
                      {fmt(totals.tipTotal)}
                    </td>
                    <td style={{ ...numTd, fontWeight: 800, color: '#22C55E', borderTop: '2px solid rgba(255,184,0,0.2)', fontSize: 14 }}>
                      {fmt(totals.totalPay)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Grand Total Banner */}
          {entries && entries.length > 0 && (
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
            }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#A0A0C8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Grand Total Payroll:
              </span>
              <span style={{ fontSize: 22, fontWeight: 800, color: '#22C55E' }}>
                {fmt(totals.totalPay)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ─── Tips Section ────────────────────────────────────── */}
      {activePeriodId && (
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={cardEdge} />
          <div style={{
            padding: '16px 24px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>Tips</div>
            {canEdit && isOpen && (
              <button onClick={() => setShowTipModal(true)} style={btnPrimary}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Plus size={12} /> Add Tip
                </span>
              </button>
            )}
          </div>

          <div style={{ padding: '16px 24px' }}>
            {(!tips || tips.length === 0) ? (
              <p style={{ fontSize: 12, color: '#606088' }}>No tips logged for this period.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Student Name</th>
                    <th style={thRight}>Amount</th>
                    <th style={thStyle}>Teacher</th>
                    <th style={thStyle}>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {tips.map((tip) => {
                    const studentName = tip.student
                      ? `${tip.student.first_name} ${tip.student.last_name}`
                      : 'Unknown'
                    return (
                      <tr key={tip.id}>
                        <td style={tdStyle}>{studentName}</td>
                        <td style={numTd}>{fmt(tip.amount)}</td>
                        <td style={tdStyle}>
                          {tip.tip_attributions?.map((attr) => {
                            const teacher = activeTeachers.find((tt: any) => tt.id === attr.teacher_id) as any
                            return (
                              <span key={attr.id} style={{ marginRight: 12, fontSize: 11 }}>
                                {teacher ? `${teacher.first_name} ${teacher.last_name}` : 'Unknown'}: {fmt(attr.amount)}
                              </span>
                            )
                          })}
                        </td>
                        <td style={tdStyle}>{new Date(tip.created_at).toLocaleDateString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── Tip Modal ───────────────────────────────────────── */}
      {showTipModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...card, background: '#141228', width: 440, padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#E0E0F4', margin: 0 }}>Add Tip</h3>
              <button onClick={() => setShowTipModal(false)} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Student search */}
              <div>
                <label style={{ fontSize: 10, color: '#8080A8', display: 'block', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>Student</label>
                <select value={tipStudentId} onChange={(e) => setTipStudentId(e.target.value)} style={inputStyle}>
                  <option value="">Select student...</option>
                  {students?.map((s) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div>
                <label style={{ fontSize: 10, color: '#8080A8', display: 'block', marginBottom: 4, textTransform: 'uppercase', fontWeight: 700 }}>Amount ($)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={tipAmount}
                  onChange={(e) => setTipAmount(e.target.value)}
                  placeholder="0.00"
                  style={{ ...inputStyle, width: 140 }}
                />
              </div>

              {/* Attribution */}
              {tipStudentId && (
                <div>
                  <label style={{ fontSize: 10, color: '#8080A8', display: 'block', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700 }}>
                    Who gets this tip?
                  </label>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    <button onClick={() => setTipMode('single')} style={{ ...btnGhost, background: tipMode === 'single' ? 'rgba(255,184,0,0.12)' : undefined, color: tipMode === 'single' ? '#FFB800' : '#A0A0C8' }}>Assign to One</button>
                    <button onClick={() => setTipMode('split')} style={{ ...btnGhost, background: tipMode === 'split' ? 'rgba(255,184,0,0.12)' : undefined, color: tipMode === 'split' ? '#FFB800' : '#A0A0C8' }}>Split Evenly</button>
                    <button onClick={() => setTipMode('custom')} style={{ ...btnGhost, background: tipMode === 'custom' ? 'rgba(255,184,0,0.12)' : undefined, color: tipMode === 'custom' ? '#FFB800' : '#A0A0C8' }}>Custom</button>
                  </div>

                  {tipMode === 'single' && (
                    <select value={tipTeacherId} onChange={(e) => setTipTeacherId(e.target.value)} style={inputStyle}>
                      <option value="">Select teacher...</option>
                      {activeTeachers.map((t: any) => (
                        <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>
                      ))}
                    </select>
                  )}

                  {tipMode === 'split' && selectedStudentTeachers.length > 0 && (
                    <div style={{ fontSize: 12, color: '#C0C0E0' }}>
                      Splitting {fmt(parseFloat(tipAmount) || 0)} evenly among: {selectedStudentTeachers.map((t: any) => `${t.first_name} ${t.last_name}`).join(', ')}
                    </div>
                  )}

                  {tipMode === 'custom' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {activeTeachers.map((t: any) => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, color: '#C0C0E0', width: 140 }}>{t.first_name} {t.last_name}</span>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            value={tipCustomAmounts[t.id] ?? ''}
                            onChange={(e) => setTipCustomAmounts({ ...tipCustomAmounts, [t.id]: e.target.value })}
                            placeholder="0.00"
                            style={{ ...inputStyle, width: 100 }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                <button onClick={() => setShowTipModal(false)} style={btnGhost}>Cancel</button>
                <button onClick={handleCreateTip} style={btnPrimary} disabled={!tipStudentId || !tipAmount || createTip.isPending}>
                  {createTip.isPending ? 'Saving...' : 'Save Tip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Print Styles ────────────────────────────────────── */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: #fff !important; color: #000 !important; }
          .page { padding: 0 !important; margin: 0 !important; }
          table { color: #000 !important; }
          th { color: #333 !important; border-bottom: 2px solid #333 !important; }
          td { color: #000 !important; border-bottom: 1px solid #ccc !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>
    </div>
  )
}
