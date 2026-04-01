import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useUpdateTeacher } from '../../hooks/useTeachers'
import { useLocations } from '../../hooks/useLocations'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'

import { CORE_INSTRUMENTS, OTHER_INSTRUMENTS, INSTRUMENT_PILL_STYLE } from '../../lib/constants'

const ROLE_OPTIONS = ['Music Teacher', 'Voice Teacher', 'Studio Director']
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: '#22C55E' },
  { value: 'inactive', label: 'Inactive', color: '#EF4444' },
  { value: 'at_capacity', label: 'At Capacity', color: '#FFB800' },
]

interface Props {
  teacher?: any
  onClose: () => void
}

export default function TeacherFormModal({ teacher, onClose }: Props) {
  const { tenantId } = useAuthContext()
  const qc = useQueryClient()
  const updateTeacher = useUpdateTeacher()
  const { data: locations } = useLocations()

  const [form, setForm] = useState({
    first_name: teacher?.first_name ?? teacher?.profile?.first_name ?? '',
    last_name: teacher?.last_name ?? teacher?.profile?.last_name ?? '',
    email: teacher?.email ?? teacher?.profile?.email ?? '',
    phone: teacher?.phone ?? teacher?.profile?.phone ?? '',
    teacher_role: teacher?.teacher_role ?? 'Music Teacher',
    status: teacher?.status ?? 'active',
    instruments: teacher?.instruments ?? [] as string[],
    bio: teacher?.bio ?? '',
    pay_rate_per_half_hour: teacher?.pay_rate_per_half_hour ?? teacher?.rate_per_block ?? 15,
    hire_date: teacher?.hire_date ?? '',
    personality: teacher?.personality ?? teacher?.ai_context?.personality ?? '',
    lesson_style: teacher?.lesson_style ?? teacher?.ai_context?.lesson_style ?? '',
    best_age_range: teacher?.best_age_range ?? teacher?.ai_context?.preferred_age ?? '',
  })

  // Location toggles — get current assignments from teacher_locations
  const [locationIds, setLocationIds] = useState<string[]>(() => {
    return teacher?.location_ids ?? []
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const toggleInstrument = (inst: string) => {
    setForm(f => ({
      ...f,
      instruments: f.instruments.includes(inst)
        ? f.instruments.filter((i: string) => i !== inst)
        : [...f.instruments, inst],
    }))
  }

  const toggleLocation = (locId: string) => {
    setLocationIds(ids =>
      ids.includes(locId) ? ids.filter(id => id !== locId) : [...ids, locId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.first_name.trim() || !form.last_name.trim()) { setError('Name is required.'); return }

    setSaving(true)
    try {
      if (teacher) {
        // Update teacher record directly
        const { error: updateErr } = await supabase.from('teachers').update({
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          teacher_role: form.teacher_role,
          status: form.status,
          instruments: form.instruments,
          bio: form.bio.trim() || null,
          pay_rate_per_half_hour: form.pay_rate_per_half_hour,
          rate_per_block: form.pay_rate_per_half_hour, // Keep in sync
          hire_date: form.hire_date || null,
          personality: form.personality.trim() || null,
          lesson_style: form.lesson_style.trim() || null,
          best_age_range: form.best_age_range.trim() || null,
          is_active: form.status === 'active' || form.status === 'at_capacity',
        }).eq('id', teacher.id)
        if (updateErr) throw updateErr

        // Update profile if it exists
        if (teacher.profile_id) {
          await supabase.from('profiles').update({
            first_name: form.first_name.trim(),
            last_name: form.last_name.trim(),
          }).eq('id', teacher.profile_id).then(() => {}) // ignore if no profile
        }

        // Sync teacher_locations
        await supabase.from('teacher_locations').delete().eq('teacher_id', teacher.id)
        if (locationIds.length > 0) {
          const { error: locErr } = await supabase.from('teacher_locations').insert(
            locationIds.map(lid => ({ teacher_id: teacher.id, location_id: lid }))
          )
          if (locErr) throw locErr
        }
      } else {
        // Create new teacher
        const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
        if (!tenant) throw new Error('Could not find tenant')

        const { data: newTeacher, error: insertErr } = await supabase.from('teachers').insert({
          tenant_id: tenant.id,
          first_name: form.first_name.trim(),
          last_name: form.last_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          teacher_role: form.teacher_role,
          status: form.status,
          instruments: form.instruments,
          bio: form.bio.trim() || null,
          pay_rate_per_half_hour: form.pay_rate_per_half_hour,
          rate_per_block: form.pay_rate_per_half_hour,
          hire_date: form.hire_date || null,
          personality: form.personality.trim() || null,
          lesson_style: form.lesson_style.trim() || null,
          best_age_range: form.best_age_range.trim() || null,
          is_active: form.status === 'active' || form.status === 'at_capacity',
          ai_context: {},
        }).select().single()
        if (insertErr) throw insertErr

        // Assign locations
        if (locationIds.length > 0 && newTeacher) {
          const { error: locErr } = await supabase.from('teacher_locations').insert(
            locationIds.map(lid => ({ teacher_id: newTeacher.id, location_id: lid }))
          )
          if (locErr) throw locErr
        }
      }

      qc.invalidateQueries({ queryKey: ['teacher'] })
      qc.invalidateQueries({ queryKey: ['teachers'] })
      qc.invalidateQueries({ queryKey: ['teacher-spreadsheet'] })
      qc.invalidateQueries({ queryKey: ['teacher-locations'] })
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save.')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = { fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.08em', display: 'block', marginBottom: 6 }
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: '18px 22px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>{teacher ? 'Edit Teacher' : 'Add Teacher'}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '18px 22px', overflowY: 'auto', flex: 1 }}>
          {/* Name */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>First Name *</label>
              <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Last Name *</label>
              <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Contact */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Role + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Role</label>
              <select value={form.teacher_role} onChange={e => setForm({ ...form, teacher_role: e.target.value })} style={{ ...inputStyle, cursor: 'pointer' }}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setForm({ ...form, status: s.value })}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${form.status === s.value ? s.color : 'rgba(255,255,255,0.08)'}`,
                      background: form.status === s.value ? `${s.color}20` : 'rgba(255,255,255,0.03)',
                      color: form.status === s.value ? s.color : '#8080A8',
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Instruments — Core Four first, then others, uniform pills */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Instruments</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {CORE_INSTRUMENTS.map(inst => {
                const active = form.instruments.includes(inst)
                return (
                  <button key={inst} type="button" onClick={() => toggleInstrument(inst)} style={{
                    ...INSTRUMENT_PILL_STYLE,
                    border: `1px solid ${active ? '#E8488A' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(232,72,138,0.12)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#E8488A' : '#8080A8',
                  }}>{inst}</button>
                )
              })}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {OTHER_INSTRUMENTS.map(inst => {
                const active = form.instruments.includes(inst)
                return (
                  <button key={inst} type="button" onClick={() => toggleInstrument(inst)} style={{
                    ...INSTRUMENT_PILL_STYLE,
                    border: `1px solid ${active ? '#E8488A' : 'rgba(255,255,255,0.08)'}`,
                    background: active ? 'rgba(232,72,138,0.12)' : 'rgba(255,255,255,0.03)',
                    color: active ? '#E8488A' : '#8080A8',
                  }}>{inst}</button>
                )
              })}
            </div>
          </div>

          {/* Locations — pill toggles */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Locations</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {locations?.filter((l: any) => l.is_active).map((loc: any) => {
                const active = locationIds.includes(loc.id)
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => toggleLocation(loc.id)}
                    style={{
                      flex: 1, padding: '8px 4px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      border: `1px solid ${active ? '#FF5500' : 'rgba(255,255,255,0.08)'}`,
                      background: active ? 'rgba(255,85,0,0.12)' : 'rgba(255,255,255,0.03)',
                      color: active ? '#FF5500' : '#606088',
                    }}
                  >
                    {loc.name.replace(' Music Lessons', '')}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Pay + Hire Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Pay Rate ($/30 min)</label>
              <input type="number" step="0.50" value={form.pay_rate_per_half_hour} onChange={e => setForm({ ...form, pay_rate_per_half_hour: parseFloat(e.target.value) || 15 })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Hire Date</label>
              <input type="date" value={form.hire_date} onChange={e => setForm({ ...form, hire_date: e.target.value })} style={inputStyle} />
            </div>
          </div>

          {/* Bio */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Bio</label>
            <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* Teaching Profile Fields */}
          <div style={{ paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.04)', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 10 }}>Teaching Profile</div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Personality</label>
              <input value={form.personality} onChange={e => setForm({ ...form, personality: e.target.value })} placeholder="e.g., Upbeat, Patient, Energetic" style={inputStyle} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>Lesson Style</label>
              <input value={form.lesson_style} onChange={e => setForm({ ...form, lesson_style: e.target.value })} placeholder="e.g., Theory-based, Song-focused, Fun" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Best Age Range</label>
              <input value={form.best_age_range} onChange={e => setForm({ ...form, best_age_range: e.target.value })} placeholder="e.g., All ages, Age 10+" style={inputStyle} />
            </div>
          </div>

          {error && <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, fontSize: 12, color: '#EF4444', marginBottom: 12 }}>{error}</div>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8', cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px 16px', borderRadius: 10, background: 'linear-gradient(135deg, #D4226A, #FF5500)', border: 'none', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 13, opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving...' : teacher ? 'Save Changes' : 'Add Teacher'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
