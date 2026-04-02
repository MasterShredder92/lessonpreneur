import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations, useCreateLocation, useUpdateLocation } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useTeacherLocations, useToggleTeacherLocation, useToggleSubAvailable } from '../../hooks/useTeacherLocations'
import { supabase } from '../../lib/supabase'
import RoomsManager from '../../components/rooms/RoomsManager'
import DataGrid from '../../components/shared/DataGrid'
import { Upload, Check, ChevronDown, ChevronUp, Clock, Video } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import type { Location } from '../../lib/types'
import { useTenantBilling, useCreateCheckout, useCustomerPortal } from '../../hooks/useTenantBilling'
import { useStripeConnectStatus, useStripeConnectOnboard } from '../../hooks/useStripeConnect'
import { getTierByKey, TRIAL_DAYS } from '../../lib/pricing'

interface LocationFormData {
  name: string; address: string; city: string; state: string; zip: string
  phone: string; email: string; website: string; google_review_url: string
}

const emptyForm: LocationFormData = {
  name: '', address: '', city: '', state: 'NE', zip: '',
  phone: '', email: '', website: '', google_review_url: '',
}

type Tab = 'general' | 'locations' | 'rooms' | 'teacher-locations' | 'master-control' | 'permissions' | 'branding' | 'billing' | 'payments' | 'integrations'

