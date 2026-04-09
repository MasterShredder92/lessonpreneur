import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Plus, Lock, ScrollText, Pencil, CheckCircle } from 'lucide-react'
import { toast } from '../shared/Toast'
import AvailabilityEditModal from './AvailabilityEditModal'

interface ColDef { key: string; label: string; width: number; type?: string; options?: string[]; custom?: boolean }

const DEFAULT_COLUMNS: ColDef[] = [
  { key: 'email', label: 'Email', width: 200 },
  { key: 'phone', label: 'Phone', width: 140 },
  { key: 'role', label: 'Role', width: 120 },
  { key: 'primary_instruments', label: 'Primary Instruments', width: 180 },
  { key: 'secondary_instruments', label: 'Secondary Instruments', width: 180 },
  { key: 'style_genre_strengths', label: 'Style/Genre Strengths', width: 200 },
  { key: 'preferred_age_range', label: 'Preferred Age Range', width: 150 },
  { key: 'acceptable_age_range', label: 'Acceptable Age Range', width: 150 },
  { key: 'skill_levels_by_instrument', label: 'Skill Levels by Instrument', width: 250 },
  { key: 'lesson_style', label: 'Lesson Style', width: 200 },
  { key: 'personality', label: 'Personality', width: 200 },
  { key: 'teaching_strengths', label: 'Teaching Strengths', width: 250 },
  { key: 'musical_strengths_background', label: 'Musical Background', width: 250 },
  { key: 'best_first_lesson_fit', label: 'Best First Lesson Fit', width: 200 },
  { key: 'best_match_students', label: 'Best Match Students', width: 250 },
  { key: 'use_caution_internal_placement_notes', label: 'Placement Notes', width: 250 },
  { key: 'meet_and_greet_fit', label: 'Meet & Greet Fit', width: 120, type: 'select', options: ['Amazing', 'Yes', 'Very good', 'Maybe', 'No'] },
  { key: 'substitute_coverage', label: 'Substitute Coverage', width: 200 },
  { key: 'customer_facing_match_summary', label: 'Customer Summary', width: 300 },
  { key: 'internal_matching_tags', label: 'Internal Tags', width: 250 },
  { key: 'director_notes', label: 'Director Notes', width: 300 },
  { key: 'availability_summary', label: 'Availability', width: 250 },
  { key: 'rate_per_block', label: 'Pay Rate', width: 100 },
  { key: 'status_col', label: 'Status', width: 120, type: 'select', options: ['active', 'inactive', 'at_capacity'] },
  { key: 'needs_1099', label: '1099', width: 80 },
]

// Direct DB column keys (written/read directly on the teachers row)
const DIRECT_TEXT_COLUMNS = new Set([
  'primary_instruments', 'secondary_instruments', 'style_genre_strengths',
  'preferred_age_range', 'acceptable_age_range', 'skill_levels_by_instrument',
  'teaching_strengths', 'musical_strengths_background', 'best_first_lesson_fit',
  'best_match_students', 'use_caution_internal_placement_notes', 'meet_and_greet_fit',
  'substitute_coverage', 'customer_facing_match_summary', 'internal_matching_tags',
  'director_notes', 'personality', 'lesson_style',
])

// Fallback mapping: new DB column → old ai_context key (for migrating existing data on read)
const AI_CONTEXT_FALLBACK: Record<string, string> = {
  primary_instruments: 'primary_instruments',
  secondary_instruments: 'secondary_instruments',
  style_genre_strengths: 'style_genre',
  preferred_age_range: 'preferred_age',
  acceptable_age_range: 'acceptable_age',
  skill_levels_by_instrument: 'skill_levels',
  teaching_strengths: 'teaching_strengths',
  musical_strengths_background: 'musical_background',
  best_first_lesson_fit: 'best_first_lesson',
  best_match_students: 'best_match',
  use_caution_internal_placement_notes: 'use_caution',
  meet_and_greet_fit: 'meet_greet',
  substitute_coverage: 'sub_coverage',
  customer_facing_match_summary: 'customer_summary',
  internal_matching_tags: 'internal_tags',
  director_notes: 'director_notes',
}

