import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { usePermissions } from '../../hooks/usePermissions'
import { useLocations } from '../../hooks/useLocations'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { toast } from '../shared/Toast'
import { X, Search, Users, Plus, Check } from 'lucide-react'
import { qk } from '../../lib/queryKeys'

interface Props {
  studentId: string
  studentName: string
  onClose: () => void
  onLinked?: (familyId: string) => void
}

interface FamilyResult {
  id: string
  name: string
  primary_contact_name: string | null
  parent_name: string | null
  primary_email: string | null
  primary_phone: string | null
  billing_status: string | null
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
  color: '#E0E0F4', fontSize: 13, outline: 'none', boxSizing: 'border-box',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#8080A8',
  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5,
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <label style={labelStyle}>{children}{required && <span style={{ color: '#E8488A' }}> *</span>}</label>
}

export default function LinkFamilyModal({ studentId, studentName, onClose, onLinked }: Props) {
  const { tenantId } = useAuthContext()
  const { isStudioDirector, locationIds: scopedLocationIds } = usePermissions()
  const { data: locations } = useLocations()
  const qc = useQueryClient()

  const [mode, setMode] = useState<'search' | 'create'>('search')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<FamilyResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedFamily, setSelectedFamily] = useState<FamilyResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Create family fields
  const [parentFirst, setParentFirst] = useState('')
  const [parentLast, setParentLast] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [locationId, setLocationId] = useState('')
  const [isMilitary, setIsMilitary] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout>>()
  const activeLocations = (locations ?? []).filter((l: any) => l.is_active !== false)

  useEffect(() => {
    if (isStudioDirector && scopedLocationIds.length > 0 && !locationId) {
      setLocationId(scopedLocationIds[0])
    }
  }, [isStudioDirector, scopedLocationIds, locationId])

  // Search families
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const q = searchQuery.trim().toLowerCase()
      const { data } = await supabase
        .from('families')
        .select('id, name, primary_contact_name, parent_name, primary_email, primary_phone, billing_status')
        .or(`name.ilike.%${q}%,primary_contact_name.ilike.%${q}%,primary_email.ilike.%${q}%,parent_name.ilike.%${q}%`)
        .limit(10)
      setSearchResults(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [searchQuery])

  const handleLinkExisting = async () => {
    if (!selectedFamily) return
    setSaving(true)
    setError(null)
    try {
      const { error: upErr } = await supabase.from('students').update({ family_id: selectedFamily.id }).eq('id', studentId)
      if (upErr) throw upErr
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.students.all }),
        qc.invalidateQueries({ queryKey: qk.students.roster }),
        qc.invalidateQueries({ queryKey: qk.students.instruments }),
        qc.invalidateQueries({ queryKey: qk.students.tabCounts }),
        qc.invalidateQueries({ queryKey: qk.students.detail }),
        qc.invalidateQueries({ queryKey: qk.families.all }),
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
        qc.invalidateQueries({ queryKey: qk.families.fileDetail }),
      ])
      toast(`${studentName} linked to ${selectedFamily.name}`, 'success')
      onLinked?.(selectedFamily.id)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to link family.')
    } finally {
      setSaving(false)
    }
  }

  const handleCreateAndLink = async () => {
    if (!parentFirst.trim()) { setError('Parent first name is required.'); return }
    if (!parentLast.trim()) { setError('Parent last name is required.'); return }
    if (!email.trim()) { setError('Email is required.'); return }
    if (!phone.trim()) { setError('Phone is required.'); return }
    if (!locationId) { setError('Location is required.'); return }

    setSaving(true)
    setError(null)
    try {
      const parentName = `${parentFirst.trim()} ${parentLast.trim()}`
      const { data: newFamily, error: famErr } = await supabase
        .from('families')
        .insert({
          tenant_id: tenantId!,
          name: `${parentLast.trim()} Family`,
          parent_first_name: parentFirst.trim(),
          parent_last_name: parentLast.trim(),
          parent_name: parentName,
          primary_contact_name: parentName,
          primary_email: email.trim().toLowerCase(),
          primary_phone: phone.trim(),
          primary_location_id: locationId,
          is_military: isMilitary,
          billing_status: 'active',
          notify_via_sms: true,
          notify_via_email: true,
          reminder_4hr: true,
          reminder_1hr: true,
        })
        .select()
        .single()
      if (famErr) throw famErr

      const { error: upErr } = await supabase.from('students').update({ family_id: newFamily.id }).eq('id', studentId)
      if (upErr) throw upErr

      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.students.all }),
        qc.invalidateQueries({ queryKey: qk.students.roster }),
        qc.invalidateQueries({ queryKey: qk.students.instruments }),
        qc.invalidateQueries({ queryKey: qk.students.tabCounts }),
        qc.invalidateQueries({ queryKey: qk.students.detail }),
        qc.invalidateQueries({ queryKey: qk.families.all }),
        qc.invalidateQueries({ queryKey: qk.families.page }),
        qc.invalidateQueries({ queryKey: qk.families.roster }),
        qc.invalidateQueries({ queryKey: qk.families.tabCounts }),
        qc.invalidateQueries({ queryKey: qk.families.fileDetail }),
        qc.invalidateQueries({ queryKey: qk.tasks.all }),
      ])
      toast(`Family created and linked to ${studentName}`, 'success')
      onLinked?.(newFamily.id)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to create family.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 480, maxWidth: '95vw', maxHeight: '90vh', borderRadius: 16, background: '#1A1830', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
      >
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <Users size={18} style={{ color: '#D97706' }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#E0E0F4' }}>Link Family</div>
            <div style={{ fontSize: 11, color: '#8080A8' }}>Connect {studentName} to a family</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#8080A8', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            <button type="button" onClick={() => { setMode('search'); setError(null) }} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: mode === 'search' ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${mode === 'search' ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: mode === 'search' ? '#E8488A' : '#8080A8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Search size={14} /> Search Existing
            </button>
            <button type="button" onClick={() => { setMode('create'); setError(null) }} style={{
              flex: 1, padding: '10px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: mode === 'create' ? 'rgba(212,34,106,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${mode === 'create' ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.08)'}`,
              color: mode === 'create' ? '#E8488A' : '#8080A8',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <Plus size={14} /> Create New Family
            </button>
          </div>

          {mode === 'search' && (
            <>
              <div style={{ marginBottom: 14 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#606088' }} />
                  <input
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setSelectedFamily(null) }}
                    placeholder="Search by parent name or email..."
                    style={{ ...inputStyle, paddingLeft: 36 }}
                    autoFocus
                  />
                </div>
              </div>

              {searching && <div style={{ fontSize: 12, color: '#8080A8', padding: '8px 0' }}>Searching...</div>}

              {searchResults.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {searchResults.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFamily(f)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px',
                        borderRadius: 10, marginBottom: 4, cursor: 'pointer', textAlign: 'left',
                        background: selectedFamily?.id === f.id ? 'rgba(212,34,106,0.1)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${selectedFamily?.id === f.id ? 'rgba(212,34,106,0.3)' : 'rgba(255,255,255,0.06)'}`,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>{f.name}</div>
                        <div style={{ fontSize: 11, color: '#8080A8' }}>
                          {f.primary_contact_name || f.parent_name || '—'} &middot; {f.primary_email || '—'}
                        </div>
                      </div>
                      {selectedFamily?.id === f.id && <Check size={16} style={{ color: '#22C55E', flexShrink: 0 }} />}
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.trim().length >= 2 && !searching && searchResults.length === 0 && (
                <div style={{ fontSize: 12, color: '#8080A8', padding: '12px 0', textAlign: 'center' }}>
                  No families found. Try a different search or create a new family.
                </div>
              )}
            </>
          )}

          {mode === 'create' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Label required>Parent First Name</Label>
                  <input value={parentFirst} onChange={e => setParentFirst(e.target.value)} placeholder="First name" style={inputStyle} />
                </div>
                <div>
                  <Label required>Parent Last Name</Label>
                  <input value={parentLast} onChange={e => setParentLast(e.target.value)} placeholder="Last name" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <Label required>Email</Label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="parent@email.com" style={inputStyle} />
                </div>
                <div>
                  <Label required>Phone</Label>
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <Label required>Location</Label>
                {isStudioDirector ? (
                  <div style={{ ...inputStyle, background: 'rgba(255,255,255,0.02)', color: '#A0A0C8', cursor: 'not-allowed' }}>
                    {activeLocations.find((l: any) => l.id === locationId)?.name?.replace(' Music Lessons', '') ?? 'Your Location'}
                  </div>
                ) : (
                  <select value={locationId} onChange={e => setLocationId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                    <option value="">Select location...</option>
                    {activeLocations.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
                    ))}
                  </select>
                )}
              </div>
              <div style={{ marginBottom: 14 }}>
                <Label>Military?</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setIsMilitary(true)} style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: isMilitary ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${isMilitary ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                    color: isMilitary ? '#22C55E' : '#8080A8',
                  }}>Yes</button>
                  <button type="button" onClick={() => setIsMilitary(false)} style={{
                    padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    background: !isMilitary ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${!isMilitary ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)'}`,
                    color: !isMilitary ? '#E0E0F4' : '#8080A8',
                  }}>No</button>
                </div>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', marginBottom: 14, fontSize: 12, color: '#EF4444' }}>
              {error}
            </div>
          )}

          {/* Save */}
          {mode === 'search' ? (
            <button
              type="button"
              onClick={handleLinkExisting}
              disabled={!selectedFamily || saving}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: selectedFamily && !saving ? 'linear-gradient(135deg, #D4226A, #E8488A)' : '#2A2844',
                color: selectedFamily && !saving ? '#fff' : '#606088',
                fontSize: 13, fontWeight: 700, cursor: selectedFamily && !saving ? 'pointer' : 'not-allowed',
              }}
            >
              {saving ? 'Linking...' : selectedFamily ? `Link to ${selectedFamily.name}` : 'Select a family to link'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreateAndLink}
              disabled={saving}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                background: saving ? '#2A2844' : 'linear-gradient(135deg, #D4226A, #E8488A)',
                color: saving ? '#606088' : '#fff',
                fontSize: 13, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Creating & Linking...' : 'Create Family & Link'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
