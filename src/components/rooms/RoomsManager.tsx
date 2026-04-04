import { useState } from 'react'
import MusicLoader from '../shared/MusicLoader'
import { useAuthContext } from '../../app/AuthContext'
import { useLocations } from '../../hooks/useLocations'
import { useRooms, useCreateRoom, useUpdateRoom, useAddInventoryItem, useFlagInventoryItem, useResolveInventoryFlag, useDeleteInventoryItem, type Room, type InventoryItem } from '../../hooks/useRooms'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

const INSTRUMENTS = ['guitar','piano','drums','voice','violin','bass','ukulele','other']
const STANDARD_ITEMS = ['Piano','Guitar Amp','Electric Drum Kit','Acoustic Drum Kit','TV','Camera','Music Stand','Chair','Guitar Cable','Guitar']

export default function RoomsManager() {
  const { role, tenantId, user } = useAuthContext()
  const { data: locations } = useLocations()
  const isOwner = role === 'owner'
  const canEdit = role === 'owner' || role === 'admin'

  const [selectedLocation, setSelectedLocation] = useState('')
  const effectiveLocation = selectedLocation || (locations?.[0]?.id ?? '')
  const { data: rooms, isLoading } = useRooms(effectiveLocation || undefined)

  const [editRoom, setEditRoom] = useState<Room | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  if (!selectedLocation && locations?.length) {
    setSelectedLocation(locations[0].id)
  }

  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <select value={selectedLocation} onChange={(e) => setSelectedLocation(e.target.value)} className="filter-select">
          {locations?.map((l) => <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>)}
        </select>
        {canEdit && <button className="btn-primary" onClick={() => setShowCreate(true)}>+ Add Room</button>}
      </div>

      {isLoading ? (
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      ) : (
        <div className="rooms-grid">
          {rooms?.map((room) => (
            <RoomCard key={room.id} room={room} canEdit={canEdit} userId={user?.id ?? ''} tenantId={tenantId!} onEdit={() => setEditRoom(room)} />
          ))}
          {rooms?.length === 0 && <p className="text-muted">No rooms at this location.</p>}
        </div>
      )}

      {(showCreate || editRoom) && (
        <RoomFormModal
          room={editRoom}
          locationId={effectiveLocation}
          tenantId={tenantId!}
          onClose={() => { setShowCreate(false); setEditRoom(null); }}
        />
      )}
    </div>
  )
}

