import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRooms, useCreateRoom, type Room } from '../../hooks/useRooms'
import { useLocations } from '../../hooks/useLocations'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocationColor } from '../../utils/locationColor'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { toast } from '../shared/Toast'
import MusicLoader from '../shared/MusicLoader'

// --------------- DEFAULTS ---------------
const DEFAULT_COLS = 12
const DEFAULT_ROWS = 10
const CELL_SIZE = 60

const SPACE_TYPES = ['Lobby', 'Bathroom', 'Storage', 'Office', 'Hallway'] as const
type SpaceType = typeof SPACE_TYPES[number]

const FLOOR_LABELS: Record<number, string> = {
  1: 'Floor 1 — Main Level',
  2: 'Floor 2 — Upper Level',
}

interface LayoutBlock {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  floor: number
  isSpace: boolean
  instruments: string[]
  inventoryCount: number
  status: string
}

// --------------- HELPERS ---------------
function isDefaultPosition(r: Room): boolean {
  return r.layout_x === 0 && r.layout_y === 0 && r.layout_w <= 1 && r.layout_h <= 1
}

function isDrumRoom(r: Room): boolean {
  return (r.primary_instruments ?? []).some(i => i.toLowerCase() === 'drums' || i.toLowerCase() === 'percussion')
}

function defaultBlockSize(r: Room): { w: number; h: number } {
  return isDrumRoom(r) ? { w: 3, h: 2 } : { w: 2, h: 2 }
}

function roomToBlock(r: Room): LayoutBlock {
  const def = defaultBlockSize(r)
  return {
    id: r.id,
    name: r.name,
    x: r.layout_x,
    y: r.layout_y,
    w: isDefaultPosition(r) ? def.w : r.layout_w,
    h: isDefaultPosition(r) ? def.h : r.layout_h,
    floor: r.floor ?? 1,
    isSpace: r.status === 'storage' && !r.is_active,
    instruments: r.primary_instruments ?? [],
    inventoryCount: r.inventory?.length ?? 0,
    status: r.status,
  }
}

function autoArrangeFloor(rooms: Room[], cols: number): LayoutBlock[] {
  const blocks: LayoutBlock[] = []
  let col = 0
  let row = 0
  for (const r of rooms) {
    const block = roomToBlock(r)
    if (isDefaultPosition(r)) {
      if (col + block.w > cols) { col = 0; row += 2 }
      block.x = col
      block.y = row
      col += block.w
    }
    blocks.push(block)
  }
  return blocks
}

