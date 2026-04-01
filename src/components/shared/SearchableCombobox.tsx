import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, Plus, ChevronDown } from 'lucide-react'

interface Option {
  id: string
  label: string
  sublabel?: string
}

interface Props {
  options: Option[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  showCreateNew?: boolean
  onCreateNew?: () => void
  createNewLabel?: string
  isLoading?: boolean
}

export default function SearchableCombobox({
  options, value, onChange, placeholder = 'Search...', showCreateNew, onCreateNew, createNewLabel = '+ Create New', isLoading,
}: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find(o => o.id === value)

  const filtered = query
    ? options.filter(o => {
        const q = query.toLowerCase()
        return o.label.toLowerCase().includes(q) || (o.sublabel?.toLowerCase().includes(q) ?? false)
      })
    : options

  // Reset highlight when filtered list changes
  useEffect(() => { setHighlightIdx(0) }, [filtered.length])

  // Click outside to close
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        if (!value) setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [value])

  // Scroll highlighted item into view
  useEffect(() => {
    if (!open || !listRef.current) return
    const items = listRef.current.children
    const item = items[highlightIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  const select = useCallback((id: string) => {
    onChange(id)
    const opt = options.find(o => o.id === id)
    setQuery(opt?.label ?? '')
    setOpen(false)
  }, [onChange, options])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault() }
      return
    }
    const maxIdx = filtered.length + (showCreateNew ? 1 : 0) - 1
    if (e.key === 'ArrowDown') { setHighlightIdx(i => Math.min(i + 1, maxIdx)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setHighlightIdx(i => Math.max(i - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx < filtered.length) {
        select(filtered[highlightIdx].id)
      } else if (showCreateNew && onCreateNew) {
        onCreateNew()
        setOpen(false)
      }
    } else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#8080A8', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          value={open ? query : (selected?.label ?? query)}
          onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onChange('') }}
          onFocus={() => { setOpen(true); if (selected) setQuery(selected.label) }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          style={{
            width: '100%', padding: '10px 36px 10px 34px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#E0E0F4', fontFamily: 'inherit', fontSize: 13, outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <ChevronDown size={14} style={{ position: 'absolute', right: 12, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, color: '#8080A8', pointerEvents: 'none', transition: 'transform 150ms ease' }} />
      </div>

      {open && (
        <div ref={listRef} style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 100,
          maxHeight: 260, overflowY: 'auto', borderRadius: 10,
          background: '#1A1830', border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          {isLoading ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#8080A8', textAlign: 'center' }}>Loading...</div>
          ) : filtered.length === 0 && !showCreateNew ? (
            <div style={{ padding: '14px 16px', fontSize: 12, color: '#8080A8', textAlign: 'center' }}>No results found</div>
          ) : (
            <>
              {filtered.map((opt, i) => (
                <div
                  key={opt.id}
                  onMouseDown={e => { e.preventDefault(); select(opt.id) }}
                  onMouseEnter={() => setHighlightIdx(i)}
                  style={{
                    padding: '8px 14px', cursor: 'pointer', fontSize: 12,
                    background: highlightIdx === i ? 'rgba(212,34,106,0.1)' : 'transparent',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    transition: 'background 80ms ease',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#E0E0F4' }}>{opt.label}</div>
                  {opt.sublabel && <div style={{ fontSize: 10, color: '#8080A8', marginTop: 1 }}>{opt.sublabel}</div>}
                </div>
              ))}
              {showCreateNew && onCreateNew && (
                <div
                  onMouseDown={e => { e.preventDefault(); onCreateNew(); setOpen(false) }}
                  onMouseEnter={() => setHighlightIdx(filtered.length)}
                  style={{
                    padding: '10px 14px', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                    color: '#22C55E', display: 'flex', alignItems: 'center', gap: 6,
                    background: highlightIdx === filtered.length ? 'rgba(34,197,94,0.08)' : 'transparent',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    transition: 'background 80ms ease',
                  }}
                >
                  <Plus size={14} /> {createNewLabel}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