export default function Settings() {
  const { role, tenantId } = useAuthContext()
  const isOwner = role === 'owner'
  const [tab, setTab] = useState<Tab>('locations')

  return (
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-tabs">
        <button className={`settings-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>General</button>
        <button className={`settings-tab ${tab === 'locations' ? 'active' : ''}`} onClick={() => setTab('locations')}>Locations</button>
        <button className={`settings-tab ${tab === 'rooms' ? 'active' : ''}`} onClick={() => setTab('rooms')}>Rooms</button>
        <button className={`settings-tab ${tab === 'teacher-locations' ? 'active' : ''}`} onClick={() => setTab('teacher-locations')}>Teacher Locations</button>
        {isOwner && (
          <button className={`settings-tab ${tab === 'master-control' ? 'active' : ''}`} onClick={() => setTab('master-control')}>Master Control</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'permissions' ? 'active' : ''}`} onClick={() => setTab('permissions')}>Permissions</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'branding' ? 'active' : ''}`} onClick={() => setTab('branding')}>Branding</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'billing' ? 'active' : ''}`} onClick={() => setTab('billing')}>Billing</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>Payments</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'integrations' ? 'active' : ''}`} onClick={() => setTab('integrations')}>Integrations</button>
        )}
      </div>

      {tab === 'general' && <GeneralTab tenantId={tenantId} />}
      {tab === 'locations' && <LocationsTab isOwner={isOwner} tenantId={tenantId} />}
      {tab === 'rooms' && <RoomsManager />}
      {tab === 'teacher-locations' && <TeacherLocationsTab />}
      {tab === 'master-control' && isOwner && <MasterControlTab />}
      {tab === 'permissions' && isOwner && <PermissionsTab tenantId={tenantId} />}
      {tab === 'branding' && isOwner && <BrandingTab tenantId={tenantId} />}
      {tab === 'billing' && isOwner && <BillingSettingsTab />}
      {tab === 'payments' && isOwner && <PaymentsTab />}
      {tab === 'integrations' && isOwner && <IntegrationsTab tenantId={tenantId} />}
    </div>
  )
}

type MasterSubTab = 'teachers' | 'students' | 'leads' | 'schedule'

function MasterControlTab() {
  const [subTab, setSubTab] = useState<MasterSubTab>('teachers')
  const [showGrid, setShowGrid] = useState(false)

  const gridConfigs: Record<MasterSubTab, {
    title: string; table: string; columns: any[]; query?: string; orderBy?: string;
    nameField?: string; nameRenderer?: (row: any) => string
  }> = {
    teachers: {
      title: 'Master Editor — Teachers',
      table: 'teachers',
      query: 'id, first_name, last_name, teacher_role, status, instruments, pay_rate_per_half_hour, hire_date, ai_context',
      columns: [
        { key: 'first_name', label: 'First Name', width: 120 },
        { key: 'last_name', label: 'Last Name', width: 120 },
        { key: 'teacher_role', label: 'Role', width: 140 },
        { key: 'status', label: 'Status', width: 100, type: 'select' as const, options: ['active', 'inactive'] },
        { key: 'instruments', label: 'Instruments', width: 200 },
        { key: 'pay_rate_per_half_hour', label: 'Pay Rate (30min)', width: 130 },
        { key: 'hire_date', label: 'Hire Date', width: 120 },
      ],
      nameRenderer: (row: any) => `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      orderBy: 'first_name',
    },
    students: {
      title: 'Master Editor — Students',
      table: 'students',
      columns: [
        { key: 'first_name', label: 'First Name', width: 120 },
        { key: 'last_name', label: 'Last Name', width: 120 },
        { key: 'status', label: 'Status', width: 100, type: 'select' as const, options: ['active', 'former', 'inactive'] },
        { key: 'instrument', label: 'Instrument', width: 130 },
        { key: 'location_id', label: 'Location ID', width: 140 },
        { key: 'teacher_id', label: 'Teacher ID', width: 140 },
        { key: 'blocks_per_week', label: 'Blocks/Week', width: 110 },
        { key: 'rate_per_session', label: 'Rate/Session', width: 120 },
        { key: 'start_date', label: 'Start Date', width: 120 },
        { key: 'notes', label: 'Notes', width: 250 },
      ],
      nameRenderer: (row: any) => `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      orderBy: 'first_name',
    },
    leads: {
      title: 'Master Editor — Leads',
      table: 'leads',
      columns: [
        { key: 'student_name', label: 'Student Name', width: 150 },
        { key: 'parent_name', label: 'Parent Name', width: 150 },
        { key: 'stage', label: 'Stage', width: 110, type: 'select' as const, options: ['inquiry', 'contacted', 'scheduled', 'enrolled', 'lost'] },
        { key: 'source', label: 'Source', width: 120 },
        { key: 'instrument', label: 'Instrument', width: 130 },
        { key: 'preferred_days', label: 'Preferred Days', width: 150 },
        { key: 'notes', label: 'Notes', width: 250 },
      ],
      nameField: 'student_name',
      nameRenderer: (row: any) => row.student_name || row.parent_name || 'Unknown',
      orderBy: 'created_at',
    },
    schedule: {
      title: 'Master Editor — Schedule',
      table: 'schedule_blocks',
      columns: [
        { key: 'block_date', label: 'Date', width: 120 },
        { key: 'start_time', label: 'Start Time', width: 110 },
        { key: 'end_time', label: 'End Time', width: 110 },
        { key: 'status', label: 'Status', width: 110, type: 'select' as const, options: ['scheduled', 'completed', 'cancelled', 'no_show'] },
        { key: 'block_type', label: 'Type', width: 110, type: 'select' as const, options: ['lesson', 'makeup', 'trial', 'group', 'other'] },
        { key: 'teacher_id', label: 'Teacher ID', width: 140 },
        { key: 'student_id', label: 'Student ID', width: 140 },
        { key: 'notes', label: 'Notes', width: 250 },
      ],
      nameRenderer: (row: any) => `${row.block_date ?? ''} ${row.start_time ?? ''}`.trim(),
      nameField: 'block_date',
      orderBy: 'block_date',
    },
  }

  const config = gridConfigs[subTab]

  return (
    <div style={{ marginTop: 16 }}>
      {/* Sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {(['teachers', 'students', 'leads', 'schedule'] as MasterSubTab[]).map(st => (
          <button
            key={st}
            onClick={() => { setSubTab(st); setShowGrid(false) }}
            style={{
              padding: '8px 18px', borderRadius: 8,
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: subTab === st ? '1px solid rgba(255,184,0,0.3)' : '1px solid rgba(255,255,255,0.08)',
              background: subTab === st ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)',
              color: subTab === st ? '#FFB800' : '#686890',
              textTransform: 'capitalize',
            }}
          >
            {st}
          </button>
        ))}
      </div>

      {/* Open Grid Button */}
      <div className="card" style={{ padding: 24, textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 16 }}>
          Open the full spreadsheet editor for <strong style={{ color: '#E0E0F4' }}>{subTab}</strong>.
          This is a full-screen, owner-only editor with direct database access.
        </p>
        <button
          onClick={() => setShowGrid(true)}
          style={{
            padding: '10px 28px', borderRadius: 10, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg, rgba(255,184,0,0.15), rgba(255,120,0,0.1))',
            border: '1px solid rgba(255,184,0,0.3)',
            color: '#FFB800', cursor: 'pointer',
          }}
        >
          Open {subTab.charAt(0).toUpperCase() + subTab.slice(1)} Master Sheet
        </button>
      </div>

      {/* DataGrid overlay */}
      {showGrid && (
        <DataGrid
          title={config.title}
          table={config.table}
          columns={config.columns}
          query={config.query}
          orderBy={config.orderBy}
          nameField={config.nameField}
          nameRenderer={config.nameRenderer}
          onClose={() => setShowGrid(false)}
        />
      )}
    </div>
  )
}

function GeneralTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [nameEdit, setNameEdit] = useState('')
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [saved, setSaved] = useState(false)

  const { data: tenant, isLoading } = useQuery({
    queryKey: ['tenant-settings', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('tenants').select('*').eq('id', tenantId!).single()
      return data
    },
  })

  const updateTenant = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from('tenants').update(updates).eq('id', tenantId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tenant-settings'] })
      qc.invalidateQueries({ queryKey: ['tenant'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${tenantId}/logo.${ext}`
      const { error: uploadErr } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
      if (uploadErr) {
        // Bucket might not exist — create it
        await supabase.storage.createBucket('tenant-assets', { public: true })
        await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
      }
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path)
      await updateTenant.mutateAsync({ logo_url: urlData.publicUrl })
    } catch (err) {
      toast('Logo upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleNameSave = () => {
    if (!nameEdit.trim()) return
    updateTenant.mutate({ name: nameEdit.trim() })
    setEditing(false)
  }

  if (isLoading || !tenant) {
    return <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {saved && (
        <div className="alert alert-pink" style={{ cursor: 'default' }}>
          <Check size={14} />
          <span>Settings saved successfully</span>
        </div>
      )}

      {/* Logo + Name Card */}
      <div className="card" style={{ padding: 24 }}>
        <h3 className="card-section-title">Branding</h3>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
          {/* Logo Upload */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            {tenant.logo_url ? (
              <img
                src={tenant.logo_url}
                alt="Logo"
                style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            ) : (
              <div style={{
                width: 80, height: 80, borderRadius: 16,
                background: 'linear-gradient(135deg, #D4226A, #FF5500)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28, fontWeight: 900, color: '#fff',
                boxShadow: '0 4px 16px rgba(212,34,106,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
              }}>
                {tenant.name?.[0] ?? 'L'}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            <button
              className="btn-outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              <Upload size={12} />
              {uploading ? 'Uploading...' : tenant.logo_url ? 'Change Logo' : 'Upload Logo'}
            </button>
          </div>

          {/* Name + Details */}
          <div style={{ flex: 1 }}>
            <div className="form-label">Business Name</div>
            {editing ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="form-input"
                  value={nameEdit}
                  onChange={(e) => setNameEdit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave() }}
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button className="btn-primary" onClick={handleNameSave} style={{ fontSize: 11, padding: '6px 14px' }}>Save</button>
                <button className="btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 11 }}>Cancel</button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>{tenant.name}</span>
                <button className="btn-ghost" onClick={() => { setNameEdit(tenant.name); setEditing(true) }} style={{ fontSize: 11, padding: '3px 8px' }}>Edit</button>
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="form-label" style={{ minWidth: 70, marginBottom: 0, paddingTop: 2 }}>Timezone</span>
                <select
                  className="form-input"
                  value={tenant.timezone ?? 'America/Chicago'}
                  onChange={(e) => updateTenant.mutate({ timezone: e.target.value })}
                  style={{ fontSize: 12, padding: '4px 8px', width: 220 }}
                >
                  <option value="America/New_York">Eastern (America/New_York)</option>
                  <option value="America/Chicago">Central (America/Chicago)</option>
                  <option value="America/Denver">Mountain (America/Denver)</option>
                  <option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option>
                  <option value="America/Anchorage">Alaska (America/Anchorage)</option>
                  <option value="Pacific/Honolulu">Hawaii (Pacific/Honolulu)</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span className="form-label" style={{ minWidth: 70, marginBottom: 0, paddingTop: 2 }}>Slug</span>
                <span style={{ fontSize: 13, color: '#686890' }}>{tenant.slug}</span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <span className="form-label" style={{ minWidth: 70, marginBottom: 0, paddingTop: 2 }}>Intake URL</span>
                <span style={{ fontSize: 13, color: '#E8488A' }}>/intake/{tenant.slug}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="card" style={{ padding: 24 }}>
        <h3 className="card-section-title">Positions</h3>
        <p style={{ fontSize: 12, color: '#686890', marginBottom: 16 }}>
          Define the roles people hold in your organization. These are for your internal use — not system permissions.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { title: 'Owner', desc: 'Full access to everything across all locations', color: '#D4226A' },
            { title: 'Director / Manager', desc: 'Manages day-to-day operations at assigned locations', color: '#FF5500' },
            { title: 'Office Staff', desc: 'Handles scheduling, communication, and admin tasks', color: '#FFB800' },
          ].map((pos) => (
            <div key={pos.title} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 11,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: pos.color, flexShrink: 0, boxShadow: `0 0 8px ${pos.color}40` }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{pos.title}</div>
                <div style={{ fontSize: 11, color: '#4C4C74' }}>{pos.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Colors placeholder */}
      <div className="card" style={{ padding: 24 }}>
        <h3 className="card-section-title">Brand Colors</h3>
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: tenant.primary_color || '#D4226A', border: '1px solid rgba(255,255,255,0.1)' }} />
          <div style={{ width: 32, height: 32, borderRadius: 8, background: tenant.accent_color || '#FF5500', border: '1px solid rgba(255,255,255,0.1)' }} />
        </div>
        <p style={{ fontSize: 11, color: '#4C4C74', marginTop: 12 }}>
          Color customization coming soon. These colors will be used on your intake form and student portal.
        </p>
      </div>
    </div>
  )
}

function LocationsTab({ isOwner, tenantId }: { isOwner: boolean; tenantId: string | null }) {
  const { data: locations, isLoading } = useLocations()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LocationFormData>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [expandedHoursId, setExpandedHoursId] = useState<string | null>(null)

  const openCreate = () => { setEditingId(null); setForm(emptyForm); setFormError(null); setShowForm(true); }
  const openEdit = (loc: Location) => {
    setEditingId(loc.id)
    setForm({ name: loc.name, address: loc.address, city: loc.city, state: loc.state, zip: loc.zip, phone: loc.phone ?? '', email: loc.email ?? '', website: loc.website ?? '', google_review_url: loc.google_review_url ?? '' })
    setFormError(null); setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(null)
    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.zip.trim()) { setFormError('Name, address, city, and zip are required.'); return }
    try {
      if (editingId) { await updateLocation.mutateAsync({ id: editingId, ...form }) }
      else { await createLocation.mutateAsync({ ...form, tenant_id: tenantId!, is_active: true, hours_json: null } as any) }
      setShowForm(false)
    } catch (err: any) { setFormError(err.message) }
  }

  const toggleActive = async (loc: Location) => {
    await updateLocation.mutateAsync({ id: loc.id, is_active: !loc.is_active })
  }

  if (isLoading) return <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>

  return (
    <div style={{ marginTop: '16px' }}>
      {isOwner && (
        <div style={{ marginBottom: '16px' }}>
          <button className="btn-primary" onClick={openCreate}>+ Add Location</button>
        </div>
      )}

      <div className="locations-grid">
        {locations?.map((loc) => (
          <LocationCard key={loc.id} loc={loc} isOwner={isOwner} tenantId={tenantId} onEdit={() => openEdit(loc)} onToggle={() => toggleActive(loc)} hoursExpanded={expandedHoursId === loc.id} onHoursToggle={() => setExpandedHoursId(expandedHoursId === loc.id ? null : loc.id)} />
        ))}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId ? 'Edit Location' : 'New Location'}</h2>
              <button className="btn-ghost" onClick={() => setShowForm(false)}>✕</button>
            </div>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="form-field"><label>Location Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="form-field"><label>Address *</label><input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-field" style={{ flex: 2 }}><label>City *</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
                <div className="form-field" style={{ flex: 1 }}><label>State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
                <div className="form-field" style={{ flex: 1 }}><label>Zip *</label><input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></div>
              </div>
              <div className="form-field"><label>QUO Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="form-field"><label>Email</label><input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="form-field"><label>Website</label><input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} /></div>
              <div className="form-field"><label>Google Review URL</label><input value={form.google_review_url} onChange={(e) => setForm({ ...form, google_review_url: e.target.value })} /></div>
              {formError && <div className="form-error">{formError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={createLocation.isPending || updateLocation.isPending}>
                  {(createLocation.isPending || updateLocation.isPending) ? 'Saving...' : editingId ? 'Save Changes' : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function LocationCard({ loc, isOwner, tenantId, onEdit, onToggle, hoursExpanded, onHoursToggle }: {
  loc: Location; isOwner: boolean; tenantId: string | null
  onEdit: () => void; onToggle: () => void; hoursExpanded: boolean; onHoursToggle: () => void
}) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const updateLocation = useUpdateLocation()

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !tenantId) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `${tenantId}/locations/${loc.id}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
      if (uploadErr) {
        await supabase.storage.createBucket('tenant-assets', { public: true })
        await supabase.storage.from('tenant-assets').upload(path, file, { upsert: true })
      }
      const { data: urlData } = supabase.storage.from('tenant-assets').getPublicUrl(path)
      await updateLocation.mutateAsync({ id: loc.id, logo_url: urlData.publicUrl } as any)
      qc.invalidateQueries({ queryKey: ['locations'] })
    } catch (err) {
      toast('Location logo upload failed', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="location-card" style={{ padding: 20, cursor: 'default' }}>
      <div className="loc-card-edge" style={{ background: loc.is_active ? 'linear-gradient(180deg, #D4226A, #FF5500)' : 'linear-gradient(180deg, #606088, #363656)', boxShadow: loc.is_active ? '0 0 12px rgba(212,34,106,0.4)' : 'none' }} />
      <div className="loc-card-glow" style={{ background: loc.is_active ? 'radial-gradient(circle, rgba(212,34,106,0.06) 0%, transparent 70%)' : 'none' }} />
      <div style={{ position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Location Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {(loc as any).logo_url ? (
            <img src={(loc as any).logo_url} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
          ) : (
            <div style={{
              width: 52, height: 52, borderRadius: 12,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, fontWeight: 800, color: '#4C4C74',
            }}>
              {loc.name?.[0] ?? 'L'}
            </div>
          )}
          {isOwner && (
            <>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
              <button
                className="btn-ghost"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                style={{ fontSize: 9, padding: '2px 6px' }}
              >
                <Upload size={10} />
                {uploading ? '...' : 'Logo'}
              </button>
            </>
          )}
        </div>

        {/* Location Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#FFFFFF' }}>{loc.name}</span>
            <span className={loc.is_active ? 'badge-green' : 'badge-gray'}>{loc.is_active ? 'Active' : 'Inactive'}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="location-detail"><span className="location-label">Address</span><span style={{ fontSize: 12, color: '#686890' }}>{loc.address}, {loc.city}, {loc.state} {loc.zip}</span></div>
            {loc.phone && <div className="location-detail"><span className="location-label">Phone</span><span style={{ fontSize: 12, color: '#686890' }}>{loc.phone}</span></div>}
            {loc.email && <div className="location-detail"><span className="location-label">Email</span><span style={{ fontSize: 12, color: '#686890' }}>{loc.email}</span></div>}
          </div>

          {isOwner && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button className="btn-outline" onClick={onEdit} style={{ fontSize: 11, padding: '5px 12px' }}>Edit Details</button>
              <button className="btn-ghost" onClick={onToggle} style={{ fontSize: 11, color: loc.is_active ? '#4C4C74' : '#22C55E' }}>
                {loc.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Operating Hours */}
      <OperatingHoursEditor locationId={loc.id} isOwner={isOwner} expanded={hoursExpanded} onToggle={onHoursToggle} />
      </div>
    </div>
  )
}

/* ── Operating Hours Editor ─────────────────────────────────── */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface HoursRow {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

function defaultHours(): HoursRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    open_time: '09:00',
    close_time: '21:00',
    is_closed: i === 0, // Sunday closed by default
  }))
}

function OperatingHoursEditor({ locationId, isOwner, expanded, onToggle }: { locationId: string; isOwner: boolean; expanded: boolean; onToggle: () => void }) {
  const qc = useQueryClient()
  const [hours, setHours] = useState<HoursRow[]>(defaultHours)
  const [saved, setSaved] = useState(false)

  const { data: fetchedHours, isLoading } = useQuery({
    queryKey: ['location-hours', locationId],
    enabled: expanded,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('location_hours')
        .select('day_of_week, open_time, close_time, is_closed')
        .eq('location_id', locationId)
        .order('day_of_week')
      if (error) throw error
      return data as HoursRow[]
    },
  })

  useEffect(() => {
    if (fetchedHours && fetchedHours.length > 0) {
      const merged = defaultHours().map((def) => {
        const found = fetchedHours.find((h) => h.day_of_week === def.day_of_week)
        return found
          ? { ...def, open_time: found.open_time?.slice(0, 5) ?? '09:00', close_time: found.close_time?.slice(0, 5) ?? '21:00', is_closed: found.is_closed }
          : def
      })
      setHours(merged)
    }
  }, [fetchedHours])

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const row of hours) {
        const { error } = await supabase
          .from('location_hours')
          .upsert(
            {
              location_id: locationId,
              day_of_week: row.day_of_week,
              open_time: row.open_time + ':00',
              close_time: row.close_time + ':00',
              is_closed: row.is_closed,
            },
            { onConflict: 'location_id,day_of_week' }
          )
        if (error) throw error
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['location-hours', locationId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  const updateRow = (dayIndex: number, field: keyof HoursRow, value: string | boolean) => {
    setHours((prev) =>
      prev.map((r) => (r.day_of_week === dayIndex ? { ...r, [field]: value } : r))
    )
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
      <button
        onClick={onToggle}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          color: '#E0E0F4',
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <Clock size={13} style={{ color: '#686890' }} />
        Operating Hours
        {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>

      {expanded && (
        <div style={{ marginTop: 12 }}>
          {isLoading ? (
            <div style={{ padding: '12px 0', color: '#686890', fontSize: 12 }}>Loading hours...</div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {hours.map((row) => (
                  <div
                    key={row.day_of_week}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: 8,
                    }}
                  >
                    <span style={{
                      width: 36,
                      fontSize: 11,
                      fontWeight: 600,
                      color: row.is_closed ? '#4C4C74' : '#E0E0F4',
                      flexShrink: 0,
                    }}>
                      {DAY_NAMES[row.day_of_week].slice(0, 3)}
                    </span>

                    <input
                      type="time"
                      value={row.open_time}
                      onChange={(e) => updateRow(row.day_of_week, 'open_time', e.target.value)}
                      disabled={row.is_closed || !isOwner}
                      style={{
                        background: row.is_closed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        color: row.is_closed ? '#4C4C74' : '#E0E0F4',
                        fontSize: 11,
                        padding: '4px 6px',
                        width: 90,
                        boxSizing: 'border-box' as const,
                        opacity: row.is_closed ? 0.4 : 1,
                        cursor: row.is_closed || !isOwner ? 'not-allowed' : 'pointer',
                      }}
                    />

                    <span style={{ fontSize: 11, color: '#4C4C74' }}>to</span>

                    <input
                      type="time"
                      value={row.close_time}
                      onChange={(e) => updateRow(row.day_of_week, 'close_time', e.target.value)}
                      disabled={row.is_closed || !isOwner}
                      style={{
                        background: row.is_closed ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        color: row.is_closed ? '#4C4C74' : '#E0E0F4',
                        fontSize: 11,
                        padding: '4px 6px',
                        width: 90,
                        boxSizing: 'border-box' as const,
                        opacity: row.is_closed ? 0.4 : 1,
                        cursor: row.is_closed || !isOwner ? 'not-allowed' : 'pointer',
                      }}
                    />

                    {isOwner && (
                      <label style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        marginLeft: 'auto',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}>
                        <span style={{ fontSize: 11, color: row.is_closed ? '#E8488A' : '#4C4C74', fontWeight: 600 }}>
                          Closed
                        </span>
                        <div
                          onClick={() => updateRow(row.day_of_week, 'is_closed', !row.is_closed)}
                          style={{
                            width: 34,
                            height: 18,
                            borderRadius: 9,
                            background: row.is_closed ? '#E8488A' : 'rgba(255,255,255,0.1)',
                            position: 'relative',
                            transition: 'background 0.2s',
                            cursor: 'pointer',
                            flexShrink: 0,
                          }}
                        >
                          <div style={{
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: '#fff',
                            position: 'absolute',
                            top: 2,
                            left: row.is_closed ? 18 : 2,
                            transition: 'left 0.2s',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                          }} />
                        </div>
                      </label>
                    )}
                  </div>
                ))}
              </div>

              {isOwner && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <button
                    className="btn-primary"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    style={{ fontSize: 11, padding: '6px 16px' }}
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save Hours'}
                  </button>
                  {saved && (
                    <span style={{ fontSize: 11, color: '#22C55E', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Check size={12} /> Saved
                    </span>
                  )}
                  {saveMutation.isError && (
                    <span style={{ fontSize: 11, color: '#EF4444' }}>
                      Error saving hours
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── Teacher Locations Tab ──────────────────────────────────── */

function TeacherLocationsTab() {
  const { data: teachers, isLoading: loadingTeachers } = useTeachers()
  const { data: locations, isLoading: loadingLocations } = useLocations()

  if (loadingTeachers || loadingLocations) {
    return <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
  }

  if (!teachers?.length) {
    return (
      <div style={{ marginTop: 16, padding: 24, textAlign: 'center', color: '#686890', fontSize: 13 }}>
        No teachers found. Add teachers first.
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p style={{ fontSize: 12, color: '#686890', margin: 0 }}>
        Assign teachers to locations and mark who is available as a substitute.
      </p>
      {teachers.map((teacher: any) => (
        <TeacherLocationRow
          key={teacher.id}
          teacher={teacher}
          locations={locations ?? []}
        />
      ))}
    </div>
  )
}

function TeacherLocationRow({ teacher, locations }: { teacher: any; locations: Location[] }) {
  const { data: assignedData } = useTeacherLocations(teacher.id)
  const toggleLocation = useToggleTeacherLocation()
  const toggleSub = useToggleSubAvailable()

  const assignedIds = new Set(assignedData?.map((a) => a.location_id) ?? [])
  const teacherName = `${teacher.first_name ?? teacher.profile?.first_name ?? ''} ${teacher.last_name ?? teacher.profile?.last_name ?? ''}`.trim() || 'Unknown Teacher'

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: 'linear-gradient(135deg, #D4226A, #FF5500)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 800, color: '#fff',
            flexShrink: 0,
          }}>
            {(teacher.first_name ?? teacher.profile?.first_name)?.[0] ?? '?'}{(teacher.last_name ?? teacher.profile?.last_name)?.[0] ?? ''}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFFFFF' }}>{teacherName}</div>
            <div style={{ fontSize: 11, color: '#4C4C74' }}>
              {teacher.instruments?.join(', ') || 'No instruments'}
            </div>
          </div>
        </div>

        {/* Sub Available Toggle */}
        <label style={{
          display: 'flex', alignItems: 'center', gap: 8,
          cursor: 'pointer', userSelect: 'none',
        }}>
          <span style={{ fontSize: 11, color: teacher.sub_available ? '#22C55E' : '#4C4C74', fontWeight: 600 }}>
            Sub Available
          </span>
          <div
            onClick={() => toggleSub.mutate({ teacher_id: teacher.id, sub_available: !!teacher.sub_available })}
            style={{
              width: 36, height: 20, borderRadius: 10,
              background: teacher.sub_available ? '#22C55E' : 'rgba(255,255,255,0.1)',
              position: 'relative',
              transition: 'background 0.2s',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: '#fff',
              position: 'absolute',
              top: 2,
              left: teacher.sub_available ? 18 : 2,
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
            }} />
          </div>
        </label>
      </div>

      {/* Location Pills — 2×2 grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {locations.map((loc) => {
          const isAssigned = assignedIds.has(loc.id)
          return (
            <button
              key={loc.id}
              onClick={() => toggleLocation.mutate({
                teacher_id: teacher.id,
                location_id: loc.id,
                assigned: isAssigned,
              })}
              disabled={toggleLocation.isPending}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '6px 10px',
                fontSize: 12, fontWeight: 600,
                borderRadius: 8,
                border: isAssigned ? '1px solid #D4226A' : '1px solid rgba(255,255,255,0.1)',
                background: isAssigned
                  ? 'linear-gradient(135deg, rgba(212,34,106,0.25), rgba(255,85,0,0.15))'
                  : 'rgba(255,255,255,0.03)',
                color: isAssigned ? '#E8488A' : '#4C4C74',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {loc.name.replace(/ Music Lessons/i, '')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Permissions Tab ─────────────────────────────────────────────
const PERMISSION_CATEGORIES: Record<string, string> = {
  students: 'Students',
  teachers: 'Teachers',
  schedule: 'Schedule',
  leads: 'Leads',
  payroll: 'Payroll',
  master_sheet: 'Master Sheets',
  messages: 'Messages',
  settings: 'Settings',
  files: 'Files',
}

const ROLE_LIST = [
  { key: 'company_director', label: 'Company Director' },
  { key: 'studio_director', label: 'Studio Director' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'parent', label: 'Parent' },
]

function PermissionsTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient()
  const [selectedRole, setSelectedRole] = useState('company_director')
  const [saving, setSaving] = useState<string | null>(null)

  // Fetch permission definitions
  const { data: definitions } = useQuery({
    queryKey: ['permission-definitions', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('permission_definitions').select('*').eq('tenant_id', tenantId!)
      return data ?? []
    },
  })

  // Fetch grants
  const { data: grants } = useQuery({
    queryKey: ['permission-grants', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase.from('permission_set_grants').select('*').eq('tenant_id', tenantId!)
      return data ?? []
    },
  })

  const getDefaultForRole = (def: any, role: string): boolean => {
    switch (role) {
      case 'company_director': return def.company_director_default ?? false
      case 'studio_director': return def.studio_director_default ?? false
      case 'teacher': return def.teacher_default ?? false
      case 'parent': return def.parent_default ?? false
      default: return false
    }
  }

  const isGranted = (permKey: string, role: string): boolean => {
    const grant = grants?.find((g: any) => g.role === role && g.permission_key === permKey)
    if (grant) return grant.is_granted
    const def = definitions?.find((d: any) => d.key === permKey)
    if (def) return getDefaultForRole(def, role)
    return false
  }

  const handleToggle = async (permKey: string, role: string, currentValue: boolean) => {
    if (!tenantId) return
    const cellKey = `${role}-${permKey}`
    setSaving(cellKey)

    // Upsert into permission_set_grants
    const existing = grants?.find((g: any) => g.role === role && g.permission_key === permKey)
    if (existing) {
      await supabase.from('permission_set_grants').update({ is_granted: !currentValue }).eq('id', existing.id)
    } else {
      await supabase.from('permission_set_grants').insert({
        tenant_id: tenantId,
        role,
        permission_key: permKey,
        is_granted: !currentValue,
      })
    }

    qc.invalidateQueries({ queryKey: ['permission-grants', tenantId] })
    qc.invalidateQueries({ queryKey: ['permissions'] })
    setSaving(null)
  }

  // Group definitions by category
  const grouped: Record<string, any[]> = {}
  ;(definitions ?? []).forEach((d: any) => {
    const cat = d.category ?? d.key.split('.')[0] ?? 'other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push(d)
  })

  const isOwnerView = selectedRole === 'owner'

  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 16, minHeight: 500 }}>
      {/* Left sidebar — role list */}
      <div style={{ width: 200, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Owner — locked */}
        <button
          onClick={() => setSelectedRole('owner')}
          style={{
            padding: '12px 16px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
            background: isOwnerView ? 'rgba(255,184,0,0.1)' : 'rgba(255,255,255,0.03)',
            border: isOwnerView ? '1px solid rgba(255,184,0,0.3)' : '1px solid rgba(255,255,255,0.06)',
            color: isOwnerView ? '#FFB800' : '#8080A8', fontSize: 13, fontWeight: 700,
          }}
        >
          Owner
          <div style={{ fontSize: 10, fontWeight: 500, color: '#606088', marginTop: 2 }}>Full access — always on</div>
        </button>

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 0' }} />

        {ROLE_LIST.map((r) => (
          <button
            key={r.key}
            onClick={() => setSelectedRole(r.key)}
            style={{
              padding: '10px 16px', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
              background: selectedRole === r.key ? 'rgba(232,72,138,0.08)' : 'rgba(255,255,255,0.03)',
              border: selectedRole === r.key ? '1px solid rgba(232,72,138,0.25)' : '1px solid rgba(255,255,255,0.06)',
              color: selectedRole === r.key ? '#E8488A' : '#A0A0C8', fontSize: 13, fontWeight: 600,
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Main panel — permissions grouped by category */}
      <div style={{ flex: 1 }}>
        {isOwnerView ? (
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>*</div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#FFB800', marginBottom: 6 }}>Owner — Full Access</p>
            <p style={{ fontSize: 13, color: '#8080A8' }}>The owner role always has access to every permission. This cannot be changed.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(PERMISSION_CATEGORIES).map(([catKey, catLabel]) => {
              const perms = grouped[catKey]
              if (!perms || perms.length === 0) return null
              return (
                <div key={catKey} className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>{catLabel}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {perms.map((def: any) => {
                      const granted = isGranted(def.key, selectedRole)
                      const cellKey = `${selectedRole}-${def.key}`
                      const isSaving = saving === cellKey
                      return (
                        <div
                          key={def.key}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px', borderRadius: 8,
                            background: granted ? 'rgba(34,197,94,0.04)' : 'transparent',
                          }}
                        >
                          <div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: '#C0C0E0' }}>{def.label ?? def.key}</span>
                            {def.description && (
                              <div style={{ fontSize: 11, color: '#8080A8', marginTop: 1 }}>{def.description}</div>
                            )}
                          </div>
                          <button
                            onClick={() => handleToggle(def.key, selectedRole, granted)}
                            disabled={!!saving}
                            style={{
                              width: 44, height: 24, borderRadius: 12, border: 'none', cursor: saving ? 'wait' : 'pointer',
                              background: granted ? '#22C55E' : 'rgba(255,255,255,0.1)',
                              position: 'relative', transition: 'background 150ms ease', flexShrink: 0,
                            }}
                          >
                            <div style={{
                              width: 18, height: 18, borderRadius: 9, background: '#fff',
                              position: 'absolute', top: 3,
                              left: granted ? 23 : 3,
                              transition: 'left 150ms ease',
                              boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                            }} />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════
// BRANDING TAB — per-location brand settings
// ═══════════════════════════════════════

function BrandingTab({ tenantId }: { tenantId: string | null }) {
  const { data: locations } = useLocations()
  const [selectedLocId, setSelectedLocId] = useState<string>('')
  const [form, setForm] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState<string | null>(null)
  const qc = useQueryClient()

  // Load brand settings for selected location
  const { data: brandSettings, refetch } = useQuery({
    queryKey: ['brand-settings', selectedLocId],
    enabled: !!selectedLocId,
    queryFn: async () => {
      const { data } = await supabase.from('brand_settings').select('*').eq('location_id', selectedLocId).single()
      return data
    },
  })

  // Auto-select first location
  useState(() => {
    if (!selectedLocId && locations?.length) setSelectedLocId(locations.find((l: any) => l.is_active)?.id ?? '')
  })

  // Sync form from DB on load
  useState(() => {
    if (brandSettings) setForm(brandSettings)
  })

  // Update form when brandSettings changes
  if (brandSettings && form.id !== brandSettings.id) {
    setForm(brandSettings)
  }

  const handleSave = async () => {
    if (!selectedLocId || !brandSettings?.id) return
    setSaving(true)
    try {
      const { id: _id, created_at: _c, updated_at: _u, tenant_id: _t, location_id: _l, ...updates } = form
      await supabase.from('brand_settings').update(updates).eq('id', brandSettings.id)
      toast('Brand settings saved', 'success')
      refetch()
    } catch (err: any) {
      toast(err.message ?? 'Failed to save', 'error')
    }
    setSaving(false)
  }

  const handleLogoUpload = async (type: 'logo-circle' | 'logo-wide' | 'favicon', file: File) => {
    if (!tenantId || !selectedLocId) return
    setUploading(type)
    try {
      const path = `${tenantId}/${selectedLocId}/${type}.png`
      await supabase.storage.from('brand-assets').upload(path, file, { upsert: true })
      const { data: urlData } = supabase.storage.from('brand-assets').getPublicUrl(path)
      const fieldMap: Record<string, string> = { 'logo-circle': 'logo_circle_path', 'logo-wide': 'logo_wide_path', 'favicon': 'logo_favicon_path' }
      setForm({ ...form, [fieldMap[type]]: path })
      toast('Logo uploaded', 'success')
    } catch (err: any) {
      toast(err.message ?? 'Upload failed', 'error')
    }
    setUploading(null)
  }

  const getLogoUrl = (path: string | null) => {
    if (!path) return null
    return supabase.storage.from('brand-assets').getPublicUrl(path).data.publicUrl
  }

  const field = (key: string, label: string, placeholder?: string) => (
    <div style={{ marginBottom: 10 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase' as const, letterSpacing: '0.06em', display: 'block', marginBottom: 4 }}>{label}</label>
      <input
        value={form[key] ?? ''}
        onChange={e => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box' as const, fontFamily: 'inherit' }}
      />
    </div>
  )

  const locColor = brandSettings?.primary_color ?? '#D4226A'

  return (
    <div style={{ maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Location selector */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {locations?.filter((l: any) => l.is_active).map((loc: any) => {
          const isActive = selectedLocId === loc.id
          const c = loc.color ?? '#D4226A'
          return (
            <button key={loc.id} onClick={() => setSelectedLocId(loc.id)} style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: isActive ? `${c}20` : 'rgba(255,255,255,0.03)',
              color: isActive ? c : '#8080A8',
              border: `1px solid ${isActive ? `${c}40` : 'rgba(255,255,255,0.06)'}`,
            }}>
              {loc.name.replace(' Music Lessons', '')}
            </button>
          )
        })}
      </div>

      {!selectedLocId ? (
        <div style={{ color: '#8080A8', padding: 20 }}>Select a location above.</div>
      ) : !brandSettings ? (
        <div style={{ color: '#8080A8', padding: 20 }}>Loading...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Logos + Colors */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: locColor, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Logos</div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
              {(['logo-circle', 'logo-wide', 'favicon'] as const).map(type => {
                const pathKey = type === 'logo-circle' ? 'logo_circle_path' : type === 'logo-wide' ? 'logo_wide_path' : 'logo_favicon_path'
                const url = getLogoUrl(form[pathKey])
                const labels: Record<string, string> = { 'logo-circle': 'Circle', 'logo-wide': 'Wide', 'favicon': 'Favicon' }
                return (
                  <div key={type} style={{ textAlign: 'center' }}>
                    <div style={{
                      width: type === 'logo-wide' ? 120 : 70, height: 70, borderRadius: type === 'logo-circle' ? '50%' : 10,
                      background: 'rgba(255,255,255,0.04)', border: '2px dashed rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                      cursor: 'pointer', position: 'relative',
                    }}
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = 'image/*'
                        input.onchange = (e) => {
                          const f = (e.target as HTMLInputElement).files?.[0]
                          if (f) handleLogoUpload(type, f)
                        }
                        input.click()
                      }}
                    >
                      {uploading === type ? (
                        <span style={{ fontSize: 10, color: '#8080A8' }}>...</span>
                      ) : url ? (
                        <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                      ) : (
                        <span style={{ fontSize: 20, color: '#363656' }}>+</span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: '#606088', marginTop: 4 }}>{labels[type]}</div>
                  </div>
                )
              })}
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: locColor, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Colors</div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              {[{ key: 'primary_color', label: 'Primary' }, { key: 'secondary_color', label: 'Secondary' }, { key: 'background_color', label: 'Background' }].map(c => (
                <div key={c.key} style={{ textAlign: 'center' }}>
                  <input type="color" value={form[c.key] ?? '#000000'} onChange={e => setForm({ ...form, [c.key]: e.target.value })}
                    style={{ width: 48, height: 48, borderRadius: 10, border: '2px solid rgba(255,255,255,0.1)', cursor: 'pointer', background: 'none', padding: 0 }} />
                  <div style={{ fontSize: 9, color: '#606088', marginTop: 4 }}>{c.label}</div>
                  <div style={{ fontSize: 8, color: '#363656', fontFamily: 'monospace' }}>{form[c.key] ?? '—'}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Studio Info + Tracking */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: locColor, marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Studio Info</div>
            {field('studio_name', 'Studio Name', 'Adkins Music Lessons')}
            {field('tagline', 'Tagline', 'Learn to play!')}
            {field('website_domain', 'Website Domain', 'example.com')}
            {field('phone', 'Phone')}
            {field('email', 'Email')}
            {field('address_line1', 'Address')}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
              {field('address_city', 'City')}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {field('address_state', 'State')}
                {field('address_zip', 'ZIP')}
              </div>
            </div>
            {field('google_maps_url', 'Google Maps URL')}

            <div style={{ fontSize: 12, fontWeight: 700, color: locColor, marginBottom: 12, marginTop: 16, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Tracking</div>
            {field('ga4_id', 'GA4 Measurement ID', 'G-XXXXXXXXXX')}
            {field('meta_pixel_id', 'Meta Pixel ID')}
            {field('tiktok_pixel_id', 'TikTok Pixel ID')}

            <div style={{ fontSize: 12, fontWeight: 700, color: locColor, marginBottom: 12, marginTop: 16, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>Social</div>
            {field('facebook_url', 'Facebook URL')}
            {field('instagram_url', 'Instagram URL')}
            {field('tiktok_url', 'TikTok URL')}
            {field('youtube_url', 'YouTube URL')}
          </div>
        </div>
      )}

      {/* Save button */}
      {selectedLocId && brandSettings && (
        <div style={{ marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '12px 28px', borderRadius: 8, fontSize: 14, fontWeight: 700, width: '100%',
            background: locColor, color: '#fff', border: 'none', cursor: 'pointer',
            opacity: saving ? 0.5 : 1, boxShadow: `0 2px 12px ${locColor}40`,
          }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// BILLING SETTINGS TAB
// ═══════════════════════════════════════

function BillingSettingsTab() {
  const { data: billing } = useTenantBilling()
  const checkout = useCreateCheckout()
  const portal = useCustomerPortal()

  if (!billing) return <div style={{ color: '#8080A8', padding: 20 }}>Loading...</div>

  const isActive = billing.plan === 'active'
  const isTrial = billing.plan === 'trial'
  const isExpired = billing.isTrialExpired

  return (
    <div>
      {/* Status card */}
      <div style={{
        padding: 24, borderRadius: 14, marginBottom: 20,
        background: isActive ? 'rgba(34,197,94,0.04)' : isExpired ? 'rgba(239,68,68,0.04)' : 'rgba(245,158,11,0.04)',
        border: `1px solid ${isActive ? 'rgba(34,197,94,0.12)' : isExpired ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)'}`,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Current Plan</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: isActive ? '#22C55E' : isExpired ? '#EF4444' : '#f59e0b', marginBottom: 4 }}>
          {isActive ? `${getTierByKey(billing.pricingTier).name}` : isTrial ? (isExpired ? 'Trial Expired' : 'Free Trial') : billing.plan}
        </div>
        {isActive && (
          <div style={{ fontSize: 14, color: '#A0A0C8' }}>
            {getTierByKey(billing.pricingTier).priceDisplay}/month
          </div>
        )}
        {isTrial && !isExpired && billing.daysRemaining !== null && (
          <div style={{ fontSize: 14, color: '#f59e0b' }}>
            {billing.daysRemaining} day{billing.daysRemaining !== 1 ? 's' : ''} remaining in your free trial. Take your time getting set up.
          </div>
        )}
        {isExpired && (
          <div style={{ fontSize: 14, color: '#EF4444' }}>
            Your trial has ended. Subscribe to continue using Lessonpreneur.
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        {isActive && (
          <button onClick={() => portal.mutate()} disabled={portal.isPending} style={{
            padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: 'rgba(255,255,255,0.06)', color: '#A0A0C8', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
          }}>
            {portal.isPending ? 'Opening...' : 'Manage Subscription'}
          </button>
        )}
        {(!isActive || isExpired) && (
          <button onClick={() => checkout.mutate()} disabled={checkout.isPending} style={{
            padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700,
            background: '#f59e0b', color: '#000', border: 'none', cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(245,158,11,0.3)',
          }}>
            {checkout.isPending ? 'Loading...' : `Subscribe Now — ${getTierByKey(billing.pricingTier).priceDisplay}/month`}
          </button>
        )}
      </div>

      {/* Features list for trial users */}
      {!isActive && (
        <div style={{ marginTop: 24, padding: 20, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 12 }}>What you get with Lessonpreneur Pro:</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {['AI progress updates', 'Churn risk scoring', 'Retention campaigns', 'Financial dashboard', 'Smart scheduling', 'Parent portal', 'Email notifications', 'Star AI assistant', 'Practice lab', 'White-label branding'].map(f => (
              <div key={f} style={{ fontSize: 12, color: '#A0A0C8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: '#22C55E' }}>&#10003;</span> {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// PAYMENTS TAB — Stripe Connect
// ═══════════════════════════════════════

function PaymentsTab() {
  const { data: connect } = useStripeConnectStatus()
  const onboard = useStripeConnectOnboard()
  if (!connect) return <div style={{ color: '#8080A8', padding: 20 }}>Loading...</div>
  const isConnected = connect.status === 'active'
  const isPending = connect.status === 'pending'
  return (
    <div>
      <div style={{ padding: 24, borderRadius: 14, marginBottom: 20, background: isConnected ? 'rgba(34,197,94,0.04)' : 'rgba(59,130,246,0.04)', border: `1px solid ${isConnected ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)'}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Student Payments</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: isConnected ? '#22C55E' : isPending ? '#f59e0b' : '#3b82f6', marginBottom: 8 }}>
          {isConnected ? 'Stripe Connected' : isPending ? 'Setup In Progress' : 'Not Connected'}
        </div>
        <div style={{ fontSize: 13, color: '#A0A0C8' }}>
          {isConnected ? 'You can invoice students and collect payments directly through Lessonpreneur.' : isPending ? 'Complete your Stripe setup to start accepting payments.' : 'Connect Stripe to bill students directly. Automated invoicing, auto-pay, and payment tracking.'}
        </div>
      </div>
      {!isConnected && (
        <div>
          <button onClick={() => onboard.mutate()} disabled={onboard.isPending} style={{ padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 700, background: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 12px rgba(59,130,246,0.3)', marginBottom: 20 }}>
            {onboard.isPending ? 'Redirecting...' : isPending ? 'Continue Stripe Setup' : 'Connect Stripe Account'}
          </button>
          <div style={{ padding: 16, borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', marginBottom: 8 }}>What you get:</div>
            {['Automated monthly invoicing', 'Auto-pay collection', 'Payment tracking in dashboard', 'Parent-friendly payment portal', 'Reduced churn from missed payments'].map(f => (
              <div key={f} style={{ fontSize: 12, color: '#A0A0C8', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ color: '#22C55E' }}>&#10003;</span> {f}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════
// INTEGRATIONS TAB
// ═══════════════════════════════════════

function IntegrationsTab({ tenantId }: { tenantId: string | null }) {
  const qc = useQueryClient()

  const { data: googleToken, isLoading } = useQuery({
    queryKey: ['google-oauth-status', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from('google_oauth_tokens')
        .select('connected_email, created_at')
        .eq('tenant_id', tenantId!)
        .single()
      return data
    },
    staleTime: 1000 * 10,
  })

  const isConnected = !!googleToken?.connected_email

  const handleConnect = async () => {
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) { toast('Not authenticated', 'error'); return }

      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-oauth-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!data.url) { toast(data.error || 'Failed to start OAuth', 'error'); return }

      const popup = window.open(data.url, 'google-oauth', 'width=500,height=600,left=200,top=200')
      const interval = setInterval(async () => {
        if (popup?.closed) {
          clearInterval(interval)
          // Check if connection succeeded
          const { data: newToken } = await supabase
            .from('google_oauth_tokens')
            .select('connected_email')
            .eq('tenant_id', tenantId!)
            .single()
          qc.invalidateQueries({ queryKey: ['google-oauth-status'] })
          if (newToken?.connected_email) {
            toast('Google Calendar connected!', 'success')
          }
        }
      }, 500)
    } catch (err: any) { toast(err.message || 'Failed', 'error') }
  }

  const handleDisconnect = async () => {
    if (!tenantId) return
    await supabase.from('google_oauth_tokens').delete().eq('tenant_id', tenantId)
    qc.invalidateQueries({ queryKey: ['google-oauth-status'] })
    toast('Google Calendar disconnected', 'success')
  }

  return (
    <div style={{ maxWidth: 600 }}>
      <div style={{ padding: 24, borderRadius: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: isConnected ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${isConnected ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Video size={20} style={{ color: isConnected ? '#22C55E' : '#EF4444' }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>Google Calendar</div>
            <div style={{ fontSize: 12, color: '#8080A8' }}>Google Meet virtual sessions</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: isConnected ? '#22C55E' : '#EF4444' }} />
          <span style={{ fontSize: 13, color: isConnected ? '#22C55E' : '#EF4444', fontWeight: 600 }}>
            {isLoading ? 'Checking...' : isConnected ? `Connected — ${googleToken.connected_email}` : 'Not connected'}
          </span>
        </div>
        {isConnected ? (
          <button onClick={handleDisconnect} style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Disconnect</button>
        ) : (
          <button onClick={handleConnect} style={{ padding: '10px 20px', borderRadius: 10, background: '#22C55E', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>Connect Google Calendar</button>
        )}
      </div>
    </div>
  )
}