function resetArrangeFloor(rooms: Room[], cols: number, rows: number): LayoutBlock[] {
  const blocks: LayoutBlock[] = []
  let col = 0
  let row = 0
  const sorted = [...rooms].sort((a, b) => a.display_order - b.display_order)
  for (const r of sorted) {
    const def = defaultBlockSize(r)
    if (col + def.w > cols) { col = 0; row += 2 }
    if (row + def.h > rows) break
    const block = roomToBlock(r)
    block.x = col
    block.y = row
    block.w = def.w
    block.h = def.h
    blocks.push(block)
    col += def.w
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

// --------------- MAIN COMPONENT ---------------
export default function FloorPlanEditor({ locationId }: { locationId?: string }) {
  const { role, tenantId } = useAuthContext()
  const { data: locations } = useLocations()
  const qc = useQueryClient()
  const canEdit = role === 'owner' || role === 'admin'

  const [selectedLocation, setSelectedLocation] = useState('')
  const effectiveLocation = locationId || selectedLocation || (locations?.[0]?.id ?? '')
  const { data: rooms, isLoading } = useRooms(effectiveLocation || undefined)

  // Per-location grid dimensions
  const activeLocationObj = useMemo(
    () => locations?.find(l => l.id === effectiveLocation),
    [locations, effectiveLocation],
  )
  const gridCols = activeLocationObj?.floorplan_cols ?? DEFAULT_COLS
  const gridRows = activeLocationObj?.floorplan_rows ?? DEFAULT_ROWS

  const [allBlocks, setAllBlocks] = useState<LayoutBlock[]>([])
  const [activeFloor, setActiveFloor] = useState(1)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddSpace, setShowAddSpace] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const brandColor = getLocationColor(effectiveLocation)

  // Which floors exist
  const floors = useMemo(() => {
    const set = new Set(allBlocks.map(b => b.floor))
    if (set.size === 0) set.add(1)
    return [...set].sort()
  }, [allBlocks])

  const isMultiFloor = floors.length > 1

  // Blocks for active floor
  const floorBlocks = useMemo(
    () => allBlocks.filter(b => b.floor === activeFloor),
    [allBlocks, activeFloor],
  )

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

  // Sync rooms → blocks
  useEffect(() => {
    if (!rooms?.length) { setAllBlocks([]); setActiveFloor(1); return }
    const byFloor = new Map<number, Room[]>()
    for (const r of rooms) {
      const f = r.floor ?? 1
      if (!byFloor.has(f)) byFloor.set(f, [])
      byFloor.get(f)!.push(r)
    }
    const all: LayoutBlock[] = []
    for (const [, floorRooms] of byFloor) {
      all.push(...autoArrangeFloor(floorRooms, gridCols))
    }
    setAllBlocks(all)
    setDirty(false)
    setActiveFloor(1)
  }, [rooms, gridCols])

  // --------------- DRAG ---------------
  const gridRef = useRef<HTMLDivElement>(null)
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

  const handlePointerDown = useCallback((e: React.PointerEvent, blockId: string, mode: 'move' | 'resize') => {
    if (isMobile || !canEdit) return
    e.preventDefault()
    e.stopPropagation()
    const block = floorBlocks.find(b => b.id === blockId)
    if (!block) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragState.current = {
      blockId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBlockX: block.x,
      startBlockY: block.y,
      mode,
      startW: block.w,
      startH: block.h,
      origBlock: { ...block },
    }
  }, [floorBlocks, isMobile, canEdit])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds || !gridRef.current) return
    e.preventDefault()

    const rect = gridRef.current.getBoundingClientRect()
    const scale = rect.width / (gridCols * CELL_SIZE)
    const cellPx = CELL_SIZE * scale
    const deltaX = Math.round((e.clientX - ds.startMouseX) / cellPx)
    const deltaY = Math.round((e.clientY - ds.startMouseY) / cellPx)

    setAllBlocks(prev => {
      const idx = prev.findIndex(b => b.id === ds.blockId)
      if (idx === -1) return prev
      const current = prev[idx]

      let updated: LayoutBlock
      if (ds.mode === 'move') {
        const nx = Math.max(0, Math.min(ds.startBlockX + deltaX, gridCols - current.w))
        const ny = Math.max(0, Math.min(ds.startBlockY + deltaY, gridRows - current.h))
        updated = { ...current, x: nx, y: ny }
      } else {
        const nw = Math.max(1, Math.min(ds.startW + deltaX, gridCols - current.x))
        const nh = Math.max(1, Math.min(ds.startH + deltaY, gridRows - current.y))
        updated = { ...current, w: nw, h: nh }
      }

      const sameFloor = prev.filter(b => b.floor === current.floor && b.id !== ds.blockId)
      if (hasCollision(sameFloor, updated, ds.blockId)) return prev

      const next = [...prev]
      next[idx] = updated
      return next
    })
  }, [gridCols, gridRows])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    if (!ds) return
    ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)

    const block = allBlocks.find(b => b.id === ds.blockId)
    if (block && (block.x !== ds.origBlock.x || block.y !== ds.origBlock.y ||
        block.w !== ds.origBlock.w || block.h !== ds.origBlock.h)) {
      setDirty(true)
    }
    dragState.current = null
  }, [allBlocks])

  // --------------- SAVE ---------------
  const handleSave = async () => {
    if (!tenantId || !effectiveLocation) return
    setSaving(true)
    try {
      const promises = allBlocks.map(b =>
        supabase.from('rooms').update({
          layout_x: b.x, layout_y: b.y,
          layout_w: b.w, layout_h: b.h,
          floor: b.floor,
        }).eq('id', b.id).eq('tenant_id', tenantId)
      )
      const results = await Promise.all(promises)
      const failed = results.filter(r => r.error)
      if (failed.length) throw new Error(failed[0].error!.message)

      setDirty(false)
      qc.invalidateQueries({ queryKey: ['rooms'] })
      toast.success('Floor plan saved')
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  // --------------- RESET (current floor) ---------------
  const handleReset = () => {
    if (!rooms?.length) return
    const floorRooms = rooms.filter(r => (r.floor ?? 1) === activeFloor)
    const resetBlocks = resetArrangeFloor(floorRooms, gridCols, gridRows)
    setAllBlocks(prev => [
      ...prev.filter(b => b.floor !== activeFloor),
      ...resetBlocks,
    ])
    setDirty(true)
  }

  // --------------- ADD SPACE ---------------
  const createRoom = useCreateRoom()
  const handleAddSpace = async (name: string, type: SpaceType, floor: number) => {
    if (!tenantId || !effectiveLocation) return
    try {
      await createRoom.mutateAsync({
        tenant_id: tenantId,
        location_id: effectiveLocation,
        name: `${name} (${type})`,
        primary_instruments: [],
        notes: `Non-teaching space: ${type}`,
      })
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
        await supabase.from('rooms').update({
          status: 'storage', is_active: false, floor,
        }).eq('id', newRoom.id)
      }
      qc.invalidateQueries({ queryKey: ['rooms'] })
      setShowAddSpace(false)
      toast.success(`${name} added to Floor ${floor}`)
    } catch (err: any) {
      toast.error(`Failed to add space: ${err.message}`)
    }
  }

  // --------------- RENDER ---------------
  const gridWidth = gridCols * CELL_SIZE
  const gridHeight = gridRows * CELL_SIZE

  if (isLoading) {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16 }}>
      {/* Location selector */}
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

      {/* Floor tabs */}
      {isMultiFloor && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {floors.map(f => (
            <button
              key={f}
              onClick={() => setActiveFloor(f)}
              style={{
                padding: '6px 16px',
                borderRadius: 8,
                border: `1.5px solid ${activeFloor === f ? brandColor : 'rgba(255,255,255,0.1)'}`,
                background: activeFloor === f ? `${brandColor}20` : 'transparent',
                color: activeFloor === f ? '#fff' : 'var(--text-muted)',
                fontFamily: 'var(--font-display)',
                fontWeight: 800,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              Floor {f}
            </button>
          ))}
        </div>
      )}

      {/* Floor label */}
      {isMultiFloor && (
        <p style={{
          fontSize: 12, color: 'var(--text-muted)', marginBottom: 10,
          fontFamily: 'var(--font-display)', fontWeight: 600,
        }}>
          {FLOOR_LABELS[activeFloor] ?? `Floor ${activeFloor}`}
        </p>
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
          aspectRatio: `${gridCols} / ${gridRows}`,
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
          {Array.from({ length: gridCols + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * CELL_SIZE} y1={0} x2={i * CELL_SIZE} y2={gridHeight}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
          {Array.from({ length: gridRows + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * CELL_SIZE} x2={gridWidth} y2={i * CELL_SIZE}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
          ))}
        </svg>

        {/* Room blocks */}
        {floorBlocks.map(block => {
          const color = block.isSpace ? '#666' : brandColor
          const isDragging = dragState.current?.blockId === block.id
          return (
            <div
              key={block.id}
              style={{
                position: 'absolute',
                left: `${(block.x / gridCols) * 100}%`,
                top: `${(block.y / gridRows) * 100}%`,
                width: `${(block.w / gridCols) * 100}%`,
                height: `${(block.h / gridRows) * 100}%`,
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
                transition: isDragging ? 'none' : 'left 0.15s, top 0.15s, width 0.15s, height 0.15s',
                zIndex: isDragging ? 10 : 1,
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

              {!block.isSpace && block.inventoryCount > 0 && (
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 'auto' }}>
                  {block.inventoryCount} item{block.inventoryCount !== 1 ? 's' : ''}
                </span>
              )}

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
        {floorBlocks.length === 0 && !isLoading && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-muted)', fontSize: 14,
          }}>
            {isMultiFloor ? `No rooms on Floor ${activeFloor}` : 'No rooms at this location'}
          </div>
        )}
      </div>

      {/* Add Space Modal */}
      {showAddSpace && (
        <AddSpaceModal
          onClose={() => setShowAddSpace(false)}
          onAdd={handleAddSpace}
          isMultiFloor={isMultiFloor}
          defaultFloor={activeFloor}
        />
      )}
    </div>
  )
}

// --------------- ADD SPACE MODAL ---------------
function AddSpaceModal({ onClose, onAdd, isMultiFloor, defaultFloor }: {
  onClose: () => void
  onAdd: (name: string, type: SpaceType, floor: number) => void
  isMultiFloor: boolean
  defaultFloor: number
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<SpaceType>('Lobby')
  const [floor, setFloor] = useState(defaultFloor)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    await onAdd(name.trim(), type, floor)
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
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Type</label>
            <select className="filter-select" value={type} onChange={e => setType(e.target.value as SpaceType)} style={{ width: '100%' }}>
              {SPACE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Floor</label>
            <select className="filter-select" value={floor} onChange={e => setFloor(Number(e.target.value))} style={{ width: '100%' }}>
              <option value={1}>Floor 1 — Main Level</option>
              <option value={2}>Floor 2 — Upper Level</option>
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