interface Props { onClose: () => void }

export default function TeacherSpreadsheet({ onClose }: Props) {
  const { role, profile, tenantId } = useAuthContext()
  const { canDo } = usePermissions()
  const canDeleteRow = canDo('master_sheet.delete_row')
  const canAddColumn = canDo('master_sheet.add_column')
  const canDeleteColumn = canDo('master_sheet.delete_column')
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [editCell, setEditCell] = useState<{ id: string; key: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savedCell, setSavedCell] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [columns, setColumns] = useState<ColDef[]>(DEFAULT_COLUMNS)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: 'row' | 'col'; id: string; name: string } | null>(null)
  const [showAddRow, setShowAddRow] = useState(false)
  const [newRowFirst, setNewRowFirst] = useState('')
  const [newRowLast, setNewRowLast] = useState('')
  const [showAddCol, setShowAddCol] = useState(false)
  const [newColName, setNewColName] = useState('')
  const [availEditTeacher, setAvailEditTeacher] = useState<{ id: string; name: string } | null>(null)
  const editRef = useRef<HTMLTextAreaElement | HTMLSelectElement>(null)

  // Only owner can access
  if (role !== 'owner') {
    return createPortal(
      <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0A0918', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <Lock size={40} style={{ color: '#606088', marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#8080A8' }}>Access Restricted</p>
          <p style={{ fontSize: 12, color: '#606088', marginTop: 6 }}>Only the account owner can access the Master Editor.</p>
          <button onClick={onClose} style={{ marginTop: 16, padding: '8px 20px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#A0A0C8', cursor: 'pointer', fontSize: 12 }}>Go Back</button>
        </div>
      </div>,
      document.body
    )
  }

  // Log entry on open
  useEffect(() => {
    supabase.from('activity_log').insert({
      tenant_id: profile?.tenant_id,
      entity_type: 'master_editor',
      entity_id: null,
      action: 'open',
      description: `Master Editor opened by ${profile?.first_name ?? 'Unknown'}`,
      performed_by: profile?.id ?? null,
    }).then(() => {})
  }, [])

  // Audit log query
  const { data: auditLog } = useQuery({
    queryKey: ['master-editor-log'],
    enabled: showLog,
    queryFn: async () => {
      const { data } = await supabase.from('activity_log')
        .select('*')
        .eq('entity_type', 'master_editor')
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
  })

  const { data: teachers, isLoading } = useQuery({
    queryKey: ['teacher-spreadsheet'],
    queryFn: async () => {
      const { data } = await supabase.from('teachers').select('id, first_name, last_name, teacher_role, ai_context, personality, lesson_style, best_age_range, square_team_member_id, needs_1099, rate_per_block, pay_rate_per_half_hour, status, is_active, email, phone, primary_instruments, secondary_instruments, style_genre_strengths, preferred_age_range, acceptable_age_range, skill_levels_by_instrument, teaching_strengths, musical_strengths_background, best_first_lesson_fit, best_match_students, use_caution_internal_placement_notes, meet_and_greet_fit, substitute_coverage, customer_facing_match_summary, internal_matching_tags, director_notes').order('first_name').limit(500)
      // Sort: empty names (new rows) go to the end
      return (data ?? []).sort((a: any, b: any) => {
        const aEmpty = !a.first_name && !a.last_name
        const bEmpty = !b.first_name && !b.last_name
        if (aEmpty && !bEmpty) return 1
        if (!aEmpty && bEmpty) return -1
        return (a.first_name ?? '').localeCompare(b.first_name ?? '')
      })
    },
  })

  // Fetch availability data for the summary column
  const { data: availabilityMap } = useQuery({
    queryKey: ['teacher-spreadsheet-availability'],
    queryFn: async () => {
      const { data: avail } = await supabase.from('teacher_availability')
        .select('teacher_id, location_id, day_of_week, start_time, end_time, is_active')
        .eq('is_active', true)

      const { data: locs } = await supabase.from('locations').select('id, name')
      const locMap = new Map((locs ?? []).map((l: any) => [l.id, l.name?.replace(' Music Lessons', '') ?? 'Unknown']))

      const DAY_ABBR: Record<string, string> = {
        sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
        thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
      }

      // Group by teacher_id then location
      const byTeacher = new Map<string, Map<string, string[]>>()
      for (const row of (avail ?? [])) {
        if (!byTeacher.has(row.teacher_id)) byTeacher.set(row.teacher_id, new Map())
        const locDays = byTeacher.get(row.teacher_id)!
        const locName = locMap.get(row.location_id) ?? 'Unknown'
        if (!locDays.has(locName)) locDays.set(locName, [])
        locDays.get(locName)!.push(DAY_ABBR[row.day_of_week] ?? row.day_of_week)
      }

      // Build summary strings
      const result = new Map<string, string>()
      for (const [teacherId, locDays] of byTeacher) {
        const parts: string[] = []
        for (const [locName, days] of locDays) {
          // Condense consecutive days like Mon-Wed
          const sorted = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter(d => days.includes(d))
          parts.push(`${locName}: ${sorted.join(', ')}`)
        }
        result.set(teacherId, parts.join(' | '))
      }
      return result
    },
  })

  useEffect(() => {
    if (editRef.current) editRef.current.focus()
  }, [editCell])

  // Paste handler — tab-separated data flows across columns
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!editCell || !teachers) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      // If no tabs and no newlines, let default handle it
      if (!text.includes('\t') && !text.includes('\n')) return
      e.preventDefault()

      const hasTab = text.includes('\t')
      const col = columns.find(c => c.key === editCell.key)
      if (!col) return

      if (hasTab) {
        // Row paste — tab separated, flows left to right
        const values = text.split('\t').map(v => v.trim().replace(/\r?\n/g, ' '))
        const startColIdx = columns.findIndex(c => c.key === editCell.key)
        const teacher = teachers.find((t: any) => t.id === editCell.id)
        if (!teacher) return
        for (let i = 0; i < values.length; i++) {
          const colIdx = startColIdx + i
          if (colIdx >= columns.length) break
          const c = columns[colIdx]
          const update: any = {}
          if (DIRECT_TEXT_COLUMNS.has(c.key)) {
            update[c.key] = values[i]
          } else if (c.key === 'role') {
            update.teacher_role = values[i]
          } else if (c.key === 'rate_per_block') {
            update.rate_per_block = parseFloat(values[i]) || 0; update.pay_rate_per_half_hour = update.rate_per_block
          } else if (c.key === 'status_col') {
            update.status = values[i]; update.is_active = values[i] !== 'inactive'
          } else if (c.key === 'needs_1099') {
            update.needs_1099 = values[i].toLowerCase() === 'yes' || values[i] === 'true'
          } else if (c.key === 'email') {
            update.email = values[i]
          } else if (c.key === 'phone') {
            update.phone = values[i]
          }
          if (Object.keys(update).length === 0) continue
          const { error: pasteErr } = await supabase.from('teachers').update(update).eq('id', editCell.id).eq('tenant_id', tenantId!)
          if (pasteErr) { toast('Paste failed: ' + pasteErr.message, 'error'); break }
        }
      } else {
        // Column paste — newline separated, flows top to bottom
        const values = text.split(/\r?\n/).map(v => v.trim()).filter(Boolean)
        const startRowIdx = filtered.findIndex(t => t.id === editCell.id)
        for (let i = 0; i < values.length; i++) {
          const rowIdx = startRowIdx + i
          if (rowIdx >= filtered.length) break
          const teacher = filtered[rowIdx]
          const update: any = {}
          if (DIRECT_TEXT_COLUMNS.has(col.key)) {
            update[col.key] = values[i]
          } else if (col.key === 'role') {
            update.teacher_role = values[i]
          } else if (col.key === 'rate_per_block') {
            update.rate_per_block = parseFloat(values[i]) || 0; update.pay_rate_per_half_hour = update.rate_per_block
          } else if (col.key === 'status_col') {
            update.status = values[i]; update.is_active = values[i] !== 'inactive'
          } else if (col.key === 'needs_1099') {
            update.needs_1099 = values[i].toLowerCase() === 'yes' || values[i] === 'true'
          } else if (col.key === 'email') {
            update.email = values[i]
          } else if (col.key === 'phone') {
            update.phone = values[i]
          }
          if (Object.keys(update).length === 0) continue
          const { error: colPasteErr } = await supabase.from('teachers').update(update).eq('id', teacher.id).eq('tenant_id', tenantId!)
          if (colPasteErr) { toast('Paste failed: ' + colPasteErr.message, 'error'); break }
        }
      }
      setSavedCell(`${editCell.id}-paste`)
      setTimeout(() => setSavedCell(null), 1500)
      qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] }); qc.invalidateQueries({ queryKey: ['teachers'] }); qc.invalidateQueries({ queryKey: ['teacher'] })
      setEditCell(null)
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [editCell, teachers, columns])

  // Copy row handler
  const handleCopyRow = (teacher: any) => {
    const values = columns.map(col => getCellValue(teacher, col.key))
    navigator.clipboard.writeText(values.join('\t'))
    setSavedCell(`${teacher.id}-copied`)
    setTimeout(() => setSavedCell(null), 1500)
  }

  const getCellValue = (teacher: any, key: string): string => {
    const ai = teacher.ai_context ?? {}

    // Special-case columns
    if (key === 'email') return teacher.email ?? ''
    if (key === 'phone') return teacher.phone ?? ''
    if (key === 'role') return teacher.teacher_role ?? ''
    if (key === 'rate_per_block') return String(teacher.rate_per_block ?? teacher.pay_rate_per_half_hour ?? '')
    if (key === 'status_col') return teacher.status ?? (teacher.is_active ? 'active' : 'inactive')
    if (key === 'needs_1099') return teacher.needs_1099 ? 'Yes' : 'No'
    if (key === 'availability_summary') return availabilityMap?.get(teacher.id) ?? (ai.availability ?? '')

    // Direct text columns — read from DB column, fall back to ai_context for legacy data
    if (DIRECT_TEXT_COLUMNS.has(key)) {
      const dbVal = teacher[key]
      if (dbVal != null && dbVal !== '') return String(dbVal)
      // Fallback: check ai_context with old key name
      const fallbackKey = AI_CONTEXT_FALLBACK[key]
      if (fallbackKey) {
        const aiVal = ai[fallbackKey]
        if (Array.isArray(aiVal)) return aiVal.join(', ')
        return aiVal ?? ''
      }
      return ''
    }

    return ''
  }

  const handleSave = async (teacherId: string, key: string, value: string) => {
    const teacher = teachers?.find(t => t.id === teacherId)
    if (!teacher) return

    let updateResult: { error: any } = { error: null }

    // Build update payload based on column key
    if (key === 'first_name') {
      updateResult = await supabase.from('teachers').update({ first_name: value }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'last_name') {
      updateResult = await supabase.from('teachers').update({ last_name: value }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'email') {
      updateResult = await supabase.from('teachers').update({ email: value }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'phone') {
      updateResult = await supabase.from('teachers').update({ phone: value }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'role') {
      updateResult = await supabase.from('teachers').update({ teacher_role: value }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'rate_per_block') {
      const numVal = parseFloat(value) || 0
      updateResult = await supabase.from('teachers').update({ rate_per_block: numVal, pay_rate_per_half_hour: numVal }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'status_col') {
      updateResult = await supabase.from('teachers').update({ status: value, is_active: value !== 'inactive' }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (key === 'needs_1099') {
      const boolVal = value === 'Yes' || value === 'true'
      updateResult = await supabase.from('teachers').update({ needs_1099: boolVal }).eq('id', teacherId).eq('tenant_id', tenantId!)
    } else if (DIRECT_TEXT_COLUMNS.has(key)) {
      // All 16 new columns + personality/lesson_style write directly to their DB column
      updateResult = await supabase.from('teachers').update({ [key]: value }).eq('id', teacherId).eq('tenant_id', tenantId!)
    }

    if (updateResult.error) {
      toast('Failed to save: ' + updateResult.error.message, 'error')
      setEditCell(null)
      return
    }

    // Audit log the change
    const teacherName = `${teacher.first_name} ${teacher.last_name}`
    const colLabel = columns.find(c => c.key === key)?.label ?? key
    const oldValue = getCellValue(teacher, key)
    await supabase.from('activity_log').insert({
      tenant_id: profile?.tenant_id,
      entity_type: 'master_editor',
      entity_id: teacherId,
      action: 'edit_cell',
      description: `${profile?.first_name ?? 'Unknown'} changed "${colLabel}" for ${teacherName}: "${oldValue.substring(0, 50)}" → "${value.substring(0, 50)}"`,
      performed_by: profile?.id ?? null,
    }).then(() => {})

    setSavedCell(`${teacherId}-${key}`)
    setTimeout(() => setSavedCell(null), 1500)
    qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] }); qc.invalidateQueries({ queryKey: ['teachers'] }); qc.invalidateQueries({ queryKey: ['teacher'] })
    setEditCell(null)
  }

  const handleDeleteTeacher = async (id: string, name: string) => {
    const ok = confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)
    if (!ok) return
    await supabase.from('activity_log').insert({
      tenant_id: profile?.tenant_id,
      entity_type: 'master_editor',
      entity_id: id,
      action: 'delete_teacher',
      description: `${profile?.first_name ?? 'Unknown'} deleted teacher: ${name}`,
      performed_by: profile?.id ?? null,
    }).then(() => {})
    await supabase.from('teacher_locations').delete().eq('teacher_id', id)
    await supabase.from('teacher_availability').delete().eq('teacher_id', id)
    await supabase.from('teachers').delete().eq('id', id)
    qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] }); qc.invalidateQueries({ queryKey: ['teachers'] }); qc.invalidateQueries({ queryKey: ['teacher'] })
    qc.invalidateQueries({ queryKey: ['teachers'] })
  }

  const handleAddTeacher = async () => {
    if (!tenantId) { toast('No tenant context — please log in again', 'error'); return }
    const { data: newTeacher, error } = await supabase.from('teachers').insert({
      tenant_id: tenantId,
      first_name: '',
      last_name: '',
      is_active: true,
      status: 'active',
      instruments: [],
      teacher_role: 'Music Teacher',
      ai_context: {},
    }).select('id').single()
    if (error) { toast('Failed: ' + error.message, 'error'); return }
    if (!newTeacher) { toast('Insert failed — row was not created. Check permissions.', 'error'); return }
    toast('New row added — fill in the name and click ✓ to confirm', 'success')
    qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] })
    qc.invalidateQueries({ queryKey: ['teachers'] })
  }

  const handleConfirmNewRow = async (teacherId: string) => {
    const teacher = teachers?.find(t => t.id === teacherId)
    if (!teacher || (!teacher.first_name && !teacher.last_name)) {
      toast('Enter a first and last name before confirming', 'error')
      return
    }
    // Just invalidate to re-sort — the name is already saved via handleSave
    qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] })
    qc.invalidateQueries({ queryKey: ['teachers'] })
    toast('Teacher confirmed', 'success')
  }

  const handleAddColumn = () => {
    if (!newColName.trim()) return
    const key = 'custom_' + newColName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
    if (columns.find(c => c.key === key)) return
    setColumns([...columns, { key, label: newColName.trim(), width: 200, custom: true }])
    setNewColName('')
    setShowAddCol(false)
  }

  const handleDeleteColumn = (key: string) => {
    const col = columns.find(c => c.key === key)
    if (!col?.custom) { toast('Cannot delete built-in columns', 'warning'); return }
    setColumns(columns.filter(c => c.key !== key))
    setContextMenu(null)
    toast(`Column "${col.label}" removed`, 'success')
  }

  const handleContextMenu = (e: React.MouseEvent, type: 'row' | 'col', id: string, name: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, name })
  }

  const filtered = teachers?.filter(t => {
    if (!search) return true
    return `${t.first_name} ${t.last_name}`.toLowerCase().includes(search.toLowerCase())
  }) ?? []

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: '#0A0918', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Lock size={14} style={{ color: '#FFB800' }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>Master Editor</span>
          </div>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 5, background: 'rgba(255,184,0,0.12)', color: '#FFB800', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Owner Only</span>
          <span style={{ fontSize: 11, color: '#8080A8' }}>{filtered.length} teachers</span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 12, outline: 'none', width: 180 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setShowLog(!showLog)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: showLog ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.04)', border: `1px solid ${showLog ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.08)'}`, color: showLog ? '#FFB800' : '#8080A8', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><ScrollText size={13} /> Audit Log</button>
          <button onClick={handleAddTeacher} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 8, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Plus size={13} /> Add Row</button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer' }}><X size={20} /></button>
        </div>
      </div>

      {/* Audit Log Panel */}
      {showLog && (
        <div style={{ maxHeight: 200, overflowY: 'auto', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,184,0,0.02)', padding: '12px 24px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Activity Log</div>
          {auditLog && auditLog.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {auditLog.map((log: any) => (
                <div key={log.id} style={{ fontSize: 11, color: '#A0A0C8', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#606088', flexShrink: 0, width: 130 }}>{new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span>{log.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: '#606088' }}>No activity yet.</p>
          )}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Loading...</div>
        ) : (
          <>
          <table style={{ borderCollapse: 'collapse', minWidth: columns.reduce((s, c) => s + c.width, 200) }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, top: 0, zIndex: 3, width: 150, minWidth: 150, padding: '8px 10px', background: '#0D0B1A', borderBottom: '2px solid rgba(255,255,255,0.08)', borderRight: '2px solid rgba(255,255,255,0.08)', fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left' }}>
                  Teacher
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onContextMenu={(e) => handleContextMenu(e, 'col', col.key, col.label)}
                    style={{ position: 'sticky', top: 0, zIndex: 2, width: col.width, minWidth: col.width, padding: '8px 8px', background: '#0D0B1A', borderBottom: '2px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.04)', fontSize: 9, fontWeight: 700, color: col.custom ? '#FFB800' : '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left', cursor: 'context-menu' }}
                  >
                    {col.label}
                  </th>
                ))}
                {canAddColumn && (
                <th style={{ position: 'sticky', top: 0, zIndex: 2, width: showAddCol ? 180 : 40, minWidth: showAddCol ? 180 : 40, padding: '4px', background: '#0D0B1A', borderBottom: '2px solid rgba(255,255,255,0.08)' }}>
                  {showAddCol ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="Column name" autoFocus style={{ flex: 1, padding: '4px 6px', borderRadius: 4, border: '1px solid rgba(255,184,0,0.3)', background: 'rgba(255,184,0,0.06)', color: '#E0E0F4', fontSize: 10, outline: 'none' }} onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') setShowAddCol(false) }} />
                      <button onClick={handleAddColumn} style={{ padding: '3px 6px', borderRadius: 4, background: '#FFB800', border: 'none', color: '#111', fontSize: 9, fontWeight: 700, cursor: 'pointer' }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => setShowAddCol(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606088', width: '100%', textAlign: 'center' }} title="Add column"><Plus size={14} /></button>
                  )}
                </th>
                )}
                <th style={{ position: 'sticky', top: 0, zIndex: 2, width: 40, minWidth: 40, padding: '8px 4px', background: '#0D0B1A', borderBottom: '2px solid rgba(255,255,255,0.08)' }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t, ri) => (
                <tr key={t.id} style={{ background: ri % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                  <td
                    onContextMenu={(e) => handleContextMenu(e, 'row', t.id, `${t.first_name} ${t.last_name}`)}
                    style={{ position: 'sticky', left: 0, zIndex: 1, padding: '6px 10px', background: ri % 2 === 0 ? '#100E1E' : '#0D0B1A', borderRight: '2px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11, fontWeight: 700, color: '#E0E0F4', whiteSpace: 'nowrap', cursor: 'pointer' }}
                  >
                    {editCell?.id === t.id && editCell?.key === 'first_name' ? (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleSave(t.id, 'first_name', editValue)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSave(t.id, 'first_name', editValue); if (e.key === 'Escape') setEditCell(null) }}
                          placeholder="First"
                          style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: '2px solid #FFB800', background: 'rgba(255,184,0,0.08)', color: '#E0E0F4', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}
                        />
                      </span>
                    ) : editCell?.id === t.id && editCell?.key === 'last_name' ? (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <input
                          autoFocus
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onBlur={() => handleSave(t.id, 'last_name', editValue)}
                          onKeyDown={e => { if (e.key === 'Enter') handleSave(t.id, 'last_name', editValue); if (e.key === 'Escape') setEditCell(null) }}
                          placeholder="Last"
                          style={{ width: 80, padding: '3px 6px', borderRadius: 4, border: '2px solid #FFB800', background: 'rgba(255,184,0,0.08)', color: '#E0E0F4', fontSize: 11, outline: 'none', fontFamily: 'inherit' }}
                        />
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 4 }}>
                        <span
                          onClick={() => { setEditCell({ id: t.id, key: 'first_name' }); setEditValue(t.first_name ?? '') }}
                          style={{ cursor: 'pointer', minWidth: 30 }}
                          title="Click to edit first name"
                        >{t.first_name || '—'}</span>
                        <span
                          onClick={() => { setEditCell({ id: t.id, key: 'last_name' }); setEditValue(t.last_name ?? '') }}
                          style={{ cursor: 'pointer', minWidth: 30 }}
                          title="Click to edit last name"
                        >{t.last_name || '—'}</span>
                      </span>
                    )}
                  </td>
                  {columns.map((col) => {
                    const cellId = `${t.id}-${col.key}`
                    const isEditing = editCell?.id === t.id && editCell?.key === col.key
                    const value = getCellValue(t, col.key)
                    const isSaved = savedCell === cellId

                    if (isEditing) {
                      if (col.type === 'select') {
                        return (
                          <td key={col.key} style={{ padding: 2, borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                            <select
                              ref={editRef as any}
                              value={editValue}
                              onChange={e => { setEditValue(e.target.value); handleSave(t.id, col.key, e.target.value) }}
                              onBlur={() => setEditCell(null)}
                              style={{ width: '100%', padding: '6px 8px', background: 'rgba(255,184,0,0.08)', border: '2px solid #FFB800', borderRadius: 4, color: '#E0E0F4', fontSize: 11, outline: 'none' }}
                            >
                              {col.options?.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                        )
                      }
                      return (
                        <td key={col.key} style={{ padding: 2, borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                          <textarea
                            ref={editRef as any}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => handleSave(t.id, col.key, editValue)}
                            onKeyDown={e => { if (e.key === 'Escape') setEditCell(null); if (e.key === 'Tab') { e.preventDefault(); handleSave(t.id, col.key, editValue) } }}
                            style={{ width: '100%', minHeight: 60, padding: '6px 8px', background: 'rgba(255,184,0,0.08)', border: '2px solid #FFB800', borderRadius: 4, color: '#E0E0F4', fontSize: 11, outline: 'none', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                          />
                        </td>
                      )
                    }

                    // Availability cell — read-only with edit icon
                    if (col.key === 'availability_summary') {
                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)',
                            fontSize: 11, color: value ? '#C0C0E0' : '#363656', maxWidth: col.width, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative',
                            background: isSaved ? 'rgba(34,197,94,0.08)' : undefined,
                          }}
                          title={value || 'No availability set'}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{value || '—'}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setAvailEditTeacher({ id: t.id, name: `${t.first_name} ${t.last_name}` }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8080A8', padding: 2, flexShrink: 0 }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#38BDF8')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#8080A8')}
                              title="Edit availability"
                            >
                              <Pencil size={11} />
                            </button>
                          </span>
                          {isSaved && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 8, color: '#22C55E', fontWeight: 700 }}>Saved</span>}
                        </td>
                      )
                    }

                    return (
                      <td
                        key={col.key}
                        onClick={() => { setEditCell({ id: t.id, key: col.key }); setEditValue(value) }}
                        style={{
                          padding: '6px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)', borderRight: '1px solid rgba(255,255,255,0.04)',
                          fontSize: 11, color: value ? '#C0C0E0' : '#363656', cursor: 'pointer', maxWidth: col.width, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative',
                          background: isSaved ? 'rgba(34,197,94,0.08)' : undefined,
                        }}
                        title={value || 'Click to edit'}
                      >
                        {value || '—'}
                        {isSaved && <span style={{ position: 'absolute', top: 2, right: 4, fontSize: 8, color: '#22C55E', fontWeight: 700 }}>Saved</span>}
                      </td>
                    )
                  })}
                  <td style={{ padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.04)' }} />
                  <td style={{ padding: '4px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center', display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'center' }}>
                    {/* Confirm button for new (empty name) rows */}
                    {(!t.first_name && !t.last_name) && (
                      <button
                        onClick={() => handleConfirmNewRow(t.id)}
                        style={{ background: 'none', border: 'none', color: '#22C55E', cursor: 'pointer', padding: 4 }}
                        title="Confirm new teacher"
                      >
                        <CheckCircle size={14} />
                      </button>
                    )}
                    {canDeleteRow && (
                      <button
                        onClick={() => handleDeleteTeacher(t.id, `${t.first_name ?? ''} ${t.last_name ?? ''}`.trim() || 'New Row')}
                        style={{ background: 'none', border: 'none', color: '#363656', cursor: 'pointer', padding: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#363656')}
                        title="Delete teacher"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Add Row button */}
          <button onClick={handleAddTeacher} style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 14px', padding: '8px 16px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px dashed rgba(34,197,94,0.2)', color: '#22C55E', fontSize: 11, fontWeight: 600, cursor: 'pointer', width: 'fit-content' }}>
            <Plus size={13} /> Add Row
          </button>
          </>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }} onClick={() => setContextMenu(null)} />
          <div style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y, zIndex: 10001, background: '#1A1830', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: 4, minWidth: 160 }}>
            {contextMenu.type === 'row' ? (
              <>
                <button
                  onClick={() => { const t = teachers?.find(x => x.id === contextMenu.id); if (t) handleCopyRow(t); setContextMenu(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 6, background: 'none', border: 'none', color: '#C0C0E0', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  Copy Row
                </button>
                <button
                  onClick={() => { handleDeleteTeacher(contextMenu.id, contextMenu.name); setContextMenu(null) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 6, background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  <Trash2 size={13} /> Delete "{contextMenu.name}"
                </button>
              </>
            ) : (
              <>
                {columns.find(c => c.key === contextMenu.id)?.custom ? (
                  (canDeleteColumn || role === 'owner') ? (
                    <button
                      onClick={() => { handleDeleteColumn(contextMenu.id); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 6, background: 'none', border: 'none', color: '#EF4444', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      <Trash2 size={13} /> Delete Column "{contextMenu.name}"
                    </button>
                  ) : (
                    <button
                      onClick={() => { toast('Deletion request submitted', 'info'); setContextMenu(null) }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 6, background: 'none', border: 'none', color: '#FFB800', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,184,0,0.06)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                    >
                      Request Deletion "{contextMenu.name}"
                    </button>
                  )
                ) : (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: '#606088' }}>Built-in column — cannot delete</div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Availability Edit Modal */}
      {availEditTeacher && profile?.tenant_id && (
        <AvailabilityEditModal
          teacherId={availEditTeacher.id}
          teacherName={availEditTeacher.name}
          tenantId={profile.tenant_id}
          onClose={() => setAvailEditTeacher(null)}
        />
      )}
    </div>,
    document.body
  )
}
