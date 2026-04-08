import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations, useCreateLocation, useUpdateLocation } from '../../hooks/useLocations'
import { useTeachers } from '../../hooks/useTeachers'
import { useTeacherLocations, useToggleTeacherLocation, useToggleSubAvailable } from '../../hooks/useTeacherLocations'
import { supabase } from '../../lib/supabase'
import RoomsManager from '../../components/rooms/RoomsManager'
import FloorPlanEditor from '../../components/rooms/FloorPlanEditor'
import StudioClosuresManager from '../../components/admin/StudioClosuresManager'
import DataGrid from '../../components/shared/DataGrid'
import { Upload, Check, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import type { Location } from '../../lib/types'
import { useTenantBilling, useCreateCheckout, useCustomerPortal } from '../../hooks/useTenantBilling'
import { useIssues, useCreateIssue, useUpdateIssue, useScreenshotUrl, checkForDuplicateIssue, PAGES, PAGE_SECTION_MAP, CATEGORIES, SEVERITIES, STATUS_COLORS, STATUS_LABELS, getSectionsForPage, getSubsectionsForSection, type StatusGroup } from '../../hooks/useIssues'
import { useStripeConnectStatus, useStripeConnectOnboard } from '../../hooks/useStripeConnect'
import { getTierByKey, TRIAL_DAYS } from '../../lib/pricing'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import { useOnboarding } from '../../contexts/OnboardingContext'

interface LocationFormData {
  name: string; address: string; city: string; state: string; zip: string
  phone: string; email: string; website: string; google_review_url: string
}

const emptyForm: LocationFormData = {
  name: '', address: '', city: '', state: 'NE', zip: '',
  phone: '', email: '', website: '', google_review_url: '',
}

type Tab = 'business' | 'locations' | 'access' | 'billing-config' | 'issues' | 'account'

// Map old tab names to new ones for bookmark compatibility
const TAB_REDIRECTS: Record<string, Tab> = {
  general: 'business', branding: 'business',
  rooms: 'locations', 'teacher-locations': 'locations',
  permissions: 'access', 'master-control': 'access',
  billing: 'billing-config', payments: 'billing-config',
  integrations: 'business', // integrations removed from settings
}

const VALID_TABS: Tab[] = ['business', 'locations', 'access', 'billing-config', 'issues', 'account']

export default function Settings() {
  const { role, tenantId } = useAuthContext()
  const isOwner = role === 'owner'
  const [searchParams, setSearchParams] = useSearchParams()

  const resolveTab = useCallback((): Tab => {
    const raw = searchParams.get('tab') ?? ''
    if (VALID_TABS.includes(raw as Tab)) return raw as Tab
    if (TAB_REDIRECTS[raw]) return TAB_REDIRECTS[raw]
    return 'business'
  }, [searchParams])

  const isStudioDirector = role === 'studio_director'
  const tabRaw = resolveTab()
  const tab: Tab = isStudioDirector ? 'account' : tabRaw
  const setTab = (t: Tab) => setSearchParams({ tab: t }, { replace: true })

  // Redirect old tab names in URL
  useEffect(() => {
    const raw = searchParams.get('tab') ?? ''
    if (TAB_REDIRECTS[raw]) {
      setSearchParams({ tab: TAB_REDIRECTS[raw] }, { replace: true })
    }
  }, [searchParams, setSearchParams])

  return (
    <IssueContextProvider page="Settings">
    <div className="page">
      <div className="page-header">
        <h1>Settings</h1>
        <ReportIssueButton />
      </div>

      <div className="settings-tabs">
        {!isStudioDirector && <button className={`settings-tab ${tab === 'business' ? 'active' : ''}`} onClick={() => setTab('business')}>Business</button>}
        {!isStudioDirector && <button className={`settings-tab ${tab === 'locations' ? 'active' : ''}`} onClick={() => setTab('locations')}>Locations</button>}
        {isOwner && (
          <button className={`settings-tab ${tab === 'access' ? 'active' : ''}`} onClick={() => setTab('access')}>Access & Control</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'billing-config' ? 'active' : ''}`} onClick={() => setTab('billing-config')}>Billing Config</button>
        )}
        {(role === 'owner' || role === 'admin' || role === 'company_director') && (
          <button className={`settings-tab ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>Issues</button>
        )}
        <button className={`settings-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>My Account</button>
      </div>

      {tab === 'business' && <BusinessTab tenantId={tenantId} isOwner={isOwner} />}
      {tab === 'locations' && <LocationsConsolidatedTab isOwner={isOwner} tenantId={tenantId} />}
      {tab === 'access' && isOwner && <AccessControlTab tenantId={tenantId} />}
      {tab === 'billing-config' && isOwner && <BillingConfigTab />}
      {tab === 'issues' && <IssuesTab />}
      {tab === 'account' && <AccountTab />}
    </div>
    </IssueContextProvider>
  )
}

// ─── Collapsible Section Wrapper ─────────────────────

function CollapsibleSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', marginBottom: 16 }}>
      <button onClick={() => setOpen(!open)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4' }}>{title}</span>
        {open ? <ChevronUp size={16} style={{ color: '#8080A8' }} /> : <ChevronDown size={16} style={{ color: '#8080A8' }} />}
      </button>
      <div style={{ overflow: 'hidden', maxHeight: open ? '9999px' : '0px', transition: 'max-height 0.2s ease', marginTop: open ? 16 : 0 }}>
        {children}
      </div>
    </div>
  )
}

// ─── Account / Preferences ───────────────────────────

function AccountTab() {
  const { role, profile } = useAuthContext()
  const { replayTour } = useOnboarding()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setError(null)
    if (!currentPassword.trim()) { setError('Current password is required'); return }
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return }
    if (newPassword !== confirmPassword) { setError('New passwords do not match'); return }
    setSubmitting(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) { setError('Could not verify account'); setSubmitting(false); return }
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword })
      if (signInErr) { setError('Current password is incorrect'); setSubmitting(false); return }
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword })
      if (updateErr) throw updateErr
      toast('Password updated successfully', 'success')
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
    } catch (err: any) {
      setError(err?.message ?? 'Failed to update password')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
    color: '#E8E8FC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  }

  return (
    <div>
      <CollapsibleSection title="Profile">
        <div style={{ fontSize: 13, color: '#A0A0C8' }}>
          <div style={{ marginBottom: 6 }}><span style={{ color: '#606088', fontWeight: 600 }}>Name:</span> {profile?.first_name} {profile?.last_name}</div>
          <div style={{ marginBottom: 6 }}><span style={{ color: '#606088', fontWeight: 600 }}>Email:</span> {profile?.email}</div>
          <div><span style={{ color: '#606088', fontWeight: 600 }}>Role:</span> <span style={{ textTransform: 'capitalize' }}>{(role ?? '').replace('_', ' ')}</span></div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Change Password">
        <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#A0A0C8', fontWeight: 600, marginBottom: 6 }}>Current Password</label>
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#A0A0C8', fontWeight: 600, marginBottom: 6 }}>New Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#A0A0C8', fontWeight: 600, marginBottom: 6 }}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={inputStyle} />
          </div>
          {error && <div style={{ color: '#EF4444', fontSize: 12 }}>{error}</div>}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #D4226A, #FF5500)', color: '#FFFFFF',
              fontSize: 13, fontWeight: 800, cursor: submitting ? 'wait' : 'pointer',
              justifySelf: 'start',
            }}
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </CollapsibleSection>

      {role === 'studio_director' && (
        <CollapsibleSection title="Preferences">
          <button
            onClick={() => { void replayTour() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              color: '#D4226A', fontSize: 13, fontWeight: 600, textDecoration: 'underline',
            }}
          >
            Reset & Log Out to Replay Tour →
          </button>
        </CollapsibleSection>
      )}
    </div>
  )
}

// ─── Consolidated Tabs ───────────────────────────────

function BusinessTab({ tenantId, isOwner }: { tenantId: string | null; isOwner: boolean }) {
  return (
    <div>
      <CollapsibleSection title="General">
        <GeneralTab tenantId={tenantId} />
      </CollapsibleSection>
      {isOwner && (
        <CollapsibleSection title="Branding">
          <BrandingTab tenantId={tenantId} />
        </CollapsibleSection>
      )}
    </div>
  )
}

function LocationsConsolidatedTab({ isOwner, tenantId }: { isOwner: boolean; tenantId: string | null }) {
  return (
    <div>
      <CollapsibleSection title="Locations">
        <LocationsTab isOwner={isOwner} tenantId={tenantId} />
      </CollapsibleSection>
      <CollapsibleSection title="Rooms">
        <RoomsManager />
      </CollapsibleSection>
      <CollapsibleSection title="Studio Floor Plan">
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          Drag rooms to match your physical layout
        </p>
        <FloorPlanEditor />
      </CollapsibleSection>
      <CollapsibleSection title="Teacher Locations">
        <TeacherLocationsTab />
      </CollapsibleSection>
    </div>
  )
}

function AccessControlTab({ tenantId }: { tenantId: string | null }) {
  return (
    <div>
      <CollapsibleSection title="Permissions">
        <PermissionsTab tenantId={tenantId} />
      </CollapsibleSection>
      <CollapsibleSection title="Master Control">
        <MasterControlTab />
      </CollapsibleSection>
    </div>
  )
}

function BillingConfigTab() {
  return (
    <div>
      <CollapsibleSection title="Billing Settings">
        <BillingSettingsTab />
      </CollapsibleSection>
      <CollapsibleSection title="Payment Settings">
        <PaymentsTab />
      </CollapsibleSection>
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span className="form-label" style={{ marginBottom: 0 }}>Enrollment URLs</span>
                <p style={{ fontSize: 12, color: '#686890', margin: 0 }}>
                  Each location has its own enrollment URL. Share the URL matching your location with prospective families.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {['/omaha/signup', '/gretna/signup', '/bellevue/signup', '/elkhorn/signup'].map((url) => (
                    <span key={url} style={{ fontSize: 13, color: '#E8488A' }}>{url}</span>
                  ))}
                </div>
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
      {/* Company-Wide Closures — apply to all locations */}
      <StudioClosuresManager locationId={null} />

      {isOwner && (
        <div style={{ margin: '16px 0' }}>
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

      {/* Location-Specific Closures */}
      <StudioClosuresManager locationId={loc.id} locationName={loc.name?.replace(' Music Lessons', '')} />
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

const ROLE_MATRIX = [
  {
    role: 'Owner', summary: 'Full access to everything across all locations.', color: '#D4226A',
    pages: [[true,'Dashboard — all locations'],[true,'Schedule — all locations, full control'],[true,'Students — full CRUD, all locations'],[true,'Families — full access, billing status, Square IDs'],[true,'Leads — full access, all locations'],[true,'Teachers — full access, all locations'],[true,'Billing — charge runs, refunds, full control'],[true,'Payroll — override bonus, close period'],[true,'Retention — all tabs, all locations'],[true,'Integrations — full access'],[true,'Settings — all tabs including Access & Control']] as [boolean,string][],
    actions: [[true,'Create, assign, complete, dismiss any task'],[true,'Report any issue type (bugs, display, data, features)'],[true,'View pipeline prompts on issues'],[true,"Manage issue log (won't fix, duplicate, retry, resolve)"],[true,"Change any team member's role"],[true,'Export data and reports']] as [boolean,string][],
  },
  {
    role: 'Company Director', summary: 'Nearly full access. Cannot change system settings or permissions.', color: '#FFB800',
    pages: [[true,'Dashboard — all locations'],[true,'Schedule — all locations, full control'],[true,'Students — full CRUD, all locations'],[true,'Families — view/edit contact info, change billing status'],[true,'Leads — full access, all locations'],[true,'Teachers — full access, all locations'],[true,'Billing — view and edit, cannot run charges'],[true,'Payroll — edit sessions, director pay, tips; cannot override bonus'],[true,'Retention — all tabs, all locations'],[true,'Integrations — view only'],[true,'Settings — Business, Locations, Issues tabs only'],[false,'Settings — Access & Control (hidden)'],[false,'Settings — Billing Config (hidden)']] as [boolean,string][],
    actions: [[true,'Create tasks for studio directors'],[true,'Complete and dismiss tasks'],[true,'Report bugs, display issues, data issues'],[false,'Cannot report feature requests'],[false,'Cannot view pipeline prompts'],[false,"Cannot manage issue log (won't fix, duplicate, etc.)"],[false,'Cannot change team roles']] as [boolean,string][],
  },
  {
    role: 'Studio Director', summary: 'Location-scoped access. Sees only their assigned location.', color: '#00A5E8',
    pages: [[true,'Dashboard — their location only'],[true,'Schedule — their location only'],[true,'Students — their location only, read-only'],[true,'Families — read-only'],[true,'Leads — their location only'],[true,'Teachers — their location only'],[true,'Retention — their location only'],[false,'Billing — no access'],[false,'Payroll — read-only'],[false,'Integrations — no access'],[false,'Settings — no access']] as [boolean,string][],
    actions: [[true,'Complete tasks assigned to them'],[false,'Cannot create or dismiss tasks'],[false,'Cannot report issues'],[false,'Cannot change roles']] as [boolean,string][],
  },
  {
    role: 'Teacher', summary: 'Sees only their own schedule and students.', color: '#8080A8',
    pages: [[true,'Teacher Schedule — their sessions only'],[true,'Teacher Students — their assigned students only'],[false,'Dashboard — no access'],[false,'Families — no access'],[false,'Leads — no access'],[false,'Billing — no access'],[false,'Payroll — no access'],[false,'Retention — no access'],[false,'Integrations — no access'],[false,'Settings — no access']] as [boolean,string][],
    actions: [[false,'No task access'],[false,'No issue reporting'],[false,'No administrative actions']] as [boolean,string][],
  },
  {
    role: 'Parent', summary: 'Sees only their own family and student information.', color: '#55516E',
    pages: [[true,'Parent Dashboard — their family only'],[true,'Student info — their enrolled students'],[false,'All admin pages — no access']] as [boolean,string][],
    actions: [[false,'No administrative actions']] as [boolean,string][],
  },
]

const ROLE_PILL_COLORS: Record<string, string> = { owner: '#D4226A', admin: '#FF5500', company_director: '#FFB800', studio_director: '#00A5E8', teacher: '#8080A8' }
const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', company_director: 'Company Director', studio_director: 'Studio Director', teacher: 'Teacher' }

function PermissionsTab({ tenantId }: { tenantId: string | null }) {
  const { role: myRole, profile } = useAuthContext()
  const isOwnerRole = myRole === 'owner' || myRole === 'admin'
  return (
    <div>
      <PermissionMatrix />
      {isOwnerRole && <TeamMembers tenantId={tenantId} myProfileId={profile?.id} />}
    </div>
  )
}

function PermissionMatrix() {
  const [openRole, setOpenRole] = useState<string | null>(null)
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Role Permissions</div>
      <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 16 }}>What each role can see and do.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ROLE_MATRIX.map(r => {
          const isOpen = openRole === r.role
          return (
            <div key={r.role} style={{ borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: `1px solid ${isOpen ? `${r.color}30` : 'rgba(255,255,255,0.06)'}`, overflow: 'hidden' }}>
              <button onClick={() => setOpenRole(isOpen ? null : r.role)} style={{ width: '100%', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: r.color }}>{r.role}</div>
                  <div style={{ fontSize: 12, color: '#8080A8', marginTop: 2 }}>{r.summary}</div>
                </div>
                {isOpen ? <ChevronUp size={16} style={{ color: '#8080A8' }} /> : <ChevronDown size={16} style={{ color: '#8080A8' }} />}
              </button>
              {isOpen && (
                <div style={{ padding: '0 18px 18px', borderLeft: `3px solid ${r.color}`, marginLeft: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Pages</div>
                  {r.pages.map(([ok, text], i) => (
                    <div key={i} style={{ fontSize: 12, color: ok ? '#A0A0C8' : '#55516E', padding: '3px 0', display: 'flex', gap: 6 }}><span>{ok ? '✅' : '❌'}</span><span>{text}</span></div>
                  ))}
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 12, marginBottom: 6 }}>Actions</div>
                  {r.actions.map(([ok, text], i) => (
                    <div key={i} style={{ fontSize: 12, color: ok ? '#A0A0C8' : '#55516E', padding: '3px 0', display: 'flex', gap: 6 }}><span>{ok ? '✅' : '❌'}</span><span>{text}</span></div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TeamMembers({ tenantId, myProfileId }: { tenantId: string | null; myProfileId?: string }) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [confirmModal, setConfirmModal] = useState<{ id: string; name: string; from: string; to: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const { data: members, isLoading } = useQuery({
    queryKey: ['team_members', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('id, first_name, last_name, email, role').eq('tenant_id', tenantId!).not('role', 'in', '("parent","student")').order('first_name')
      if (error) throw error
      return data ?? []
    },
  })

  const rolePriority: Record<string, number> = { owner: 0, admin: 1, company_director: 2, studio_director: 3, teacher: 4 }
  const filtered = (members ?? []).filter(m => {
    if (search) { const q = search.toLowerCase(); const n = `${m.first_name ?? ''} ${m.last_name ?? ''}`.toLowerCase(); if (!n.includes(q) && !(m.email ?? '').toLowerCase().includes(q)) return false }
    if (roleFilter === 'owners') return m.role === 'owner'
    if (roleFilter === 'directors') return ['admin', 'company_director', 'studio_director'].includes(m.role)
    if (roleFilter === 'teachers') return m.role === 'teacher'
    return true
  }).sort((a, b) => (rolePriority[a.role] ?? 9) - (rolePriority[b.role] ?? 9))

  const handleRoleChange = async () => {
    if (!confirmModal || !tenantId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('profiles').update({ role: confirmModal.to }).eq('id', confirmModal.id)
      if (error) throw error
      supabase.from('audit_log').insert({ tenant_id: tenantId, action: 'ROLE_CHANGED', table_name: 'profiles', record_id: confirmModal.id, old_value: { role: confirmModal.from }, new_value: { role: confirmModal.to }, performed_by: myProfileId }).then(() => {}).catch((err: any) => console.error('[audit_log] insert failed:', err))
      qc.invalidateQueries({ queryKey: ['team_members'] })
      qc.invalidateQueries({ queryKey: ['teachers'] })
      toast(`${confirmModal.name}'s role updated to ${ROLE_LABELS[confirmModal.to] ?? confirmModal.to}`, 'success')
      setConfirmModal(null)
    } catch (err: any) { toast(err.message ?? 'Failed to change role', 'error') }
    finally { setSaving(false) }
  }

  const availableRoles = ['owner', 'admin', 'company_director', 'studio_director', 'teacher']

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Team Members</div>
      <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 16 }}>Assign roles to your team. {filtered.length} team members</div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or email..." style={{ flex: 1, minWidth: 200, padding: '8px 14px', borderRadius: 10, fontSize: 13, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#E0E0F4', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 4 }}>
          {[['all','All'],['owners','Owners'],['directors','Directors'],['teachers','Teachers']].map(([k,l]) => (
            <button key={k} onClick={() => setRoleFilter(k)} style={{ padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer', background: roleFilter === k ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)', color: roleFilter === k ? '#D4226A' : '#8080A8', border: roleFilter === k ? '1px solid rgba(212,34,106,0.25)' : '1px solid rgba(255,255,255,0.06)' }}>{l}</button>
          ))}
        </div>
      </div>
      {isLoading ? <MusicLoader /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(m => {
            const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unnamed'
            const isMe = m.id === myProfileId
            const pillColor = ROLE_PILL_COLORS[m.role] ?? '#8080A8'
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{name}{isMe && <span style={{ fontSize: 10, color: '#55516E', marginLeft: 6 }}>(you)</span>}</div>
                  <div style={{ fontSize: 11, color: '#55516E' }}>{m.email ?? '—'}</div>
                </div>
                <select value={m.role} disabled={isMe} title={isMe ? 'You cannot change your own role' : undefined}
                  onChange={e => { const nr = e.target.value; if (nr === m.role) return; setConfirmModal({ id: m.id, name, from: m.role, to: nr }); e.target.value = m.role }}
                  style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: isMe ? 'not-allowed' : 'pointer', background: `${pillColor}18`, color: pillColor, border: `1px solid ${pillColor}30`, outline: 'none', opacity: isMe ? 0.5 : 1 }}>
                  {availableRoles.map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
                </select>
              </div>
            )
          })}
        </div>
      )}
      {confirmModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setConfirmModal(null)}>
          <div onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: 420, padding: 24, borderRadius: 16, background: '#12121E', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4', marginBottom: 12 }}>Change Role</div>
            <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 6 }}><strong style={{ color: '#E0E0F4' }}>{confirmModal.name}</strong></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${ROLE_PILL_COLORS[confirmModal.from] ?? '#8080A8'}18`, color: ROLE_PILL_COLORS[confirmModal.from] ?? '#8080A8' }}>{ROLE_LABELS[confirmModal.from]}</span>
              <span style={{ color: '#55516E' }}>→</span>
              <span style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${ROLE_PILL_COLORS[confirmModal.to] ?? '#8080A8'}18`, color: ROLE_PILL_COLORS[confirmModal.to] ?? '#8080A8' }}>{ROLE_LABELS[confirmModal.to]}</span>
            </div>
            {confirmModal.to === 'owner' && <div style={{ fontSize: 12, color: '#FFB800', marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,184,0,0.06)', border: '1px solid rgba(255,184,0,0.15)' }}>Owners have full unrestricted access to everything.</div>}
            {confirmModal.to === 'teacher' && ['owner','admin','company_director'].includes(confirmModal.from) && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>This will remove {confirmModal.name}'s administrative access. They will only see their own schedule and students.</div>}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmModal(null)} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, background: 'none', color: '#8080A8', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleRoleChange} disabled={saving} style={{ padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#D4226A', color: '#fff', border: 'none', opacity: saving ? 0.5 : 1 }}>{saving ? 'Saving...' : 'Confirm Change'}</button>
            </div>
          </div>
        </div>
      )}
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

// ═══════════════════════════════════════════════════════
// ISSUES TAB
// ═══════════════════════════════════════════════════════

function IssuesTab() {
  const { role } = useAuthContext()
  const isOwner = role === 'owner' || role === 'admin'
  const [statusFilter, setStatusFilter] = useState<StatusGroup>('open')
  const { data: issues, isLoading } = useIssues(statusFilter)
  const totalCount = issues?.length ?? 0
  const openCount = issues?.filter(i => ['reported', 'queued', 'diagnosing', 'fixing', 'deploying'].includes(i.status)).length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <IssueReportForm isOwner={isOwner} />

      {/* Issue Log */}
      <div style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Issue Log</div>
          <div style={{ fontSize: 12, color: '#8080A8' }}>{totalCount} issues{statusFilter === 'open' ? '' : ` · ${openCount} open`}</div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {([['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved'], ['failed', 'Failed'], ['wont_fix', "Won't Fix"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setStatusFilter(key)} style={{
              padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: statusFilter === key ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.03)',
              color: statusFilter === key ? '#D4226A' : '#8080A8',
              border: statusFilter === key ? '1px solid rgba(212,34,106,0.25)' : '1px solid rgba(255,255,255,0.06)',
            }}>{label}</button>
          ))}
        </div>

        {isLoading ? <MusicLoader /> : !issues?.length ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#55516E', fontSize: 13 }}>No issues found.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {issues.map(issue => <IssueRow key={issue.id} issue={issue} isOwner={isOwner} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Report Form ─────────────────────────────────────

function IssueReportForm({ isOwner }: { isOwner: boolean }) {
  const { tenantId: formTenantId } = useAuthContext()
  const createIssue = useCreateIssue()
  const [title, setTitle] = useState('')
  const [page, setPage] = useState('')
  const [section, setSection] = useState('')
  const [subsection, setSubsection] = useState('')
  const [otherPage, setOtherPage] = useState('')
  const [otherSection, setOtherSection] = useState('')
  const [otherSubsection, setOtherSubsection] = useState('')
  const [element, setElement] = useState('')
  const [platform, setPlatform] = useState('both')
  const [category, setCategory] = useState('')
  const [severity, setSeverity] = useState('normal')
  const [desc, setDesc] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicateWarning, setDuplicateWarning] = useState<{ id: string; title: string } | null>(null)
  const [duplicateChecked, setDuplicateChecked] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const categories = isOwner ? CATEGORIES : CATEGORIES.filter(c => c.value !== 'feature_request')
  const selectedSeverity = SEVERITIES.find(s => s.value === severity)

  const sections = getSectionsForPage(page)
  const subsections = getSubsectionsForSection(page, section)
  const hasSubsections = subsections !== null && subsections.length > 0

  const clearForm = () => {
    setTitle(''); setPage(''); setSection(''); setSubsection('')
    setOtherPage(''); setOtherSection(''); setOtherSubsection('')
    setPlatform('both'); setElement('')
    setCategory(''); setSeverity('normal'); setDesc('')
    setFile(null); setPreview(null)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 5 * 1024 * 1024) { toast('Screenshot must be under 5MB', 'error'); return }
    setFile(f)
    const reader = new FileReader()
    reader.onload = () => setPreview(reader.result as string)
    reader.readAsDataURL(f)
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast('Title is required', 'error'); return }
    if (!page) { toast('Select a page', 'error'); return }
    if (page === 'Other' && !otherPage.trim()) { toast('Describe the page', 'error'); return }
    if (!section) { toast('Select a section', 'error'); return }
    if (section === 'Other' && !otherSection.trim()) { toast('Describe the section', 'error'); return }
    if (hasSubsections && subsection === 'Other' && !otherSubsection.trim()) { toast('Describe the subsection', 'error'); return }
    if (!element.trim()) { toast('Describe the element', 'error'); return }
    if (!category) { toast('Select a category', 'error'); return }
    if (desc.trim().length < 20) { toast('Description must be at least 20 characters', 'error'); return }

    // "Other" saves as just "Other" — the user's typed description goes into element_description
    const finalPage = page === 'Other' ? 'Other' : page
    const finalSection = section === 'Other' ? 'Other' : section
    const finalSubsection = !hasSubsections ? null
      : subsection === 'Other' ? 'Other'
      : subsection || null

    // Build element_description with any "Other" context
    const otherContext = [
      page === 'Other' && otherPage.trim() ? `Page: ${otherPage.trim()}` : '',
      section === 'Other' && otherSection.trim() ? `Section: ${otherSection.trim()}` : '',
      subsection === 'Other' && otherSubsection.trim() ? `Subsection: ${otherSubsection.trim()}` : '',
    ].filter(Boolean).join('; ')
    const fullElement = otherContext
      ? `${element.trim()}${element.trim() ? ' — ' : ''}${otherContext}`
      : element.trim()

    // Check for duplicates (soft warning, never blocks)
    if (!duplicateChecked && formTenantId && finalPage) {
      setIsSubmitting(true)
      try {
        const dup = await checkForDuplicateIssue(formTenantId, finalPage, desc.trim())
        if (dup) {
          setDuplicateWarning(dup)
          setIsSubmitting(false)
          return
        }
      } catch {
        // If duplicate check fails, proceed
      }
      setIsSubmitting(false)
    }

    setIsSubmitting(true)
    try {
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out — please try again')), 15000))
      await Promise.race([
        createIssue.mutateAsync({
          title: title.trim(), page: finalPage, section: finalSection, subsection: finalSubsection,
          platform, element_description: fullElement,
          category, severity, description: desc.trim(), screenshotFile: file,
        }),
        timeout,
      ])
      toast('Issue reported — fix pipeline activated', 'success')
      clearForm()
      setDuplicateWarning(null)
      setDuplicateChecked(false)
    } catch (err: any) {
      toast(err.message ?? 'Failed to submit issue', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
    color: '#E0E0F4', outline: 'none',
  }
  const disabledStyle: React.CSSProperties = { ...inputStyle, opacity: 0.4, cursor: 'not-allowed' }

  return (
    <div style={{ padding: '20px 22px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>Report an Issue</div>
      <div style={{ fontSize: 12, color: '#8080A8', marginBottom: 18 }}>Describe what's wrong and we'll fix it.</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Title */}
        <div>
          <input value={title} onChange={e => setTitle(e.target.value.slice(0, 100))} maxLength={100} placeholder="Brief summary of the issue" style={inputStyle} />
          <div style={{ fontSize: 11, marginTop: 4, color: (100 - title.length) === 0 ? '#D4226A' : (100 - title.length) < 20 ? '#FF5500' : '#55516E' }}>{100 - title.length} characters remaining</div>
        </div>

        {/* Page → Section → Subsection cascade */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Where is the issue?</div>
          <select value={page} onChange={e => { setPage(e.target.value); setSection(''); setSubsection(''); setOtherPage(''); setOtherSection(''); setOtherSubsection('') }} style={inputStyle}>
            <option value="">Select page...</option>
            {PAGES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {page === 'Other' && (
            <input value={otherPage} onChange={e => setOtherPage(e.target.value.slice(0, 100))} maxLength={100} placeholder="Describe the page..." style={{ ...inputStyle, borderColor: 'rgba(251,146,60,0.3)' }} />
          )}
          <select value={section} onChange={e => { setSection(e.target.value); setSubsection(''); setOtherSection(''); setOtherSubsection('') }} disabled={!page} style={page ? inputStyle : disabledStyle}>
            <option value="">Select section...</option>
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {section === 'Other' && (
            <input value={otherSection} onChange={e => setOtherSection(e.target.value.slice(0, 100))} maxLength={100} placeholder="Describe the section..." style={{ ...inputStyle, borderColor: 'rgba(251,146,60,0.3)' }} />
          )}
          {hasSubsections && (
            <select value={subsection} onChange={e => { setSubsection(e.target.value); setOtherSubsection('') }} style={inputStyle}>
              <option value="">Select subsection (optional)...</option>
              {subsections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {hasSubsections && subsection === 'Other' && (
            <input value={otherSubsection} onChange={e => setOtherSubsection(e.target.value.slice(0, 100))} maxLength={100} placeholder="Describe the subsection..." style={{ ...inputStyle, borderColor: 'rgba(251,146,60,0.3)' }} />
          )}
        </div>

        {/* Platform */}
        <div>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Platform</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[{ value: 'mobile', label: 'Mobile' }, { value: 'desktop', label: 'Desktop' }, { value: 'both', label: 'Both' }].map(p => (
              <button key={p.value} onClick={() => setPlatform(p.value)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: platform === p.value ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
                color: platform === p.value ? '#E0E0F4' : '#8080A8',
                border: `1px solid ${platform === p.value ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)'}`,
              }}>{p.label}</button>
            ))}
          </div>
        </div>

        {/* Element */}
        <div>
          <input value={element} onChange={e => setElement(e.target.value.slice(0, 200))} maxLength={200} placeholder="Which specific element? (e.g. the Save button, the name column)" style={inputStyle} />
          <div style={{ fontSize: 11, marginTop: 4, color: (200 - element.length) === 0 ? '#D4226A' : (200 - element.length) < 20 ? '#FF5500' : '#55516E' }}>{200 - element.length} characters remaining</div>
        </div>

        {/* Category dropdown */}
        <CategoryDropdown categories={categories} value={category} onChange={setCategory} />

        {/* Severity pills */}
        <div>
          <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Severity</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {SEVERITIES.map(s => (
              <button key={s.value} onClick={() => setSeverity(s.value)} style={{
                padding: '5px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: severity === s.value ? `${s.color}18` : 'rgba(255,255,255,0.03)',
                color: severity === s.value ? s.color : '#8080A8',
                border: `1px solid ${severity === s.value ? `${s.color}30` : 'rgba(255,255,255,0.06)'}`,
              }}>{s.label}</button>
            ))}
          </div>
          {selectedSeverity && <div style={{ fontSize: 11, color: '#55516E', marginTop: 4 }}>{selectedSeverity.hint}</div>}
        </div>

        {/* Description */}
        <div>
          <textarea value={desc} onChange={e => setDesc(e.target.value.slice(0, 1500))} maxLength={1500} placeholder="What were you doing? What happened? What should have happened? The more detail you provide, the faster we can fix it." rows={6} style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }} />
          <div style={{ fontSize: 11, marginTop: 4, color: (1500 - desc.length) === 0 ? '#D4226A' : (1500 - desc.length) < 100 ? '#FF5500' : '#55516E' }}>{1500 - desc.length} characters remaining</div>
        </div>

        {/* Screenshot */}
        <div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} style={{ display: 'none' }} />
          {!preview ? (
            <button onClick={() => fileRef.current?.click()} style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)', color: '#8080A8', border: '1px solid rgba(255,255,255,0.08)',
            }}>📷 Add Screenshot</button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src={preview} alt="Screenshot" style={{ height: 48, borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)' }} />
              <button onClick={() => { setFile(null); setPreview(null) }} style={{
                background: 'none', border: 'none', color: '#EF4444', fontSize: 16, cursor: 'pointer',
              }}>✕</button>
            </div>
          )}
        </div>

        {/* Duplicate Warning */}
        {duplicateWarning && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.25)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#D97706', marginBottom: 4 }}>Possible duplicate</div>
            <div style={{ fontSize: 11, color: '#D4C5A0', lineHeight: 1.4, marginBottom: 10 }}>
              This may be similar to: <strong>"{duplicateWarning.title}"</strong>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setDuplicateWarning(null); setDuplicateChecked(true); handleSubmit() }} disabled={isSubmitting} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(217,119,6,0.15)', border: '1px solid rgba(217,119,6,0.3)', color: '#D97706',
              }}>{isSubmitting ? 'Submitting...' : 'Submit Anyway'}</button>
              <button onClick={() => setDuplicateWarning(null)} style={{
                padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#A0A0C8',
              }}>Edit Report</button>
            </div>
          </div>
        )}

        {/* Actions */}
        {!duplicateWarning && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={clearForm} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', color: '#8080A8', border: 'none' }}>Cancel</button>
            <button onClick={handleSubmit} disabled={isSubmitting} style={{
              padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: '#D4226A', color: '#fff', border: 'none', opacity: isSubmitting ? 0.5 : 1,
            }}>{isSubmitting ? 'Submitting...' : 'Submit Issue'}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Issue Row (expandable) ─────────────────────────

function IssueRow({ issue, isOwner }: { issue: any; isOwner: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [actionModal, setActionModal] = useState<string | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [promptOpen, setPromptOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const updateIssue = useUpdateIssue()
  const { data: screenshotUrl } = useScreenshotUrl(issue.screenshot_path)
  const [lightbox, setLightbox] = useState(false)

  const statusColor = STATUS_COLORS[issue.status] ?? '#55516E'
  const isPulsing = ['diagnosing', 'fixing'].includes(issue.status)
  const catMeta = CATEGORIES.find(c => c.value === issue.category)
  const sevMeta = SEVERITIES.find(s => s.value === issue.severity)

  const timeAgo = (d: string) => {
    const diff = (Date.now() - new Date(d).getTime()) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const handleAction = async (action: string) => {
    try {
      if (action === 'wont_fix') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'wont_fix', resolution_notes: actionNotes, resolved_at: new Date().toISOString(), resolved_by: 'admin' })
      } else if (action === 'resolve') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'resolved', resolution_notes: actionNotes, resolved_at: new Date().toISOString(), resolved_by: 'admin' })
      } else if (action === 'retry') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'reported', resolution_notes: null, pipeline_prompt: null, pipeline_started_at: null, pipeline_completed_at: null, deploy_status: 'pending' })
      } else if (action === 'duplicate') {
        await updateIssue.mutateAsync({ id: issue.id, status: 'duplicate', resolution_notes: actionNotes })
      }
      toast(`Issue updated`, 'success')
      setActionModal(null)
      setActionNotes('')
    } catch (err: any) {
      toast(err.message ?? 'Failed', 'error')
    }
  }

  return (
    <>
      <div onClick={() => setExpanded(!expanded)} style={{
        padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
        transition: 'border-color 0.2s',
      }}>
        {/* Collapsed */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0,
            ...(isPulsing ? { animation: 'issue-pulse 1.5s infinite' } : {}),
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{issue.title}</div>
            <div style={{ fontSize: 11, color: '#55516E', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span>{issue.page} → {issue.section}{issue.subsection ? ` → ${issue.subsection}` : ''}</span>
              {catMeta && <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 700, background: `${catMeta.color}15`, color: catMeta.color }}>{catMeta.pillLabel}</span>}
            </div>
          </div>
          {sevMeta && sevMeta.value !== 'normal' && (
            <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 9, fontWeight: 700, background: `${sevMeta.color}15`, color: sevMeta.color }}>{sevMeta.label}</span>
          )}
          <div style={{ fontSize: 10, color: '#55516E', textAlign: 'right', flexShrink: 0 }}>
            <div>{issue.reporter_name?.split(' ')[0]}</div>
            <div>{timeAgo(issue.created_at)}</div>
          </div>
        </div>

        {/* Expanded */}
        {expanded && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.05)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, color: '#A0A0C8', lineHeight: 1.65, marginBottom: 10 }}>{issue.description}</div>
            <div style={{ fontSize: 11, color: '#55516E', marginBottom: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div><strong style={{ color: '#8080A8' }}>Element:</strong> {issue.element_description}</div>
              {issue.platform && <div><strong style={{ color: '#8080A8' }}>Platform:</strong> {issue.platform === 'both' ? 'Both' : issue.platform === 'mobile' ? 'Mobile' : 'Desktop'}</div>}
              {issue.reported_from_url && <div><strong style={{ color: '#8080A8' }}>Reported from:</strong> {issue.reported_from_url}</div>}
              {issue.reported_screen_width && issue.reported_screen_height && <div><strong style={{ color: '#8080A8' }}>Screen:</strong> {issue.reported_screen_width} × {issue.reported_screen_height}px</div>}
            </div>

            {screenshotUrl && (
              <div style={{ marginBottom: 10 }}>
                <img src={screenshotUrl} alt="Screenshot" onClick={() => setLightbox(true)} style={{ maxHeight: 80, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.08)' }} />
              </div>
            )}

            {issue.status === 'resolved' && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#22C55E', marginBottom: 3 }}>Resolved</div>
                {issue.resolution_notes && <div style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.5 }}>{issue.resolution_notes}</div>}
                <div style={{ fontSize: 10, color: '#55516E', marginTop: 4 }}>
                  {issue.resolved_at && timeAgo(issue.resolved_at)} by {issue.resolved_by === 'system:claude_code' ? 'Auto-fix pipeline' : issue.resolved_by ?? 'admin'}
                </div>
              </div>
            )}

            {issue.status === 'failed_build' && (
              <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#EF4444', marginBottom: 3 }}>Build failed — awaiting manual review</div>
                {issue.resolution_notes && <div style={{ fontSize: 12, color: '#A0A0C8', lineHeight: 1.5, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{issue.resolution_notes}</div>}
              </div>
            )}

            {isOwner && issue.pipeline_prompt && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setPromptOpen(!promptOpen)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  color: '#8080A8', display: 'flex', alignItems: 'center', gap: 4, padding: 0,
                }}>
                  {promptOpen ? '▾' : '▸'} View Pipeline Prompt
                </button>
                {promptOpen && (
                  <div style={{ marginTop: 6, position: 'relative' }}>
                    <button onClick={() => {
                      navigator.clipboard.writeText(issue.pipeline_prompt!)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }} style={{
                      position: 'absolute', top: 6, right: 6, padding: '3px 10px', borderRadius: 6,
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      background: copied ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.06)',
                      color: copied ? '#22C55E' : '#8080A8',
                      border: `1px solid ${copied ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'}`,
                    }}>{copied ? 'Copied!' : 'Copy to Clipboard'}</button>
                    <pre style={{
                      fontSize: 11, lineHeight: 1.5, color: '#A0A0C8', fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      padding: '12px 14px', borderRadius: 8, maxHeight: 400, overflowY: 'auto',
                      background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>{issue.pipeline_prompt}</pre>
                  </div>
                )}
              </div>
            )}

            {isOwner && (
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                {!['resolved', 'wont_fix', 'duplicate'].includes(issue.status) && (
                  <>
                    <button onClick={() => setActionModal('wont_fix')} style={actionBtnStyle}>Won't Fix</button>
                    <button onClick={() => setActionModal('duplicate')} style={actionBtnStyle}>Duplicate</button>
                    <button onClick={() => setActionModal('retry')} style={actionBtnStyle}>Retry Pipeline</button>
                    <button onClick={() => setActionModal('resolve')} style={actionBtnStyle}>Resolve Manually</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Screenshot lightbox */}
      {lightbox && screenshotUrl && (
        <div onClick={() => setLightbox(false)} style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <img src={screenshotUrl} alt="Full screenshot" style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10 }} />
        </div>
      )}

      {/* Action modal */}
      {actionModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => { setActionModal(null); setActionNotes('') }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '90%', maxWidth: 420, padding: 24, borderRadius: 16,
            background: '#12121E', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4', marginBottom: 12 }}>
              {actionModal === 'wont_fix' && "Mark as Won't Fix"}
              {actionModal === 'duplicate' && 'Mark as Duplicate'}
              {actionModal === 'retry' && 'Retry Pipeline'}
              {actionModal === 'resolve' && 'Resolve Manually'}
            </div>

            {actionModal === 'retry' ? (
              <div style={{ fontSize: 13, color: '#A0A0C8', marginBottom: 16 }}>Re-send this issue to the fix pipeline?</div>
            ) : (
              <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder={actionModal === 'duplicate' ? 'Which issue is this a duplicate of?' : 'Resolution notes...'} rows={3} style={{
                width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13,
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#E0E0F4', outline: 'none', resize: 'vertical', marginBottom: 16,
              }} />
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button onClick={() => { setActionModal(null); setActionNotes('') }} style={{ padding: '8px 18px', borderRadius: 8, fontSize: 12, background: 'none', color: '#8080A8', border: 'none', cursor: 'pointer' }}>Cancel</button>
              <button onClick={() => handleAction(actionModal)} disabled={updateIssue.isPending || (actionModal !== 'retry' && !actionNotes.trim())} style={{
                padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: actionModal === 'wont_fix' ? '#55516E' : '#D4226A', color: '#fff', border: 'none',
                opacity: updateIssue.isPending || (actionModal !== 'retry' && !actionNotes.trim()) ? 0.4 : 1,
              }}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function CategoryDropdown({ categories, value, onChange }: { categories: readonly { value: string; label: string; helper: string; color: string }[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = categories.find(c => c.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div style={{ fontSize: 11, color: '#8080A8', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Category</div>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, fontSize: 13, textAlign: 'left',
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
        color: selected ? '#E0E0F4' : '#55516E', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{selected ? selected.label : 'What kind of issue is this?'}</span>
        <ChevronDown size={14} style={{ color: '#55516E', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
          background: '#12121E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden',
        }}>
          {categories.map(c => (
            <button key={c.value} onClick={() => { onChange(c.value); setOpen(false) }} style={{
              display: 'block', width: '100%', padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
              background: value === c.value ? 'rgba(255,255,255,0.04)' : 'transparent', border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
              onMouseLeave={e => e.currentTarget.style.background = value === c.value ? 'rgba(255,255,255,0.04)' : 'transparent'}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: '#E0E0F4' }}>{c.label}</div>
              <div style={{ fontSize: 11, color: '#55516E', marginTop: 2 }}>{c.helper}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
  cursor: 'pointer', background: 'rgba(255,255,255,0.03)', color: '#8080A8',
  border: '1px solid rgba(255,255,255,0.06)',
}
