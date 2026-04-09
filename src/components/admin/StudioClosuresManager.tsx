import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useAuthContext } from '../../app/AuthContext'
import { toast } from '../shared/Toast'
import { qk } from '../../lib/queryKeys'

interface ClosureRow {
  id: string
  closure_date: string
  label: string
}

interface Props {
  locationId: string | null // null = company-wide
  locationName?: string // for label on buttons when location-specific
}

function formatLongDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

export default function StudioClosuresManager({ locationId, locationName }: Props) {
  const { tenantId, profile } = useAuthContext()
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ClosureRow | null>(null)

  const isCompanyWide = locationId === null

  const { data: closures } = useQuery<ClosureRow[]>({
    queryKey: [...qk.locations.closures, tenantId, locationId ?? 'company'],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase
        .from('studio_closures')
        .select('id, closure_date, label')
        .eq('tenant_id', tenantId!)
        .order('closure_date', { ascending: true })
      if (isCompanyWide) {
        q = q.is('location_id', null)
      } else {
        q = q.eq('location_id', locationId!)
      }
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as ClosureRow[]
    },
  })

  const addClosure = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error('Not authenticated')
      if (!newDate || !newLabel.trim()) throw new Error('Date and label are required')
      const { error } = await supabase.from('studio_closures').insert({
        tenant_id: tenantId,
        location_id: locationId,
        closure_date: newDate,
        label: newLabel.trim().slice(0, 40),
        created_by: profile?.id ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.locations.closures })
      setShowForm(false)
      setNewDate('')
      setNewLabel('')
      toast('Closure added', 'success')
    },
    onError: (err: any) => toast(err.message ?? 'Failed to add closure', 'error'),
  })

  const deleteClosure = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('studio_closures').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.locations.closures })
      setConfirmDelete(null)
      toast('Closure removed', 'success')
    },
    onError: (err: any) => toast(err.message ?? 'Failed to remove closure', 'error'),
  })

  const today = todayStr()
  const title = isCompanyWide ? '🏢 Company-Wide Closures' : `📍 ${locationName ?? 'Location'}-Specific Closures`
  const subtitle = isCompanyWide
    ? 'Apply to all locations — these dates block call-outs and are skipped when finding makeup slots.'
    : 'Only blocks call-outs at this location.'
  const addLabel = isCompanyWide ? '+ Add Company Closure' : `+ Add Closure for ${locationName ?? 'Location'}`

  return (
    <div style={{
      padding: 16, borderRadius: 12,
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      marginTop: 12,
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#E0E0F4' }}>{title}</div>
        <div style={{ fontSize: 11, color: '#8080A8', marginTop: 3, lineHeight: 1.5 }}>{subtitle}</div>
      </div>

      {closures && closures.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {closures.map((c) => {
            const isPast = c.closure_date < today
            return (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)',
                opacity: isPast ? 0.3 : 1,
              }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#C0C0E0', minWidth: 140 }}>
                  {formatLongDate(c.closure_date)}
                </span>
                <span style={{ fontSize: 12, color: '#A0A0C8', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.label}
                </span>
                {!isPast && (
                  <button
                    onClick={() => setConfirmDelete(c)}
                    title="Remove"
                    style={{
                      width: 26, height: 26, borderRadius: 6,
                      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                      color: '#8080A8', cursor: 'pointer', fontSize: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#606088', padding: '10px 0', marginBottom: 8 }}>
          No {isCompanyWide ? 'company-wide' : 'location-specific'} closures added yet.
        </div>
      )}

      {showForm ? (
        <div style={{
          padding: 12, borderRadius: 8,
          background: 'rgba(212,34,106,0.04)', border: '1px solid rgba(212,34,106,0.2)',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              style={{
                flex: '1 1 150px', padding: '8px 10px', borderRadius: 6, fontSize: 12,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#E0E0F4',
              }}
            />
            <input
              type="text"
              placeholder="Label (e.g. Memorial Day)"
              value={newLabel}
              maxLength={40}
              onChange={(e) => setNewLabel(e.target.value)}
              style={{
                flex: '2 1 200px', padding: '8px 10px', borderRadius: 6, fontSize: 12,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#E0E0F4',
              }}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => addClosure.mutate()}
              disabled={addClosure.isPending || !newDate || !newLabel.trim()}
              style={{
                padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                background: '#D4226A', color: '#FFFFFF', border: 'none',
                cursor: addClosure.isPending ? 'wait' : 'pointer',
                opacity: !newDate || !newLabel.trim() ? 0.5 : 1,
              }}
            >
              {addClosure.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => { setShowForm(false); setNewDate(''); setNewLabel('') }}
              style={{
                padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{
            padding: '8px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: 'rgba(212,34,106,0.1)', color: '#D4226A',
            border: '1px solid rgba(212,34,106,0.25)', cursor: 'pointer',
          }}
        >
          {addLabel}
        </button>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          onClick={() => setConfirmDelete(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0c0b16', borderRadius: 14, padding: 24, maxWidth: 400, width: '100%',
              border: '1px solid rgba(212,34,106,0.3)',
            }}
          >
            <div style={{ fontSize: 14, color: '#E0E0F4', marginBottom: 20, lineHeight: 1.5 }}>
              Remove <strong>{confirmDelete.label}</strong> from {isCompanyWide ? 'company-wide' : `${locationName ?? 'location'}`} closures?
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setConfirmDelete(null)}
                style={{
                  flex: 1, padding: '10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                  border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => deleteClosure.mutate(confirmDelete.id)}
                disabled={deleteClosure.isPending}
                style={{
                  flex: 1, padding: '10px', borderRadius: 6, fontSize: 12, fontWeight: 800,
                  background: '#D4226A', color: '#FFFFFF', border: 'none',
                  cursor: deleteClosure.isPending ? 'wait' : 'pointer',
                }}
              >
                {deleteClosure.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
