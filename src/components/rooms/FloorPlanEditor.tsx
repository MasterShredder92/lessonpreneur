import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRooms, type Room, type InventoryItem } from '../../hooks/useRooms'
import { useLocations } from '../../hooks/useLocations'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocationColor } from '../../utils/locationColor'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'
import { toast } from '../shared/Toast'
import MusicLoader from '../shared/MusicLoader'
import { Trash2 } from 'lucide-react'
import { qk } from '../../lib/queryKeys'

// --------------- CONSTANTS ---------------
const DEFAULT_COLS = 12
const DEFAULT_ROWS = 10
const CELL_SIZE = 60
const TENANT_ID = '00000000-0000-0000-0000-000000000001'

const SPACE_TYPES = ['Lobby', 'Bathroom', 'Storage', 'Office', 'Hallway'] as const
type SpaceType = typeof SPACE_TYPES[number]

const FLOOR_LABELS: Record<number, string> = {
  1: 'Floor 1 — Main Level',
  2: 'Floor 2 — Upper Level',
}

const ROOM_TYPES = [
  { value: 'lesson_room', label: 'Lesson Room' },
  { value: 'waiting_area', label: 'Waiting Area' },
  { value: 'storage', label: 'Storage' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
] as const

const CONDITIONS = ['Good', 'Fair', 'Needs Repair'] as const

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
  color: string | null
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
    color: r.color,
  }
}

function findOpenCell(placed: LayoutBlock[], w: number, h: number, cols: number, rows: number): { x: number; y: number } {
  for (let row = 0; row + h <= rows; row++) {
    for (let col = 0; col + w <= cols; col++) {
      const candidate = { x: col, y: row, w, h, id: '', name: '', floor: 0, isSpace: false, instruments: [], inventoryCount: 0, status: '', color: null }
      if (!hasCollision(placed, candidate, '')) return { x: col, y: row }
    }
  }
  // Fallback: place beyond grid bottom (will be visible but not overlapping)
  return { x: 0, y: rows }
}

function autoArrangeFloor(rooms: Room[], cols: number, rows: number): LayoutBlock[] {
  // First pass: collect rooms that already have saved positions
  const placed: LayoutBlock[] = []
  const needsPlacement: Room[] = []

  for (const r of rooms) {
    if (isDefaultPosition(r)) {
      needsPlacement.push(r)
    } else {
      placed.push(roomToBlock(r))
    }
  }

  // Second pass: place default-position rooms in open cells, checking against already-placed rooms
  for (const r of needsPlacement) {
    const block = roomToBlock(r)
    const pos = findOpenCell(placed, block.w, block.h, cols, rows)
    block.x = pos.x
    block.y = pos.y
    placed.push(block)
  }

  return placed
}