function RoomCard({ room, canEdit, userId, tenantId, onEdit }: { room: Room; canEdit: boolean; userId: string; tenantId: string; onEdit: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState('')
  const [flagItemId, setFlagItemId] = useState<string | null>(null)
  const [flagNote, setFlagNote] = useState('')
  const [resolveItemId, setResolveItemId] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState('')

  const addItem = useAddInventoryItem()
  const flagItem = useFlagInventoryItem()
  const resolveFlag = useResolveInventoryFlag()
  const deleteItem = useDeleteInventoryItem()

  const statusColors: Record<string, string> = { active: 'var(--green)', paused: 'var(--gold)', storage: 'var(--text-muted)', offline: '#EF4444' }

  return (
    <div className="card room-card">
      <div className="room-card-header" onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="room-status-dot" style={{ background: statusColors[room.status] ?? 'gray' }} />
          <strong>{room.name}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {room.flagged_count! > 0 && <span className="room-flag-badge">{room.flagged_count}</span>}
          <div className="pill-group">
            {room.primary_instruments?.map((i) => <span key={i} className="badge-primary" style={{ fontSize: '10px' }}>{instrumentWithEmojiTitle(i)}</span>)}
          </div>
          <span className="text-dim" style={{ fontSize: '11px' }}>{room.inventory?.length ?? 0} items</span>
          <span className="expand-icon">{expanded ? '▼' : '▶'}</span>
        </div>
      </div>

      {expanded && (
        <div className="room-card-body">
          {/* Inventory */}
          <div className="room-inventory-list">
            {room.inventory?.map((item) => (
              <div key={item.id} className={`room-inventory-item ${item.is_flagged ? 'flagged' : ''}`}>
                <span>{item.item_name} {item.quantity > 1 ? `(×${item.quantity})` : ''}</span>
                {item.is_flagged && (
                  <span className="room-flag-text" title={item.flag_note ?? ''}>FLAG: {item.flag_note}</span>
                )}
                <div className="room-item-actions">
                  {!item.is_flagged && canEdit && (
                    <button className="btn-ghost" style={{ fontSize: '10px', padding: '1px 4px', color: 'var(--gold)' }}
                      onClick={() => { setFlagItemId(item.id); setFlagNote(''); }}>Flag</button>
                  )}
                  {item.is_flagged && canEdit && (
                    <button className="btn-ghost" style={{ fontSize: '10px', padding: '1px 4px', color: 'var(--green)' }}
                      onClick={() => { setResolveItemId(item.id); setResolveNote(''); }}>✓ Resolve</button>
                  )}
                  {canEdit && (
                    <button className="btn-ghost" style={{ fontSize: '10px', padding: '1px 4px', color: '#EF4444' }}
                      onClick={() => { if (confirm('Delete ' + item.item_name + '?')) deleteItem.mutate(item.id); }}>✕</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canEdit && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              {showAddItem ? (
                <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                  <select value={newItem} onChange={(e) => setNewItem(e.target.value)} className="filter-select" style={{ flex: 1, fontSize: '11px' }}>
                    <option value="">Select item...</option>
                    {STANDARD_ITEMS.map((i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <button className="btn-primary" style={{ fontSize: '10px', padding: '2px 8px' }}
                    onClick={() => { if (newItem) { addItem.mutate({ room_id: room.id, tenant_id: tenantId, item_name: newItem, quantity: 1 }); setNewItem(''); setShowAddItem(false); } }}>Add</button>
                  <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => setShowAddItem(false)}>Cancel</button>
                </div>
              ) : (
                <>
                  <button className="btn-outline" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={() => setShowAddItem(true)}>+ Add Item</button>
                  <button className="btn-outline" style={{ fontSize: '10px', padding: '2px 8px' }} onClick={onEdit}>Edit Room</button>
                </>
              )}
            </div>
          )}

          {/* Flag Modal Inline */}
          {flagItemId && (
            <div className="room-inline-form">
              <input value={flagNote} onChange={(e) => setFlagNote(e.target.value)} placeholder="What's wrong?" className="filter-select" style={{ flex: 1, fontSize: '11px' }} />
              <button className="btn-primary" style={{ fontSize: '10px', padding: '2px 8px' }}
                onClick={() => { if (flagNote) { flagItem.mutate({ id: flagItemId, flag_note: flagNote, flagged_by: userId }); setFlagItemId(null); } }}>Flag</button>
              <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => setFlagItemId(null)}>Cancel</button>
            </div>
          )}

          {resolveItemId && (
            <div className="room-inline-form">
              <input value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} placeholder="Resolution reason (required)" className="filter-select" style={{ flex: 1, fontSize: '11px' }} />
              <button className="btn-primary" style={{ fontSize: '10px', padding: '2px 8px', background: 'var(--green)' }}
                onClick={() => { if (resolveNote) { resolveFlag.mutate({ id: resolveItemId, resolve_reason: resolveNote, resolved_by: userId }); setResolveItemId(null); } }}>Resolve</button>
              <button className="btn-ghost" style={{ fontSize: '10px' }} onClick={() => setResolveItemId(null)}>Cancel</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RoomFormModal({ room, locationId, tenantId, onClose }: { room: Room | null; locationId: string; tenantId: string; onClose: () => void }) {
  const createRoom = useCreateRoom()
  const updateRoom = useUpdateRoom()
  const [form, setForm] = useState({
    name: room?.name ?? '',
    status: room?.status ?? 'active',
    primary_instruments: room?.primary_instruments ?? [] as string[],
    notes: room?.notes ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  const toggleInstrument = (inst: string) => {
    setForm((f) => ({
      ...f,
      primary_instruments: f.primary_instruments.includes(inst)
        ? f.primary_instruments.filter((i) => i !== inst)
        : [...f.primary_instruments, inst],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Room name is required.'); return }
    try {
      if (room) {
        await updateRoom.mutateAsync({ id: room.id, ...form })
      } else {
        await createRoom.mutateAsync({ ...form, tenant_id: tenantId, location_id: locationId })
      }
      onClose()
    } catch (err: any) { setError(err.message) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>{room ? 'Edit Room' : 'New Room'}</h2>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-field"><label>Room Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="form-field">
            <label>Status</label>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="filter-select" style={{ width: '100%' }}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="storage">Storage</option>
              <option value="offline">Offline</option>
            </select>
          </div>
          <div className="form-field">
            <label>Primary Instruments</label>
            <div className="pill-select">
              {INSTRUMENTS.map((inst) => (
                <button type="button" key={inst} className={`pill-option ${form.primary_instruments.includes(inst) ? 'selected' : ''}`} onClick={() => toggleInstrument(inst)}>{instrumentWithEmojiTitle(inst)}</button>
              ))}
            </div>
          </div>
          <div className="form-field"><label>Notes</label><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} /></div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={createRoom.isPending || updateRoom.isPending}>
              {(createRoom.isPending || updateRoom.isPending) ? 'Saving...' : room ? 'Save Changes' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
