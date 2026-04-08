import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useRooms, useCreateRoom, type Room } from '../../hooks/useRooms'
import { useLocations } from '../../hooks/useLocations'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocationColor } from '../../utils/locationColor'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { toast } from '../shared/Toast'
import MusicLoader from '../shared/MusicLoader'

// --------------- GRID CONSTANTS ---------------
const GRID_COLS = 12
const GRID_ROWS = 10
const CELL_SIZE = 60 // px on desktop

const SPACE_TYPES = ['Lobby', 'Bathroom', 'Storage', 'Office', 'Hallway'] as const
type SpaceType = typeof SPACE_TYPES[number]

interface LayoutBlock {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  isSpace: boolean // non-teaching space
  instruments: string[]
  inventoryCount: number
  status: string
}

// --------------- HELPERS ---------------
function isDefaultPosition(r: Room): boolean {
  return r.layout_x === 0 && r.layout_y === 0 && r.layout_w === 1 && r.layout_h === 1
}

function autoArrange(rooms: Room[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = []
  let col = 0
  let row = 0
  for (const r of rooms) {
    const w = isDefaultPosition(r) ? 2 : r.layout_w
    const h = isDefaultPosition(r) ? 2 : r.layout_h
    if (isDefaultPosition(r)) {
      if (col + w > GRID_COLS) { col = 0; row += 2 }
      blocks.push({
        id: r.id, name: r.name, x: col, y: row, w, h,
        isSpace: r.status === 'storage' && !r.is_active,
        instruments: r.primary_instruments ?? [],
        inventoryCount: r.inventory?.length ?? 0,
        status: r.status,
      })
      col += w
    } else {
      blocks.push({
        id: r.id, name: r.name, x: r.layout_x, y: r.layout_y, w: r.layout_w, h: r.layout_h,
        isSpace: r.status === 'storage' && !r.is_active,
        instruments: r.primary_instruments ?? [],
        inventoryCount: r.inventory?.length ?? 0,
        status: r.status,
      })
    }
  }
  return blocks
}

function hasCollision(blocks: LayoutBlock[], moving: LayoutBlock, ignoreId: string): boolean {
  for (const b of blocks) {
    if (b.id === ignoreId) continue
    const noOverlap = moving.x + moving.w <= b.x || b.x + b.w <= moving.x ||
                      moving.y + moving.h <= b.y || b.y + b.h <= moving.y
    if (!noOverlap) return true
  }
  return false
}

function resetArrange(rooms: Room[]): LayoutBlock[] {
  const blocks: LayoutBlock[] = []
  let col = 0
  let row = 0
  const sorted = [...rooms].sort((a, b) => a.display_order - b.display_order)
  for (const r of sorted) {
    const w = 2, h = 2
    if (col + w > GRID_COLS) { col = 0; row += 2 }
    if (row + h > GRID_ROWS) break
    blocks.push({
      id: r.id, name: r.name, x: col, y: row, w, h,
      isSpace: r.status === 'storage' && !r.is_active,
      instruments: r.primary_instruments ?? [],
      inventoryCount: r.inventory?.length ?? 0,
      status: r.status,
    })
    col += w
  }
  return blocks
}

// --------------- COMPONENT ---------------
export default function FloorPlanEditor({ locationId }: { locationId?: string }) {
  const { role, tenantId } = useAuthContext()
  const { data: locations } = useLocations()
  const canEdit = role === 'owner' || role === 'admin'

  const [selectedLocation, setSelectedLocation] = useState('')
  const effectiveLocation = locationId || selectedLocation || (locations?.[0]?.id ?? '')
  const { data: rooms, isLoading } = useRooms(effectiveLocation || undefined)

  const [blocks, setBlocks] = useState<LayoutBlock[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddSpace, setShowAddSpace] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const brandColor = getLocationColor(effectiveLocation)
  const gridRef = useRef<HTMLDivElement>(null)

  // Set default location
  useEffect(() => {
    if (!selectedLocation && !locationId && locations?.length) {
      setSelectedLocation(locations[0].id)
    }
  }, [locations, selectedLocation, locationId])

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Sync rooms → blocks when data loads
  useEffect(() => {
    if (!rooms?.length) { setBlocks([]); return }
    setBlocks(autoArrange(rooms))
    setDirty(false)
  }, [rooms])

  // --------------- DRAG STATE ---------------
  const dragState = useRef<{
    blockId: string
    startMouseX: number
    startMouseY: number
    startBlockX: number
    startBlockY: number
    mode: 'move' | 'resize'
    startW: number
    startH: number
    origBlock: LayoutBlock
  } | null>(null)

  const getGridPos = useCallback((clientX: number, clientY: number) => {
    if (!gridRef.current) return { col: 0, row: 0 }
    const rect = gridRef.current.getBoundingClientRect()
    const scale = rect.width / (GRID_COLS * CELL_SIZE)
    const col = Math.floor((clientX - rect.left) / (CELL_SIZE * scale))
    const row = Math.floor((clientY - rect.top) / (CELL_SIZE * scale))
    return { col: Math.max(0, Math.min(col, GRID_COLS - 1)), row: Math.max(0, Math.min(row, GRID_ROWS - 1)) }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent, blockId: string, mode: 'move' | 'resize') => {
    if (isMobile || !canEdit) return
    e.preventDefault()
    e.stopPropagation()
    const block = blocks.find(b => b.id === blockId)
    if (!block) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = {
      blockId, startMouseX: e.clientX, startMouseY: e.clientY,
      startBlockX: block.x, startBlockY: block.y,
      mode, startW: block.w, startH: block.h,
      origBlock: { ...block },
    }
  }, [blocks, isMobile, canEdit])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds || !gridRef.current) return
    e.preventDefault()

    const rect = gridRef.current.getBoundingClientRect()
    const scale = rect.width / (GRID_COLS * CELL_SIZE)
    const cellPx = CELL_SIZE * scale

    const deltaX = Math.round((e.clientX - ds.startMouseX) / cellPx)
    const deltaY = Math.round((e.clientY - ds.startMouseY) / cellPx)

    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === ds.blockId)
      if (idx === -1) return prev

      let updated: LayoutBlock
      if (ds.mode === 'move') {
        const nx = Math.max(0, Math.min(ds.startBlockX + deltaX, GRID_COLS - prev[idx].w))
        const ny = Math.max(0, Math.min(ds.startBlockY + deltaY, GRID_ROWS - prev[idx].h))
        updated = { ...prev[idx], x: nx, y: ny }
      } else {
        const nw = Math.max(1, Math.min(ds.startW + deltaX, GRID_COLS - prev[idx].x))
        const nh = Math.max(1, Math.min(ds.startH + deltaY, GRID_ROWS - prev[idx].y))
        updated = { ...prev[idx], w: nw, h: nh }
      }

      // Check collision
      const others = prev.filter(b => b.id !== ds.blockId)
      if (hasCollision(others, updated, ds.blockId)) return prev

      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

    // Check if position actually changed
    const block = blocks.find(b => b.id === ds.blockId)
    if (block && (block.x !== ds.origBlock.x || block.y !== ds.origBlock.y ||
        block.w !== ds.origBlock.w || block.h !== ds.origBlock.h)) {
      setDirty(true)
    }
    dragState.current = null
  }, [blocks])

  // --------------- SAVE ---------------
  const handleSave = async () => {
    if (!tenantId || !effectiveLocation) return
    setSaving(true)
    try {
      const updates = blocks.map(b => ({
        id: b.id,
        layout_x: b.x,
        layout_y: b.y,
        layout_w: b.w,
        layout_h: b.h,
      }))

      // Batch upsert via individual updates (supabase JS doesn't support batch upsert on partial columns easily)
      const promises = updates.map(u =>
        supabase.from('rooms').update({
          layout_x: u.layout_x, layout_y: u.layout_y,
          layout_w: u.layout_w, layout_h: u.layout_h,
        }).eq('id', u.id).eq('tenant_id', tenantId)
      )
      const results = await Promise.all(promises)
      const failed = results.filter(r => r.error)
      if (failed.length) throw new Error(failed[0].error!.message)

      setDirty(false)
      toast.success('Floor plan saved')
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // --------------- RESET ---------------
  const handleReset = () => {
    if (!rooms?.length) return
    setBlocks(resetArrange(rooms))
    setDirty(true)
  }

  // --------------- ADD SPACE ---------------
  const createRoom = useCreateRoom()
  const handleAddSpace = async (name: string, type: SpaceType) => {
    if (!tenantId || !effectiveLocation) return
    try {
      await createRoom.mutateAsync({
        tenant_id: tenantId,
        location_id: effectiveLocation,
        name: `${name} (${type})`,
        primary_instruments: [],
        notes: `Non-teaching space: ${type}`,
      })
      // After creation, the room will appear via query invalidation
      // We'll need to also set status='storage' and is_active=false
      // Since createRoom doesn't support those fields, do a follow-up update
      // Actually, let's just set it via raw supabase after creation
      const { data: newRoom } = await supabase
        .from('rooms')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('location_id', effectiveLocation)
        .eq('name', `${name} (${type})`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (newRoom) {
        await supabase.from('rooms').update({ status: 'storage', is_active: false }).eq('id', newRoom.id)
      }
      setShowAddSpace(false)
      toast.success(`${name} added`)
    } catch (err: any) {
      toast.error(`Failed to add space: ${err.message}`)
    }
  }

  // --------------- RENDER ---------------
  const gridWidth = GRID_COLS * CELL_SIZE
  const gridHeight = GRID_ROWS * CELL_SIZE

  if (isLoading) {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>
      {/* Location selector (only if no locationId prop) */}
      {!locationId && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={selectedLocation}
            onChange={e => { setSelectedLocation(e.target.value); setDirty(false) }}
            className="filter-select"
          >
            {locations?.map(l => (
              <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
            ))}
          </select>
        </div>
      )}

      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap',
      }}>
        {canEdit && !isMobile && (
          <>
            <button className="btn-outline" onClick={() => setShowAddSpace(true)} style={{ fontSize: 13 }}>
              + Add Space
            </button>
            <button className="btn-outline" onClick={handleReset} style={{ fontSize: 13 }}>
              Reset Layout
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!dirty || saving}
              style={{ fontSize: 13, opacity: dirty ? 1 : 0.5 }}
            >
              {saving ? 'Saving…' : 'Save Layout'}
            </button>
          </>
        )}
        {dirty && !isMobile && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Unsaved changes
          </span>
        )}
      </div>

      {/* Mobile notice */}
      {isMobile && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Floor plan editing is available on desktop
        </p>
      )}

      {/* Grid */}
      <div
        style={{
          width: '100%',
          maxWidth: gridWidth,
          aspectRatio: `${GRID_COLS} / ${GRID_ROWS}`,
          position: 'relative',
          borderRadius: 14,
          overflow: 'hidden',
          background: '#020209',
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: `${CELL_SIZE}px ${CELL_SIZE}px`,
          border: '1px solid rgba(255,255,255,0.08)',
          touchAction: 'none',
        }}
        ref={gridRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Grid lines */}
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
          viewBox={`0 0 ${gridWidth} ${gridHeight}`}
          preserveAspectRatio="none"
        >
          {Array.from({ length: GRID_COLS + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * CELL_SIZE} y1={0} x2={i * CELL_SIZE} y2={gridHeight}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
          {Array.from({ length: GRID_ROWS + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * CELL_SIZE} x2={gridWidth} y2={i * CELL_SIZE}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
        </svg>

        {/* Room blocks */}
        {blocks.map(block => {
          const color = block.isSpace ? '#666' : brandColor
          return (
            <div
              key={block.id}
              style={{
                position: 'absolute',
                left: `${(block.x / GRID_COLS) * 100}%`,
                top: `${(block.y / GRID_ROWS) * 100}%`,
                width: `${(block.w / GRID_COLS) * 100}%`,
                height: `${(block.h / GRID_ROWS) * 100}%`,
                background: `${color}30`,
                border: `2px solid ${color}`,
                borderRadius: 8,
                padding: '6px 8px',
                boxSizing: 'border-box',
                cursor: canEdit && !isMobile ? 'grab' : 'default',
                userSelect: 'none',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                transition: dragState.current?.blockId === block.id ? 'none' : 'left 0.15s, top 0.15s, width 0.15s, height 0.15s',
                zIndex: dragState.current?.blockId === block.id ? 10 : 1,
              }}
              onPointerDown={e => handlePointerDown(e, block.id, 'move')}
            >
              <span style={{
                fontSize: 12, fontWeight: 800, color: '#fff', lineHeight: 1.2,
                fontFamily: 'var(--font-display)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {block.name}
              </span>

              {/* Instrument pills */}
              {!block.isSpace && block.instruments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                  {block.instruments.slice(0, 3).map(inst => (
                    <span key={inst} style={{
                      fontSize: 9, background: 'rgba(255,255,255,0.1)', borderRadius: 4,
                      padding: '1px 4px', color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap',
                    }}>
                      {instrumentWithEmojiTitle(inst)}
                    </span>
                  ))}
                </div>
              )}

              {/* Inventory count */}
              {!block.isSpace && block.inventoryCount > 0 && (
                <span style={{
                  fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 'auto',
                }}>
                  {block.inventoryCount} item{block.inventoryCount !== 1 ? 's' : ''}
                </span>
              )}

              {/* Resize handle */}
              {canEdit && !isMobile && (
                <div
                  style={{
                    position: 'absolute', bottom: 0, right: 0,
                    width: 14, height: 14, cursor: 'nwse-resize',
                  }}
                  onPointerDown={e => handlePointerDown(e, block.id, 'resize')}
                >
                  <svg viewBox="0 0 14 14" width="14" height="14" style={{ opacity: 0.4 }}>
                    <line x1="4" y1="14" x2="14" y2="4" stroke="white" strokeWidth="1.5" />
                    <line x1="8" y1="14" x2="14" y2="8" stroke="white" strokeWidth="1.5" />
                    <line x1="12" y1="14" x2="14" y2="12" stroke="white" strokeWidth="1.5" />
                  </svg>
                </div>
              )}
            </div>
          )
        })}

        {/* Empty state */}
        {blocks.length === 0 && !isLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            No rooms at this location
          </div>
        )}
      </div>

      {/* Add Space Modal */}
      {showAddSpace && (
        <AddSpaceModal onClose={() => setShowAddSpace(false)} onAdd={handleAddSpace} />
      )}
    </div>
  )
}

// --------------- ADD SPACE MODAL ---------------
function AddSpaceModal({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string, type: SpaceType) => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<SpaceType>('Lobby')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onAdd(name.trim(), type)
    setSubmitting(false)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 400, padding: 24, borderRadius: 22 }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-display)' }}>
            Add Non-Teaching Space
          </h3>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 18, padding: '4px 8px' }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Name</label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Front Lobby"
              autoFocus
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Type</label>
            <select className="filter-select" value={type} onChange={e => setType(e.target.value as SpaceType)} style={{ width: '100%' }}>
              {SPACE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={!name.trim() || submitting}>
              {submitting ? 'Adding…' : 'Add Space'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