function resetArrangeFloor(rooms: Room[], cols: number, rows: number): LayoutBlock[] {
  const placed: LayoutBlock[] = []
  const sorted = [...rooms].sort((a, b) => a.display_order - b.display_order)
  for (const r of sorted) {
    const def = defaultBlockSize(r)
    const block = roomToBlock(r)
    block.w = def.w
    block.h = def.h
    const pos = findOpenCell(placed, block.w, block.h, cols, rows)
    if (pos.y + block.h > rows) break
    block.x = pos.x
    block.y = pos.y
    placed.push(block)
  }
  return placed
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

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function FloorPlanEditor({ locationId }: { locationId?: string }) {
  const { role, tenantId } = useAuthContext()
  const { data: locations } = useLocations()
  const qc = useQueryClient()
  const canEdit = role === 'owner' || role === 'admin'

  const [selectedLocation, setSelectedLocation] = useState('')
  const effectiveLocation = locationId || selectedLocation || (locations?.[0]?.id ?? '')
  const { data: rooms, isLoading } = useRooms(effectiveLocation || undefined)

  const activeLocationObj = useMemo(
    () => locations?.find(l => l.id === effectiveLocation),
    [locations, effectiveLocation],
  )
  const gridCols = activeLocationObj?.floorplan_cols ?? DEFAULT_COLS
  const gridRows = activeLocationObj?.floorplan_rows ?? DEFAULT_ROWS

  const [allBlocks, setAllBlocks] = useState<LayoutBlock[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showAddSpace, setShowAddSpace] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)

  const brandColor = getLocationColor(effectiveLocation)

  const minFloors = activeLocationObj?.min_floors ?? 1

  const floors = useMemo(() => {
    const set = new Set(allBlocks.map(b => b.floor))
    // Ensure at least minFloors grids render (e.g. Bellevue = 2 floors)
    for (let f = 1; f <= minFloors; f++) set.add(f)
    if (set.size === 0) set.add(1)
    return [...set].sort()
  }, [allBlocks, minFloors])

  const isMultiFloor = floors.length > 1

  const selectedRoom = useMemo(
    () => rooms?.find(r => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  )

  useEffect(() => {
    if (!selectedLocation && !locationId && locations?.length) {
      setSelectedLocation(locations[0].id)
    }
  }, [locations, selectedLocation, locationId])

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (!rooms?.length) { setAllBlocks([]); return }

    setAllBlocks(prev => {
      // Build a map of existing block positions so we preserve dragged-but-unsaved state
      const existingMap = new Map(prev.map(b => [b.id, b]))

      const byFloor = new Map<number, Room[]>()
      for (const r of rooms) {
        const f = r.floor ?? 1
        if (!byFloor.has(f)) byFloor.set(f, [])
        byFloor.get(f)!.push(r)
      }

      const all: LayoutBlock[] = []
      for (const [, floorRooms] of byFloor) {
        // Separate rooms that already have a block in local state vs new rooms
        const knownRooms: Room[] = []
        const newRooms: Room[] = []
        for (const r of floorRooms) {
          if (existingMap.has(r.id)) {
            knownRooms.push(r)
          } else {
            newRooms.push(r)
          }
        }

        // Keep existing blocks for known rooms (preserves drag positions)
        const placed: LayoutBlock[] = []
        for (const r of knownRooms) {
          const existing = existingMap.get(r.id)!
          // Update metadata from refetch but keep position from local state
          placed.push({
            ...existing,
            name: r.name,
            instruments: r.primary_instruments ?? [],
            inventoryCount: r.inventory?.length ?? 0,
            status: r.status,
            color: r.color,
            floor: r.floor ?? 1,
            isSpace: r.status === 'storage' && !r.is_active,
          })
        }

        // Place new rooms in open cells
        for (const r of newRooms) {
          const block = roomToBlock(r)
          if (isDefaultPosition(r)) {
            const pos = findOpenCell(placed, block.w, block.h, gridCols, gridRows)
            block.x = pos.x
            block.y = pos.y
          }
          placed.push(block)
        }

        all.push(...placed)
      }

      return all
    })
  }, [rooms, gridCols, gridRows])

  // --------------- DRAG ---------------
  const gridRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const didDrag = useRef(false)
  const dragState = useRef<{
    blockId: string
    floor: number
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
    const block = allBlocks.find(b => b.id === blockId)
    if (!block) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    didDrag.current = false
    dragState.current = {
      blockId,
      floor: block.floor,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBlockX: block.x,
      startBlockY: block.y,
      mode,
      startW: block.w,
      startH: block.h,
      origBlock: { ...block },
    }
  }, [allBlocks, isMobile, canEdit])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragState.current
    const gridEl = ds ? gridRefs.current.get(ds.floor) : null
    if (!ds || !gridEl) return
    e.preventDefault()

    const rect = gridEl.getBoundingClientRect()
    const scale = rect.width / (gridCols * CELL_SIZE)
    const cellPx = CELL_SIZE * scale
    const deltaX = Math.round((e.clientX - ds.startMouseX) / cellPx)
    const deltaY = Math.round((e.clientY - ds.startMouseY) / cellPx)

    if (deltaX !== 0 || deltaY !== 0) didDrag.current = true

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

    // If no drag happened, treat as a click → select room
    if (!didDrag.current) {
      setSelectedRoomId(ds.blockId)
    }
    dragState.current = null
  }, [allBlocks])

  // Click empty canvas → close panel
  const handleCanvasClick = useCallback((e: React.PointerEvent) => {
    const el = e.target as HTMLElement
    const isGrid = [...gridRefs.current.values()].some(g => g === el)
    if (isGrid || el.tagName === 'svg' || el.tagName === 'line') {
      setSelectedRoomId(null)
    }
  }, [])

  // --------------- SAVE LAYOUT ---------------
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
      qc.invalidateQueries({ queryKey: qk.rooms.all })
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
    const byFloor = new Map<number, Room[]>()
    for (const r of rooms) {
      const f = r.floor ?? 1
      if (!byFloor.has(f)) byFloor.set(f, [])
      byFloor.get(f)!.push(r)
    }
    const all: LayoutBlock[] = []
    for (const [, floorRooms] of byFloor) {
      all.push(...resetArrangeFloor(floorRooms, gridCols, gridRows))
    }
    setAllBlocks(all)
    setDirty(true)
  }

  // --------------- ADD SPACE ---------------
  const handleAddSpace = async (name: string, type: SpaceType, floor: number) => {
    if (!tenantId || !effectiveLocation) return
    try {
      // Find an open position on the target floor
      const floorBlocks = allBlocks.filter(b => b.floor === floor)
      const pos = findOpenCell(floorBlocks, 2, 2, gridCols, gridRows)

      const { error } = await supabase.from('rooms').insert({
        tenant_id: tenantId,
        location_id: effectiveLocation,
        name: `${name} (${type})`,
        primary_instruments: [],
        notes: `Non-teaching space: ${type}`,
        status: 'storage',
        is_active: false,
        floor,
        layout_x: pos.x,
        layout_y: pos.y,
        layout_w: 2,
        layout_h: 2,
      })
      if (error) throw error

      qc.invalidateQueries({ queryKey: qk.rooms.all })
      setShowAddSpace(false)
      toast.success(`${name} added to Floor ${floor}`)
    } catch (err: any) {
      toast.error(`Failed to add space: ${err.message}`)
    }
  }

  // --------------- ROOM NAME UPDATE (optimistic on canvas) ---------------
  const updateBlockName = useCallback((roomId: string, name: string) => {
    setAllBlocks(prev => prev.map(b => b.id === roomId ? { ...b, name } : b))
  }, [])

  // --------------- DELETE ROOM ---------------
  const handleDeleteRoom = async (roomId: string) => {
    if (!tenantId) return
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', roomId).eq('tenant_id', tenantId)
      if (error) throw error
      setSelectedRoomId(null)
      qc.invalidateQueries({ queryKey: qk.rooms.all })
      toast.success('Room deleted')
    } catch (err: any) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  // --------------- RENDER ---------------
  const gridWidth = gridCols * CELL_SIZE
  const gridHeight = gridRows * CELL_SIZE
  const panelOpen = selectedRoomId !== null

  if (isLoading) {
    return (
      <div style={{ marginTop: 16 }}>
        <div className="loading-screen" style={{ height: 200 }}><MusicLoader /></div>
      </div>
    )
  }

  return (
    <div style={{ marginTop: 16, position: 'relative' }}>
      {/* Location selector */}
      {!locationId && (
        <div style={{ marginBottom: 16 }}>
          <select
            value={selectedLocation}
            onChange={e => { setSelectedLocation(e.target.value); setDirty(false); setSelectedRoomId(null) }}
            className="filter-select"
          >
            {locations?.map(l => (
              <option key={l.id} value={l.id}>{l.name.replace(' Music Lessons', '')}</option>
            ))}
          </select>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {canEdit && !isMobile && (
          <>
            <button className="btn-outline" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowAddSpace(true) }} style={{ fontSize: 13 }}>+ Add Space</button>
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
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Unsaved changes</span>
        )}
      </div>

      {isMobile && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Floor plan editing is available on desktop
        </p>
      )}

      {/* Stacked grids — one per floor */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {floors.map((f, idx) => {
            const blocksOnFloor = allBlocks.filter(b => b.floor === f)
            return (
              <div key={f} style={{ marginBottom: idx < floors.length - 1 ? 24 : 0 }}>
                {/* Floor label + divider */}
                {isMultiFloor && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
                    borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                    paddingTop: idx > 0 ? 20 : 0,
                  }}>
                    <span style={{
                      fontSize: 14, fontWeight: 800, color: '#E0E0F4',
                      fontFamily: 'var(--font-display)',
                    }}>
                      {FLOOR_LABELS[f] ?? `Floor ${f}`}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {blocksOnFloor.length} room{blocksOnFloor.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}

                {/* Grid canvas */}
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
                  ref={el => { if (el) gridRefs.current.set(f, el); else gridRefs.current.delete(f) }}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerDown={handleCanvasClick}
                >
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

                  {blocksOnFloor.map(block => {
                    const blockColor = block.color || (block.isSpace ? '#666' : brandColor)
                    const isDragging = dragState.current?.blockId === block.id
                    const isSelected = block.id === selectedRoomId
                    return (
                      <div
                        key={block.id}
                        style={{
                          position: 'absolute',
                          left: `${(block.x / gridCols) * 100}%`,
                          top: `${(block.y / gridRows) * 100}%`,
                          width: `${(block.w / gridCols) * 100}%`,
                          height: `${(block.h / gridRows) * 100}%`,
                          background: `${blockColor}30`,
                          border: `2px solid ${blockColor}`,
                          borderRadius: 8,
                          padding: '6px 8px',
                          boxSizing: 'border-box',
                          cursor: canEdit && !isMobile ? 'grab' : 'pointer',
                          userSelect: 'none',
                          display: 'flex',
                          flexDirection: 'column',
                          overflow: 'hidden',
                          transition: isDragging ? 'none' : 'left 0.15s, top 0.15s, width 0.15s, height 0.15s',
                          zIndex: isDragging ? 10 : isSelected ? 5 : 1,
                          outline: isSelected ? '2px solid #fff' : 'none',
                          outlineOffset: 1,
                        }}
                        onPointerDown={e => {
                          if (canEdit && !isMobile) {
                            handlePointerDown(e, block.id, 'move')
                          } else {
                            e.stopPropagation()
                            setSelectedRoomId(block.id)
                          }
                        }}
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
                            style={{ position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, cursor: 'nwse-resize' }}
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

                  {blocksOnFloor.length === 0 && !isLoading && (
                    <div style={{
                      position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--text-muted)', fontSize: 14,
                    }}>
                      {isMultiFloor ? `No rooms on Floor ${f}` : 'No rooms at this location'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Side Panel — desktop */}
        {!isMobile && (
          <RoomDetailPanel
            room={selectedRoom}
            brandColor={brandColor}
            block={allBlocks.find(b => b.id === selectedRoomId) ?? null}
            onClose={() => setSelectedRoomId(null)}
            onNameChange={updateBlockName}
            onDelete={handleDeleteRoom}
            canEdit={canEdit}
          />
        )}
      </div>

      {/* Bottom sheet — mobile */}
      {isMobile && (
        <MobileRoomSheet
          room={selectedRoom}
          brandColor={brandColor}
          block={allBlocks.find(b => b.id === selectedRoomId) ?? null}
          onClose={() => setSelectedRoomId(null)}
          onNameChange={updateBlockName}
          onDelete={handleDeleteRoom}
          canEdit={canEdit}
        />
      )}

      {showAddSpace && (
        <AddSpaceModal
          onClose={() => setShowAddSpace(false)}
          onAdd={handleAddSpace}
          isMultiFloor={isMultiFloor}
          defaultFloor={floors[floors.length - 1] ?? 1}
        />
      )}
    </div>
  )
}

// ============================================================
// ROOM DETAIL PANEL (desktop slide-in)
// ============================================================
interface PanelProps {
  room: Room | null
  brandColor: string
  block: LayoutBlock | null
  onClose: () => void
  onNameChange: (id: string, name: string) => void
  onDelete: (id: string) => void
  canEdit: boolean
}

function RoomDetailPanel({ room, brandColor, block, onClose, onNameChange, onDelete, canEdit }: PanelProps) {
  return (
    <div style={{
      width: 320,
      minHeight: 400,
      flexShrink: 0,
      background: 'linear-gradient(150deg, rgba(22,20,40,0.97), rgba(16,14,30,0.99))',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 16,
      overflow: 'hidden',
      transform: room ? 'translateX(0)' : 'translateX(20px)',
      opacity: room ? 1 : 0,
      pointerEvents: room ? 'auto' : 'none',
      transition: 'transform 200ms ease, opacity 200ms ease',
    }}>
      {room && block && (
        <RoomPanelContent
          room={room}
          brandColor={brandColor}
          block={block}
          onClose={onClose}
          onNameChange={onNameChange}
          onDelete={onDelete}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}

function MobileRoomSheet({ room, brandColor, block, onClose, onNameChange, onDelete, canEdit }: PanelProps) {
  return (
    <div style={{
      position: 'fixed',
      left: 0, right: 0, bottom: 0,
      maxHeight: '70vh',
      background: 'linear-gradient(150deg, rgba(22,20,40,0.99), rgba(16,14,30,0.99))',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '16px 16px 0 0',
      overflow: 'auto',
      transform: room ? 'translateY(0)' : 'translateY(100%)',
      transition: 'transform 200ms ease',
      zIndex: 100,
      boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
    }}>
      {room && block && (
        <RoomPanelContent
          room={room}
          brandColor={brandColor}
          block={block}
          onClose={onClose}
          onNameChange={onNameChange}
          onDelete={onDelete}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}

// ============================================================
// SHARED PANEL CONTENT
// ============================================================
function RoomPanelContent({ room, brandColor, block, onClose, onNameChange, onDelete, canEdit }: PanelProps & { room: Room; block: LayoutBlock }) {
  const qc = useQueryClient()
  const [editName, setEditName] = useState(room.name)
  const [roomType, setRoomType] = useState(room.room_type ?? 'lesson_room')
  const [notes, setNotes] = useState(room.notes ?? '')
  const [roomColor, setRoomColor] = useState(room.color ?? brandColor)
  const [savingRoom, setSavingRoom] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sync when room changes (switching rooms without closing panel)
  useEffect(() => {
    setEditName(room.name)
    setRoomType(room.room_type ?? 'lesson_room')
    setNotes(room.notes ?? '')
    setRoomColor(room.color ?? brandColor)
    setShowAddItem(false)
    setConfirmDelete(false)
  }, [room.id, room.name, room.room_type, room.notes, room.color, brandColor])

  // Save room name on blur
  const handleNameBlur = async () => {
    const trimmed = editName.trim()
    if (!trimmed || trimmed === room.name) { setEditName(room.name); return }
    onNameChange(room.id, trimmed)
    await supabase.from('rooms').update({ name: trimmed }).eq('id', room.id).eq('tenant_id', TENANT_ID)
    qc.invalidateQueries({ queryKey: qk.rooms.all })
  }

  const handleNameKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }

  // Save all room details
  const handleSaveRoom = async () => {
    setSavingRoom(true)
    try {
      const { error } = await supabase.from('rooms').update({
        name: editName.trim() || room.name,
        room_type: roomType,
        notes: notes || null,
        color: roomColor === brandColor ? null : roomColor,
      }).eq('id', room.id).eq('tenant_id', TENANT_ID)
      if (error) throw error
      onNameChange(room.id, editName.trim() || room.name)
      qc.invalidateQueries({ queryKey: qk.rooms.all })
      toast.success('Room saved')
    } catch (err: any) {
      toast.error(`Save failed: ${err.message}`)
    } finally {
      setSavingRoom(false)
    }
  }

  const PRESET_COLORS = [brandColor, '#D41113', '#00A651', '#A333FF', '#00A5E8', '#D4226A', '#FF5500', '#FFB800', '#666666']

  const s = panelStyles

  return (
    <div style={{ padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        {/* Color swatch */}
        <div style={{ position: 'relative' }}>
          <label style={{ cursor: canEdit ? 'pointer' : 'default' }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: roomColor, border: '2px solid rgba(255,255,255,0.2)',
              flexShrink: 0,
            }} />
            {canEdit && (
              <input
                type="color"
                value={roomColor}
                onChange={e => setRoomColor(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
            )}
          </label>
        </div>

        {/* Editable name */}
        <input
          value={editName}
          onChange={e => setEditName(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={handleNameKey}
          readOnly={!canEdit}
          style={{
            flex: 1, fontSize: 16, fontWeight: 800, color: '#fff',
            fontFamily: 'var(--font-display)',
            background: 'transparent', border: 'none', outline: 'none',
            borderBottom: canEdit ? '1px solid rgba(255,255,255,0.1)' : 'none',
            padding: '2px 0',
          }}
        />

        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--text-muted)',
          cursor: 'pointer', fontSize: 18, padding: '4px 8px', flexShrink: 0,
        }}>
          ✕
        </button>
      </div>

      {/* Color presets */}
      {canEdit && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              onClick={() => setRoomColor(c)}
              style={{
                width: 20, height: 20, borderRadius: 6, background: c,
                border: roomColor === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer', padding: 0,
              }}
            />
          ))}
        </div>
      )}

      {/* Section: Room Details */}
      <div style={s.section}>
        <h4 style={s.sectionTitle}>Room Details</h4>

        <div style={s.field}>
          <label style={s.label}>Type</label>
          {canEdit ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ROOM_TYPES.map(rt => (
                <button
                  key={rt.value}
                  onClick={() => setRoomType(rt.value)}
                  style={{
                    padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                    border: roomType === rt.value ? `1.5px solid ${brandColor}` : '1px solid rgba(255,255,255,0.1)',
                    background: roomType === rt.value ? `${brandColor}20` : 'transparent',
                    color: roomType === rt.value ? '#fff' : 'var(--text-muted)',
                    cursor: 'pointer',
                  }}
                >
                  {rt.label}
                </button>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: 13, color: '#fff' }}>
              {ROOM_TYPES.find(rt => rt.value === roomType)?.label ?? roomType}
            </span>
          )}
        </div>

        <div style={s.field}>
          <label style={s.label}>Floor</label>
          {canEdit ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={async () => {
                  const newFloor = Math.max(1, block.floor - 1)
                  if (newFloor === block.floor) return
                  await supabase.from('rooms').update({ floor: newFloor }).eq('id', room.id).eq('tenant_id', TENANT_ID)
                  qc.invalidateQueries({ queryKey: qk.rooms.all })
                }}
                style={{
                  width: 28, height: 28, borderRadius: 6, fontSize: 14, fontWeight: 700,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >−</button>
              <span style={{ fontSize: 13, color: '#fff', fontWeight: 700, minWidth: 50, textAlign: 'center' }}>
                Floor {block.floor}
              </span>
              <button
                onClick={async () => {
                  const newFloor = block.floor + 1
                  await supabase.from('rooms').update({ floor: newFloor }).eq('id', room.id).eq('tenant_id', TENANT_ID)
                  qc.invalidateQueries({ queryKey: qk.rooms.all })
                }}
                style={{
                  width: 28, height: 28, borderRadius: 6, fontSize: 14, fontWeight: 700,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >+</button>
            </div>
          ) : (
            <span style={{ fontSize: 13, color: '#fff' }}>Floor {block.floor}</span>
          )}
        </div>

        <div style={s.field}>
          <label style={s.label}>Dimensions</label>
          <span style={{ fontSize: 13, color: '#fff' }}>{block.w} × {block.h} cells</span>
        </div>

        <div style={s.field}>
          <label style={s.label}>Notes</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            readOnly={!canEdit}
            placeholder={canEdit ? 'Internal notes about this room…' : ''}
            rows={3}
            style={{
              width: '100%', fontSize: 12, color: '#c0c0d8',
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 8, padding: 8, resize: 'vertical', outline: 'none',
              fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Section: Inventory */}
      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={s.sectionTitle}>Inventory</h4>
          {canEdit && (
            <button onClick={() => setShowAddItem(true)} style={{
              fontSize: 11, fontWeight: 700, color: brandColor,
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px',
            }}>
              + Add Item
            </button>
          )}
        </div>

        {(room.inventory?.length ?? 0) === 0 && !showAddItem && (
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>No inventory items</p>
        )}

        {room.inventory?.map(item => (
          <InventoryRow key={item.id} item={item} canEdit={canEdit} brandColor={brandColor} />
        ))}

        {showAddItem && (
          <AddItemForm
            roomId={room.id}
            brandColor={brandColor}
            onDone={() => { setShowAddItem(false); qc.invalidateQueries({ queryKey: qk.rooms.all }) }}
            onCancel={() => setShowAddItem(false)}
          />
        )}
      </div>

      {/* Footer */}
      {canEdit && (
        <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button className="btn-primary" onClick={handleSaveRoom} disabled={savingRoom} style={{ fontSize: 13, width: '100%' }}>
            {savingRoom ? 'Saving…' : 'Save Changes'}
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} style={{
              background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer',
              fontSize: 12, padding: '6px 0', textAlign: 'center',
            }}>
              Delete Room
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button onClick={() => onDelete(room.id)} style={{
                background: 'rgba(239,68,68,0.15)', border: '1px solid #EF4444',
                color: '#EF4444', borderRadius: 8, padding: '6px 16px', fontSize: 12,
                cursor: 'pointer', fontWeight: 700,
              }}>
                Confirm Delete
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-ghost" style={{ fontSize: 12 }}>
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// INVENTORY ROW
// ============================================================
function InventoryRow({ item, canEdit, brandColor }: { item: InventoryItem; canEdit: boolean; brandColor: string }) {
  const qc = useQueryClient()
  const [qty, setQty] = useState(item.quantity)
  const [cond, setCond] = useState(item.condition ?? 'Good')

  useEffect(() => { setQty(item.quantity); setCond(item.condition ?? 'Good') }, [item.quantity, item.condition])

  const saveField = async (field: string, value: any) => {
    await supabase.from('room_inventory').update({ [field]: value }).eq('id', item.id).eq('tenant_id', TENANT_ID)
    qc.invalidateQueries({ queryKey: qk.rooms.all })
  }

  const handleDelete = async () => {
    await supabase.from('room_inventory').delete().eq('id', item.id).eq('tenant_id', TENANT_ID)
    qc.invalidateQueries({ queryKey: qk.rooms.all })
  }

  const condColor = cond === 'Good' ? '#22C55E' : cond === 'Fair' ? '#FFB800' : '#EF4444'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style={{ flex: 1, fontSize: 12, color: '#e0e0f4' }}>{item.item_name}</span>

      {canEdit ? (
        <input
          type="number"
          value={qty}
          onChange={e => setQty(Number(e.target.value))}
          onBlur={() => { if (qty !== item.quantity) saveField('quantity', qty) }}
          min={1}
          style={{
            width: 36, fontSize: 11, textAlign: 'center', color: '#fff',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '2px 4px', outline: 'none',
          }}
        />
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>×{qty}</span>
      )}

      {canEdit ? (
        <select
          value={cond}
          onChange={e => { setCond(e.target.value); saveField('condition', e.target.value) }}
          style={{
            fontSize: 10, fontWeight: 700, color: condColor,
            background: `${condColor}15`, border: `1px solid ${condColor}40`,
            borderRadius: 6, padding: '2px 6px', outline: 'none', cursor: 'pointer',
          }}
        >
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <span style={{
          fontSize: 10, fontWeight: 700, color: condColor,
          background: `${condColor}15`, borderRadius: 6, padding: '2px 6px',
        }}>
          {cond}
        </span>
      )}

      {canEdit && (
        <button onClick={handleDelete} style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          color: 'rgba(255,255,255,0.25)',
        }}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

// ============================================================
// ADD ITEM FORM
// ============================================================
function AddItemForm({ roomId, brandColor, onDone, onCancel }: {
  roomId: string; brandColor: string; onDone: () => void; onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState(1)
  const [cond, setCond] = useState('Good')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('room_inventory').insert({
        room_id: roomId,
        tenant_id: TENANT_ID,
        item_name: name.trim(),
        quantity: qty,
        condition: cond,
      })
      if (error) throw error
      onDone()
    } catch (err: any) {
      toast.error(`Add failed: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10,
      border: '1px solid rgba(255,255,255,0.06)', marginTop: 8,
    }}>
      <input
        className="form-input"
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Item name"
        autoFocus
        style={{ width: '100%', fontSize: 12, marginBottom: 8 }}
      />
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="number"
          value={qty}
          onChange={e => setQty(Number(e.target.value))}
          min={1}
          style={{
            width: 50, fontSize: 12, textAlign: 'center', color: '#fff',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '4px', outline: 'none',
          }}
        />
        <select
          value={cond}
          onChange={e => setCond(e.target.value)}
          className="filter-select"
          style={{ flex: 1, fontSize: 11 }}
        >
          {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-ghost" onClick={onCancel} style={{ fontSize: 11 }}>Cancel</button>
        <button className="btn-primary" onClick={handleSave} disabled={!name.trim() || saving} style={{ fontSize: 11 }}>
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// ADD SPACE MODAL
// ============================================================
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
    try {
      await onAdd(name.trim(), type, floor)
    } catch {
      // Error handling is done by the parent
    } finally {
      setSubmitting(false)
    }
  }

  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    // Focus without scrolling
    nameRef.current?.focus({ preventScroll: true })
  }, [])

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
              ref={nameRef}
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Front Lobby"
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

// ============================================================
// STYLES
// ============================================================
const panelStyles = {
  section: {
    marginBottom: 20,
    paddingTop: 16,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  } as React.CSSProperties,
  sectionTitle: {
    margin: '0 0 10px', fontSize: 13, fontWeight: 800, color: '#e0e0f4',
    fontFamily: 'var(--font-display)',
  } as React.CSSProperties,
  field: {
    marginBottom: 12,
  } as React.CSSProperties,
  label: {
    fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontWeight: 600,
  } as React.CSSProperties,
}
