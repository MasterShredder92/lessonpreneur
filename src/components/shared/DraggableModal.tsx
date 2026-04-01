import { useState, useRef, useCallback, useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, Minimize2, GripHorizontal } from 'lucide-react'

// ═══════════════════════════════════════
// GLOBAL MODAL STACK — tracks open draggable modals for split view
// ═══════════════════════════════════════
type ModalEntry = { id: string; setPosition: (pos: { x: number; y: number; w: string; h: string }) => void }
const modalStack: ModalEntry[] = []
const listeners: Set<() => void> = new Set()
function registerModal(entry: ModalEntry) { modalStack.push(entry); listeners.forEach(l => l()) }
function unregisterModal(id: string) { const i = modalStack.findIndex(m => m.id === id); if (i >= 0) modalStack.splice(i, 1); listeners.forEach(l => l()) }
function getStackSize() { return modalStack.length }
function onStackChange(cb: () => void) { listeners.add(cb); return () => { listeners.delete(cb) } }

function triggerSplitView() {
  if (modalStack.length < 2) return
  const vw = window.innerWidth
  const vh = window.innerHeight
  const pad = 16
  const halfW = Math.floor((vw - pad * 3) / 2)
  // First modal → left half
  modalStack[modalStack.length - 2].setPosition({ x: pad, y: pad, w: `${halfW}px`, h: `${vh - pad * 2}px` })
  // Second modal → right half
  modalStack[modalStack.length - 1].setPosition({ x: pad * 2 + halfW, y: pad, w: `${halfW}px`, h: `${vh - pad * 2}px` })
}

function triggerResetView() {
  for (const m of modalStack) {
    m.setPosition({ x: -1, y: -1, w: '', h: '' }) // -1 signals "centered"
  }
}

// ═══════════════════════════════════════
// DRAGGABLE MODAL COMPONENT
// ═══════════════════════════════════════
interface DraggableModalProps {
  id: string
  onClose: () => void
  title: ReactNode
  subtitle?: ReactNode
  headerRight?: ReactNode
  width?: number | string
  height?: number | string
  children: ReactNode
  /** Top accent bar color, default pink gradient */
  accentColor?: string
  zIndex?: number
}

export default function DraggableModal({
  id, onClose, title, subtitle, headerRight, width = 680, height = '75vh', children, accentColor, zIndex = 9999,
}: DraggableModalProps) {
  const [pos, setPos] = useState<{ x: number; y: number; w: string; h: string }>({ x: -1, y: -1, w: '', h: '' })
  const [isSplit, setIsSplit] = useState(false)
  const [stackSize, setStackSize] = useState(getStackSize)
  const dragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement>(null)

  const isCentered = pos.x === -1

  // Register in modal stack
  useEffect(() => {
    const entry: ModalEntry = {
      id,
      setPosition: (p) => {
        setPos(p)
        setIsSplit(p.x !== -1 && p.w !== '')
      },
    }
    registerModal(entry)
    return () => unregisterModal(id)
  }, [id])

  // Listen for stack changes
  useEffect(() => onStackChange(() => setStackSize(getStackSize())), [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input, textarea')) return
    e.preventDefault()
    dragging.current = true
    const rect = modalRef.current?.getBoundingClientRect()
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    const handleMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const newX = Math.max(0, Math.min(window.innerWidth - 100, ev.clientX - dragOffset.current.x))
      const newY = Math.max(0, Math.min(window.innerHeight - 40, ev.clientY - dragOffset.current.y))
      setPos(prev => ({ ...prev, x: newX, y: newY }))
    }
    const handleUp = () => {
      dragging.current = false
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
  }, [])

  const handleSplitToggle = () => {
    if (isSplit) { triggerResetView(); setIsSplit(false) }
    else { triggerSplitView(); setIsSplit(true) }
  }

  // Compute style
  const modalStyle: CSSProperties = isCentered && !isSplit
    ? { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: typeof width === 'number' ? `${width}px` : width, height, maxHeight: '90vh', zIndex }
    : { position: 'fixed', top: pos.y, left: pos.x, width: pos.w || (typeof width === 'number' ? `${width}px` : width), height: pos.h || height, maxHeight: '95vh', zIndex }

  return createPortal(
    <>
      {/* Backdrop — only for the first modal, or when centered */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1, background: 'rgba(0,0,0,0.55)', pointerEvents: isSplit ? 'none' : 'auto' }}
        onClick={isSplit ? undefined : onClose}
      />
      <div ref={modalRef} onClick={(e) => e.stopPropagation()} style={{
        ...modalStyle,
        display: 'flex', flexDirection: 'column',
        background: '#141224', borderRadius: isSplit ? 14 : 20,
        border: '1px solid rgba(212,34,106,0.15)',
        boxShadow: '0 0 60px rgba(212,34,106,0.08), 0 24px 60px rgba(0,0,0,0.5)',
        overflow: 'hidden', transition: dragging.current ? 'none' : 'all 250ms ease',
      }}>
        {/* Accent bar */}
        <div style={{ height: 3, background: accentColor ?? 'linear-gradient(90deg, #D4226A, #7B2CBF)', flexShrink: 0, borderRadius: isSplit ? '14px 14px 0 0' : '20px 20px 0 0' }} />

        {/* Draggable header */}
        <div
          onMouseDown={handleMouseDown}
          style={{ padding: '14px 20px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'grab', userSelect: 'none', flexShrink: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <GripHorizontal size={14} style={{ color: '#363656', flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: isSplit ? 16 : 20, fontWeight: 800, color: '#E0E0F4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
              {subtitle && <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 1 }}>{subtitle}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 10 }}>
            {headerRight}
            {stackSize >= 2 && (
              <button onClick={handleSplitToggle} title={isSplit ? 'Reset view' : 'Split view'} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 5, cursor: 'pointer', color: isSplit ? '#E8488A' : '#8080A8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isSplit ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 5, cursor: 'pointer', color: '#8080A8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>×</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
    </>,
    document.body
  )
}
