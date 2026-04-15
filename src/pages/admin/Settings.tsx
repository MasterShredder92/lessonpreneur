import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations, useCreateLocation, useUpdateLocation } from '../../hooks/useLocations'
import { useTeacherOverview } from '../../hooks/useTeacherOverview'
import { useTeacherLocations, useToggleTeacherLocation, useToggleSubAvailable } from '../../hooks/useTeacherLocations'
import { supabase } from '../../lib/supabase'
import { Upload, Check, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { toast } from '../../components/shared/Toast'
import type { Location } from '../../lib/types'
import { useTenantBilling, useCreateCheckout, useCustomerPortal } from '../../hooks/useTenantBilling'
import { useStripeConnectStatus, useStripeConnectOnboard } from '../../hooks/useStripeConnect'
import { getTierByKey, TRIAL_DAYS } from '../../lib/pricing'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'
import { useOnboarding } from '../../contexts/OnboardingContext'
import { qk } from '../../lib/queryKeys'

const PerformancePage = lazy(() => import('./Performance'))
const SettingsIssuesTab = lazy(() => import('./SettingsIssuesTab'))
const RoomsManager = lazy(() => import('../../components/rooms/RoomsManager'))
const StudioClosuresManager = lazy(() => import('../../components/admin/StudioClosuresManager'))
const DataGrid = lazy(() => import('../../components/shared/DataGrid'))

/** Tiny route-chunk / lazy-child placeholder — not a spinner */
function LazyChunkPlaceholder() {
  return <div style={{ minHeight: 48, borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }} aria-hidden />
}

interface LocationFormData {
  name: string; address: string; city: string; state: string; zip: string
  phone: string; email: string; website: string; google_review_url: string
}

const emptyForm: LocationFormData = {
  name: '', address: '', city: '', state: 'NE', zip: '',
  phone: '', email: '', website: '', google_review_url: '',
}

type Tab = 'business' | 'locations' | 'access' | 'billing-config' | 'issues' | 'performance' | 'account'

// Map old tab names to new ones for bookmark compatibility
const TAB_REDIRECTS: Record<string, Tab> = {
  general: 'business', branding: 'business',
  rooms: 'locations', 'teacher-locations': 'locations',
  permissions: 'access', 'master-control': 'access',
  billing: 'billing-config', payments: 'billing-config',
  integrations: 'business', // integrations removed from settings
}

const VALID_TABS: Tab[] = ['business', 'locations', 'access', 'billing-config', 'issues', 'performance', 'account']

export default function Settings() {
  const { role, tenantId } = useAuthContext()
  const isOwner = role === 'owner'
  const canManageAccess = role === 'owner' || role === 'admin' || role === 'company_director'
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
        {canManageAccess && (
          <button className={`settings-tab ${tab === 'access' ? 'active' : ''}`} onClick={() => setTab('access')}>Access & Control</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'billing-config' ? 'active' : ''}`} onClick={() => setTab('billing-config')}>Billing Config</button>
        )}
        {(role === 'owner' || role === 'admin' || role === 'company_director') && (
          <button className={`settings-tab ${tab === 'issues' ? 'active' : ''}`} onClick={() => setTab('issues')}>Issues</button>
        )}
        {isOwner && (
          <button className={`settings-tab ${tab === 'performance' ? 'active' : ''}`} onClick={() => setTab('performance')}>SPEED</button>
        )}
        <button className={`settings-tab ${tab === 'account' ? 'active' : ''}`} onClick={() => setTab('account')}>My Account</button>
      </div>

      <div style={{ minHeight: 'min(72vh, 640px)' }}>
      {tab === 'business' && <BusinessTab tenantId={tenantId} isOwner={isOwner} />}
      {tab === 'locations' && <LocationsConsolidatedTab isOwner={isOwner} tenantId={tenantId} />}
      {tab === 'access' && canManageAccess && <AccessControlTab tenantId={tenantId} />}
      {tab === 'billing-config' && isOwner && <BillingConfigTab />}
      {tab === 'issues' && (
        <Suspense fallback={<LazyChunkPlaceholder />}>
          <SettingsIssuesTab />
        </Suspense>
      )}
      {tab === 'performance' && isOwner && (
        <Suspense fallback={<LazyChunkPlaceholder />}>
          <PerformancePage />
        </Suspense>
      )}
      {tab === 'account' && <AccountTab />}
      </div>
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
        <Suspense fallback={<LazyChunkPlaceholder />}>
          <RoomsManager />
        </Suspense>
      </CollapsibleSection>
      <CollapsibleSection title="Teacher Locations">
        <TeacherLocationsTab />
      </CollapsibleSection>
    </div>
  )
}

function AccessControlTab({ tenantId }: { tenantId: string | null }) {
  const { role } = useAuthContext()
  const isOwner = role === 'owner'
  return (
    <div>
      <CollapsibleSection title="Permissions">
        <PermissionsTab tenantId={tenantId} />
      </CollapsibleSection>
      {isOwner && (
        <CollapsibleSection title="Master Control">
          <MasterControlTab />
        </CollapsibleSection>
      )}
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

      {/* DataGrid overlay — heavy spreadsheet editor in its own chunk */}
      {showGrid && (
        <Suspense fallback={<LazyChunkPlaceholder />}>
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
        </Suspense>
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

  const { data: tenant, isLoading, isError } = useQuery({
    queryKey: [...qk.tenant.settings, tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, timezone, logo_url, primary_color, accent_color')
        .eq('id', tenantId!)
        .single()
      if (error) throw error
      return data
    },
  })

  const updateTenant = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      const { error } = await supabase.from('tenants').update(updates).eq('id', tenantId!)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tenant.settings })
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

  const ready = !!tenant
  const t = tenant ?? {
    name: '',
    slug: '',
    timezone: 'America/Chicago',
    logo_url: null as string | null,
    primary_color: null as string | null,
    accent_color: null as string | null,
  }

  if (!tenantId) {
    return <div style={{ color: '#8080A8', marginTop: 16 }}>Unable to load tenant.</div>
  }
  if (!isLoading && (isError || !tenant)) {
    return <div style={{ color: '#EF4444', marginTop: 16 }}>Could not load business settings.</div>
  }

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }} aria-busy={!ready}>
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
            {t.logo_url ? (
              <img
                src={t.logo_url}
                alt="Logo"
                decoding="async"
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
                {t.name?.[0] ?? 'L'}
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
            <button
              className="btn-outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading || !ready}
              style={{ fontSize: 11, padding: '5px 12px' }}
            >
              <Upload size={12} />
              {uploading ? 'Uploading...' : t.logo_url ? 'Change Logo' : 'Upload Logo'}
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
                <span style={{ fontSize: 18, fontWeight: 700, color: '#FFFFFF' }}>{t.name || '\u00A0'}</span>
                <button className="btn-ghost" onClick={() => { setNameEdit(t.name); setEditing(true) }} disabled={!ready} style={{ fontSize: 11, padding: '3px 8px' }}>Edit</button>
              </div>
            )}

            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span className="form-label" style={{ minWidth: 70, marginBottom: 0, paddingTop: 2 }}>Timezone</span>
                <select
                  className="form-input"
                  value={t.timezone ?? 'America/Chicago'}
                  onChange={(e) => updateTenant.mutate({ timezone: e.target.value })}
                  disabled={!ready}
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
                <span style={{ fontSize: 13, color: '#686890' }}>{t.slug || '—'}</span>
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
          <div style={{ width: 32, height: 32, borderRadius: 8, background: t.primary_color || '#D4226A', border: '1px solid rgba(255,255,255,0.1)' }} />
          <div style={{ width: 32, height: 32, borderRadius: 8, background: t.accent_color || '#FF5500', border: '1px solid rgba(255,255,255,0.1)' }} />
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

  if (isLoading) {
    return (
      <div style={{ marginTop: 16 }} aria-busy>
        <LazyChunkPlaceholder />
      </div>
    )
  }

  return (
    <div style={{ marginTop: '16px' }}>
      {/* Company-Wide Closures — apply to all locations */}
      <Suspense fallback={<LazyChunkPlaceholder />}>
        <StudioClosuresManager locationId={null} />
      </Suspense>

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
      qc.invalidateQueries({ queryKey: qk.locations.all })
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
      <Suspense fallback={<LazyChunkPlaceholder />}>
        <StudioClosuresManager locationId={loc.id} locationName={loc.name?.replace(' Music Lessons', '')} />
      </Suspense>
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
    queryKey: qk.locations.hours(locationId),
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
      qc.invalidateQueries({ queryKey: qk.locations.hours(locationId) })
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
  const { data: teachers, isPending: loadingTeachers } = useTeacherOverview()
  const { data: locations, isLoading: loadingLocations } = useLocations()

  if (loadingTeachers || loadingLocations) {
    return (
      <div style={{ marginTop: 16 }} aria-busy>
        <LazyChunkPlaceholder />
      </div>
    )
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
          <span style={{ fontSize: 11, color: (teacher.sub_available ?? teacher.is_sub_available) ? '#22C55E' : '#4C4C74', fontWeight: 600 }}>
            Sub Available
          </span>
          <div
            onClick={() => toggleSub.mutate({ teacher_id: teacher.id, sub_available: !!(teacher.sub_available ?? teacher.is_sub_available) })}
            style={{
              width: 36, height: 20, borderRadius: 10,
              background: (teacher.sub_available ?? teacher.is_sub_available) ? '#22C55E' : 'rgba(255,255,255,0.1)',
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
              left: (teacher.sub_available ?? teacher.is_sub_available) ? 18 : 2,
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
    pages: [[true,'Dashboard — all locations'],[true,'Schedule — all locations, full control'],[true,'Students — full CRUD, all locations'],[true,'Families — view/edit contact info, change billing status'],[true,'Leads — full access, all locations'],[true,'Teachers — full access, all locations'],[true,'Billing — view and edit, cannot run charges'],[true,'Payroll — edit sessions, director pay, tips; cannot override bonus'],[true,'Retention — all tabs, all locations'],[true,'Integrations — view only'],[true,'Settings — Business, Locations, Issues, Access & Control tabs'],[false,'Settings — Billing Config (hidden)']] as [boolean,string][],
    actions: [[true,'Create tasks for studio directors'],[true,'Complete and dismiss tasks'],[true,'Report bugs, display issues, data issues'],[true,'Assign studio director and teacher roles'],[false,'Cannot report feature requests'],[false,'Cannot view pipeline prompts'],[false,"Cannot manage issue log (won't fix, duplicate, etc.)"],[false,'Cannot change owner, admin, or company director roles']] as [boolean,string][],
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
  const canManageTeam = myRole === 'owner' || myRole === 'admin' || myRole === 'company_director'
  return (
    <div>
      <PermissionMatrix />
      {canManageTeam && <TeamMembers tenantId={tenantId} myProfileId={profile?.id} myRole={myRole} />}
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

function TeamMembers({ tenantId, myProfileId, myRole }: { tenantId: string | null; myProfileId?: string; myRole?: string }) {
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
      supabase.from('audit_log').insert({ tenant_id: tenantId, action: 'ROLE_CHANGED', table_name: 'profiles', record_id: confirmModal.id, old_value: { role: confirmModal.from }, new_value: { role: confirmModal.to }, performed_by: myProfileId }).then(() => {}).catch(() => {})
      qc.invalidateQueries({ queryKey: qk.team.members })
      qc.invalidateQueries({ queryKey: qk.teachers.all })
      toast(`${confirmModal.name}'s role updated to ${ROLE_LABELS[confirmModal.to] ?? confirmModal.to}`, 'success')
      setConfirmModal(null)
    } catch (err: any) { toast(err.message ?? 'Failed to change role', 'error') }
    finally { setSaving(false) }
  }

  const isOwnerOrAdmin = myRole === 'owner' || myRole === 'admin'
  const availableRoles = isOwnerOrAdmin
    ? ['owner', 'admin', 'company_director', 'studio_director', 'teacher']
    : ['studio_director', 'teacher']

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
      {isLoading ? (
        <div aria-busy style={{ padding: '12px 0' }}>
          <LazyChunkPlaceholder />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filtered.map(m => {
            const name = `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || 'Unnamed'
            const isMe = m.id === myProfileId
            const outranksMe = !isOwnerOrAdmin && ['owner', 'admin', 'company_director'].includes(m.role)
            const cannotEdit = isMe || outranksMe
            const pillColor = ROLE_PILL_COLORS[m.role] ?? '#8080A8'
            return (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{name}{isMe && <span style={{ fontSize: 10, color: '#55516E', marginLeft: 6 }}>(you)</span>}</div>
                  <div style={{ fontSize: 11, color: '#55516E' }}>{m.email ?? '—'}</div>
                </div>
                <select value={m.role} disabled={cannotEdit} title={isMe ? 'You cannot change your own role' : outranksMe ? 'You cannot change the role of a higher-ranked team member' : undefined}
                  onChange={e => { const nr = e.target.value; if (nr === m.role) return; setConfirmModal({ id: m.id, name, from: m.role, to: nr }); e.target.value = m.role }}
                  style={{ padding: '5px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: cannotEdit ? 'not-allowed' : 'pointer', background: `${pillColor}18`, color: pillColor, border: `1px solid ${pillColor}30`, outline: 'none', opacity: cannotEdit ? 0.5 : 1 }}>
                  {(availableRoles.includes(m.role) ? availableRoles : [m.role, ...availableRoles]).map(r => <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>)}
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
    queryKey: [...qk.tenant.brand, selectedLocId],
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
            {['AI progress updates', 'Churn risk scoring', 'Retention campaigns', 'Financial dashboard', 'Smart scheduling', 'Parent portal', 'Email notifications', 'Ziro AI assistant', 'Practice lab', 'White-label branding'].map(f => (
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

