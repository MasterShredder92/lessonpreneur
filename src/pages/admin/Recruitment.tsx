import { useState } from 'react'
import { useAuthContext } from '../../app/AuthContext'
import { useProspects, useCreateProspect, useUpdateProspectStatus, useDeleteProspect, PIPELINE_STAGES, type Prospect } from '../../hooks/useRecruitment'
import { useLocations } from '../../hooks/useLocations'
import { toast } from '../../components/shared/Toast'
import MusicLoader from '../../components/shared/MusicLoader'
import { Plus, Trash2, ChevronRight } from 'lucide-react'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

export default function Recruitment() {
  const { role } = useAuthContext()
  const { data: prospects, isLoading } = useProspects()
  const { data: locations } = useLocations()
  const createProspect = useCreateProspect()
  const updateStatus = useUpdateProspectStatus()
  const deleteProspect = useDeleteProspect()
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ first_name: '', last_name: '', email: '', phone: '', instruments: '', source: '', location_id: '', notes: '' })
  const [stageFilter, setStageFilter] = useState('')

  if (role !== 'owner' && role !== 'admin') {
    return <div className="page" style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Access restricted.</div>
  }

  const handleAdd = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) { toast('Name is required', 'error'); return }
    try {
      await createProspect.mutateAsync({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        instruments: form.instruments ? form.instruments.split(',').map(i => i.trim().toLowerCase()) : undefined,
        source: form.source.trim() || undefined,
        location_id: form.location_id || undefined,
        notes: form.notes.trim() || undefined,
      })
      toast('Prospect added', 'success')
      setShowAdd(false)
      setForm({ first_name: '', last_name: '', email: '', phone: '', instruments: '', source: '', location_id: '', notes: '' })
    } catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const handleStatusChange = async (id: string, status: string) => {
    try { await updateStatus.mutateAsync({ id, status }); toast('Status updated', 'success') }
    catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this prospect?')) return
    try { await deleteProspect.mutateAsync(id); toast('Deleted', 'success') }
    catch (err: any) { toast(err.message ?? 'Failed', 'error') }
  }

  // Stage counts
  const stageCounts = new Map<string, number>()
  prospects?.forEach(p => stageCounts.set(p.status, (stageCounts.get(p.status) ?? 0) + 1))

  const filtered = stageFilter ? (prospects ?? []).filter(p => p.status === stageFilter) : (prospects ?? [])
  const activeStages = PIPELINE_STAGES.filter(s => !['rejected', 'withdrawn'].includes(s.value))

  return (
    <IssueContextProvider page="Backstage — Recruitment">
    <div className="page">
      <div className="page-header">
        <h1>Teacher Recruitment</h1>
        <button onClick={() => setShowAdd(!showAdd)} style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: '6px 16px', borderRadius: 8,
          fontSize: 13, fontWeight: 700, cursor: 'pointer', marginLeft: 'auto',
          background: '#22C55E', color: '#000', border: 'none',
        }}>
          <Plus size={14} /> Add Prospect
        </button>
        <ReportIssueButton />
      </div>

      {/* Pipeline overview */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setStageFilter('')} style={{
          padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
          background: !stageFilter ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
          color: !stageFilter ? '#E8488A' : '#8080A8',
          border: `1px solid ${!stageFilter ? 'rgba(212,34,106,0.2)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          All ({prospects?.length ?? 0})
        </button>
        {PIPELINE_STAGES.map(stage => {
          const count = stageCounts.get(stage.value) ?? 0
          if (count === 0 && !['new', 'contacted', 'screening'].includes(stage.value)) return null
          const isActive = stageFilter === stage.value
          return (
            <button key={stage.value} onClick={() => setStageFilter(isActive ? '' : stage.value)} style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              background: isActive ? `${stage.color}20` : 'rgba(255,255,255,0.03)',
              color: isActive ? stage.color : '#8080A8',
              border: `1px solid ${isActive ? `${stage.color}40` : 'rgba(255,255,255,0.06)'}`,
            }}>
              {stage.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ padding: 16, borderRadius: 12, marginBottom: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} placeholder="First Name *" className="filter-select" style={{ fontSize: 12 }} />
            <input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} placeholder="Last Name *" className="filter-select" style={{ fontSize: 12 }} />
            <input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Email" className="filter-select" style={{ fontSize: 12 }} />
            <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="filter-select" style={{ fontSize: 12 }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            <input value={form.instruments} onChange={e => setForm({ ...form, instruments: e.target.value })} placeholder="Instruments (comma-sep)" className="filter-select" style={{ fontSize: 12 }} />
            <input value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} placeholder="Source (Indeed, referral...)" className="filter-select" style={{ fontSize: 12 }} />
            <select value={form.location_id} onChange={e => setForm({ ...form, location_id: e.target.value })} className="filter-select" style={{ fontSize: 12 }}>
              <option value="">Any Location</option>
              {locations?.filter((l: any) => l.is_active).map((l: any) => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="filter-select" style={{ fontSize: 12, flex: 1 }} />
            <button onClick={() => setShowAdd(false)} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, background: 'rgba(255,255,255,0.04)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}>Cancel</button>
            <button onClick={handleAdd} disabled={createProspect.isPending} style={{ padding: '6px 18px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: '#22C55E', color: '#000', border: 'none', cursor: 'pointer' }}>
              {createProspect.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Prospect list */}
      {isLoading ? <MusicLoader /> : filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#606088' }}>No prospects{stageFilter ? ' in this stage' : ''}. Click "Add Prospect" to get started.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.map(p => {
            const stage = PIPELINE_STAGES.find(s => s.value === p.status) ?? PIPELINE_STAGES[0]
            const nextStage = activeStages[activeStages.indexOf(stage) + 1]
            return (
              <div key={p.id} style={{
                padding: '12px 16px', borderRadius: 10,
                background: 'rgba(255,255,255,0.02)', border: `1px solid rgba(255,255,255,0.06)`,
                borderLeft: `3px solid ${stage.color}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{p.first_name} {p.last_name}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: `${stage.color}18`, color: stage.color }}>{stage.label}</span>
                    {p.instruments.length > 0 && p.instruments.map(i => (
                      <span key={i} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: '#A0A0C8' }}>
                        {i.charAt(0).toUpperCase() + i.slice(1)}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2, display: 'flex', gap: 12 }}>
                    {p.email && <span>{p.email}</span>}
                    {p.phone && <span>{p.phone}</span>}
                    {p.location_name && <span>{p.location_name}</span>}
                    {p.source && <span>via {p.source}</span>}
                  </div>
                  {p.notes && <div style={{ fontSize: 11, color: '#606088', marginTop: 3, fontStyle: 'italic' }}>{p.notes}</div>}
                </div>

                {/* Quick actions */}
                {nextStage && (
                  <button onClick={() => handleStatusChange(p.id, nextStage.value)} style={{
                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', borderRadius: 6,
                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    background: `${nextStage.color}15`, color: nextStage.color,
                    border: `1px solid ${nextStage.color}30`,
                  }}>
                    {nextStage.label} <ChevronRight size={10} />
                  </button>
                )}
                {p.status !== 'rejected' && p.status !== 'hired' && (
                  <button onClick={() => handleStatusChange(p.id, 'rejected')} style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.06)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.15)',
                  }}>Reject</button>
                )}
                <button onClick={() => handleDelete(p.id)} style={{ background: 'none', border: 'none', color: '#363656', cursor: 'pointer', padding: 4 }}
                  onMouseEnter={e => e.currentTarget.style.color = '#EF4444'} onMouseLeave={e => e.currentTarget.style.color = '#363656'}>
                  <Trash2 size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}
