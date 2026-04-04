import { useState } from 'react'
import MusicLoader from '../../components/shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations, useCreateLocation, useUpdateLocation } from '../../hooks/useLocations'
import type { Location } from '../../lib/types'
import { IssueContextProvider } from '../../contexts/IssueContext'
import ReportIssueButton from '../../components/shared/ReportIssueButton'

interface LocationFormData {
  name: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  email: string
  website: string
  google_review_url: string
}

const emptyForm: LocationFormData = {
  name: '', address: '', city: '', state: 'NE', zip: '',
  phone: '', email: '', website: '', google_review_url: '',
}

export default function Locations() {
  const { role, tenantId } = useAuthContext()
  const { data: locations, isLoading, error } = useLocations()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()
  const isOwner = role === 'owner'

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<LocationFormData>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (loc: Location) => {
    setEditingId(loc.id)
    setForm({
      name: loc.name,
      address: loc.address,
      city: loc.city,
      state: loc.state,
      zip: loc.zip,
      phone: loc.phone ?? '',
      email: loc.email ?? '',
      website: loc.website ?? '',
      google_review_url: loc.google_review_url ?? '',
    })
    setFormError(null)
    setShowForm(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.name.trim() || !form.address.trim() || !form.city.trim() || !form.zip.trim()) {
      setFormError('Name, address, city, and zip are required.')
      return
    }

    try {
      if (editingId) {
        await updateLocation.mutateAsync({ id: editingId, ...form })
      } else {
        await createLocation.mutateAsync({
          ...form,
          tenant_id: tenantId!,
          is_active: true,
          hours_json: null,
        } as any)
      }
      setShowForm(false)
      setForm(emptyForm)
      setEditingId(null)
    } catch (err: any) {
      setFormError(err.message ?? 'Failed to save location.')
    }
  }

  const toggleActive = async (loc: Location) => {
    try {
      await updateLocation.mutateAsync({ id: loc.id, is_active: !loc.is_active })
    } catch (err: any) {
      alert('Failed to update: ' + err.message)
    }
  }

  if (isLoading) {
    return (
      <div className="page">
        <div className="page-header"><h1>Locations</h1></div>
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <div className="page-header"><h1>Locations</h1></div>
        <div className="form-error">Failed to load locations: {(error as Error).message}</div>
      </div>
    )
  }

  return (
    <IssueContextProvider page="Settings" section="Locations">
    <div className="page">
      <div className="page-header">
        <h1>Locations</h1>
        <span className="badge-secondary">{locations?.length ?? 0} total</span>
        {isOwner && (
          <button className="btn-primary" onClick={openCreate} style={{ marginLeft: 'auto' }}>
            + Add Location
          </button>
        )}
        <ReportIssueButton />
      </div>

      <div className="locations-grid">
        {locations?.map((loc) => (
          <div key={loc.id} className="card-hover location-card">
            <div className="location-card-header">
              <h3>{loc.name}</h3>
              <span className={loc.is_active ? 'badge-success' : 'badge-secondary'}>
                {loc.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="location-card-body">
              <div className="location-detail">
                <span className="location-label">Address</span>
                <span>{loc.address}, {loc.city}, {loc.state} {loc.zip}</span>
              </div>
              {loc.phone && (
                <div className="location-detail">
                  <span className="location-label">QUO Phone</span>
                  <span>{loc.phone}</span>
                </div>
              )}
              {loc.email && (
                <div className="location-detail">
                  <span className="location-label">Email</span>
                  <span>{loc.email}</span>
                </div>
              )}
              {loc.website && (
                <div className="location-detail">
                  <span className="location-label">Website</span>
                  <span>{loc.website}</span>
                </div>
              )}
            </div>

            {isOwner && (
              <div className="location-card-actions">
                <button className="btn-outline" onClick={() => openEdit(loc)}>Edit</button>
                <button
                  className="btn-ghost"
                  onClick={() => toggleActive(loc)}
                  style={{ color: loc.is_active ? 'var(--text-muted)' : 'var(--green)' }}
                >
                  {loc.is_active ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            )}
          </div>
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
              <div className="form-field">
                <label>Location Name *</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Omaha Music Lessons" />
              </div>
              <div className="form-field">
                <label>Address *</label>
                <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="4862 S 96th St" />
              </div>
              <div className="form-row">
                <div className="form-field" style={{ flex: 2 }}>
                  <label>City *</label>
                  <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Omaha" />
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <label>State</label>
                  <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="NE" />
                </div>
                <div className="form-field" style={{ flex: 1 }}>
                  <label>Zip *</label>
                  <input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} placeholder="68127" />
                </div>
              </div>
              <div className="form-field">
                <label>QUO Phone Number</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(402) 555-0000" />
              </div>
              <div className="form-field">
                <label>Email</label>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="location@gmail.com" />
              </div>
              <div className="form-field">
                <label>Website</label>
                <input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="www.example.com" />
              </div>
              <div className="form-field">
                <label>Google Review URL</label>
                <input value={form.google_review_url} onChange={(e) => setForm({ ...form, google_review_url: e.target.value })} placeholder="https://g.page/r/..." />
              </div>

              {formError && <div className="form-error">{formError}</div>}

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={createLocation.isPending || updateLocation.isPending}
                >
                  {(createLocation.isPending || updateLocation.isPending) ? 'Saving...' : editingId ? 'Save Changes' : 'Create Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </IssueContextProvider>
  )
}
