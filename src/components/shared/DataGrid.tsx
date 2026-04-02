import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Plus, Lock, ScrollText } from 'lucide-react'

interface ColDef {
  key: string
  label: string
  width: number
  type?: 'text' | 'select'
  options?: string[]
  editable?: boolean
  custom?: boolean
}

export interface DataGridColumn {
  key: string
  label: string
  width: number
  type?: 'text' | 'select'
  options?: string[]
  editable?: boolean
}

export interface DataGridProps {
  title: string
  table: string
  columns: DataGridColumn[]
  query?: string
  orderBy?: string
  nameField?: string
  nameRenderer?: (row: any) => string
  onClose: () => void
  filterFn?: (row: any, search: string) => boolean
}

export default function DataGrid({
  title,
  table,
  columns: propColumns,
  query = '*',
  orderBy = 'created_at',
  nameField = 'first_name',
  nameRenderer,
  onClose,
  filterFn,
}: DataGridProps) {
  const { role, profile } = useAuthContext()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [editCell, setEditCell] = useState<{ id: string; key: string } | null>(null)
  const [editValue, setEditValue] = useState('')
  const [savedCell, setSavedCell] = useState<string | null>(null)
  const [showLog, setShowLog] = useState(false)
  const [columns, setColumns] = useState<ColDef[]>(
    propColumns.map(c => ({ ...c, custom: false }))
  )
  const [contextMenu, setContextMenu] = useState<{
    x: number; y: number; type: 'row' | 'col'; id: string; name: string
  } | null>(null)
  const editRef = useRef<HTMLTextAreaElement | HTMLSelectElement>(null)

  // Only owner can access
  if (role !== 'owner') {
    return createPortal(
      <div style={{
        position: 'fixed', inset: 0, zIndex: 99999, background: '#0A0918',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Lock size={40} style={{ color: '#606088', marginBottom: 12 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: '#8080A8' }}>Access Restricted</p>
          <p style={{ fontSize: 12, color: '#606088', marginTop: 6 }}>
            Only the account owner can access the Master Editor.
          </p>
          <button
            onClick={onClose}
            style={{
              marginTop: 16, padding: '8px 20px', borderRadius: 8,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#A0A0C8', cursor: 'pointer', fontSize: 12,
            }}
          >
            Go Back
          </button>
        </div>
      </div>,
      document.body
    )
  }

  // Log entry on open
  useEffect(() => {
    supabase.from('activity_log').insert({
      tenant_id: profile?.tenant_id,
      entity_type: 'master_editor',
      entity_id: null,
      action: 'open',
      description: `Master Editor (${title}) opened by ${profile?.first_name ?? 'Unknown'}`,
      performed_by: profile?.id ?? null,
    }).then(() => {})
  }, [])

  // Audit log query
  const { data: auditLog } = useQuery({
    queryKey: ['master-editor-log', table],
    enabled: showLog,
    queryFn: async () => {
      const { data } = await supabase
        .from('activity_log')
        .select('*')
        .eq('entity_type', 'master_editor')
        .order('created_at', { ascending: false })
        .limit(100)
      return data ?? []
    },
  })

  // Main data query
  const { data: rows, isLoading } = useQuery({
    queryKey: ['datagrid', table],
    queryFn: async () => {
      const { data } = await supabase
        .from(table)
        .select(query)
        .order(orderBy, { ascending: orderBy === 'created_at' ? false : true })
      return data ?? []
    },
  })

  useEffect(() => {
    if (editRef.current) editRef.current.focus()
  }, [editCell])

  const getCellValue = (row: any, key: string): string => {
    const val = row[key]
    if (val === null || val === undefined) return ''
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }

  const handleSave = async (rowId: string, key: string, value: string) => {
    const row = rows?.find((r: any) => r.id === rowId)
    if (!row) return

    const col = columns.find(c => c.key === key)
    if (col && col.editable === false) {
      setEditCell(null)
      return
    }

    // Build update — check if original value was array
    const originalVal = row[key]
    let updateVal: any = value
    if (Array.isArray(originalVal)) {
      updateVal = value.split(',').map((s: string) => s.trim()).filter(Boolean)
    }

    const update: Record<string, any> = { [key]: updateVal }
    const { error: updateErr } = await supabase.from(table).update(update).eq('id', rowId)

    if (updateErr) {
      const { toast } = await import('./Toast')
      toast(updateErr.message ?? 'Failed to save cell', 'error')
      setEditCell(null)
      return
    }

    // Audit log — only after confirmed success
    const displayName = nameRenderer ? nameRenderer(row) : (row[nameField] ?? 'Unknown')
    const colLabel = col?.label ?? key
    const oldValue = getCellValue(row, key)
    await supabase.from('activity_log').insert({
      tenant_id: profile?.tenant_id,
      entity_type: 'master_editor',
      entity_id: rowId,
      action: 'edit_cell',
      description: `${profile?.first_name ?? 'Unknown'} changed "${colLabel}" for ${displayName} in ${title}: "${oldValue.substring(0, 50)}" -> "${value.substring(0, 50)}"`,
      performed_by: profile?.id ?? null,
    }).then(() => {})

    setSavedCell(`${rowId}-${key}`)
    setTimeout(() => setSavedCell(null), 1500)
    qc.invalidateQueries({ queryKey: ['datagrid', table] })
    setEditCell(null)
  }

  const handleDeleteRow = async (id: string, name: string) => {
    const ok = confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)
    if (!ok) return
    const { error: delErr } = await supabase.from(table).delete().eq('id', id)
    if (delErr) {
      const { toast } = await import('./Toast')
      toast(delErr.message ?? 'Failed to delete row', 'error')
      return
    }
    // Audit log — only after confirmed delete
    await supabase.from('activity_log').insert({
      tenant_id: profile?.tenant_id,
      entity_type: 'master_editor',
      entity_id: id,
      action: 'delete_row',
      description: `${profile?.first_name ?? 'Unknown'} deleted row from ${title}: ${name}`,
      performed_by: profile?.id ?? null,
    }).then(() => {})
    qc.invalidateQueries({ queryKey: ['datagrid', table] })
  }

  const handleAddRow = async () => {
    const name = prompt('Name (or identifier) for new row:')
    if (!name?.trim()) return
    const { data: tenant } = await supabase.from('tenants').select('id').limit(1).single()
    if (!tenant) return

    // Build a minimal insert based on table
    const insert: Record<string, any> = { tenant_id: tenant.id }
    if (nameField === 'first_name') {
      const parts = name.trim().split(/\s+/)
      insert.first_name = parts[0] || name.trim()
      insert.last_name = parts.slice(1).join(' ') || ''
    } else {
      insert[nameField] = name.trim()
    }

    // Table-specific defaults
    if (table === 'students') {
      insert.status = 'active'
    } else if (table === 'leads') {
      insert.stage = 'inquiry'
      if (!insert.student_name) {
        insert.student_name = name.trim()
      }
    } else if (table === 'schedule_blocks') {
      insert.block_date = new Date().toISOString().split('T')[0]
      insert.start_time = '09:00'
      insert.end_time = '09:30'
      insert.status = 'scheduled'
      insert.block_type = 'lesson'
    }

    const { error: insertErr } = await supabase.from(table).insert(insert)
    if (insertErr) {
      const { toast } = await import('./Toast')
      toast(insertErr.message ?? 'Failed to add row', 'error')
      return
    }
    qc.invalidateQueries({ queryKey: ['datagrid', table] })
  }

  const handleAddColumn = () => {
    const name = prompt('Column name:')
    if (!name?.trim()) return
    const key = 'custom_' + name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')
    if (columns.find(c => c.key === key)) { alert('Column already exists'); return }
    setColumns([...columns, { key, label: name.trim(), width: 200, custom: true }])
  }

  const handleDeleteColumn = (key: string) => {
    const col = columns.find(c => c.key === key)
    if (!col?.custom) { alert('Cannot delete built-in columns'); return }
    if (!confirm(`Delete column "${col.label}"? Data in this column will remain in the database.`)) return
    setColumns(columns.filter(c => c.key !== key))
    setContextMenu(null)
  }

  const handleContextMenu = (
    e: React.MouseEvent, type: 'row' | 'col', id: string, name: string
  ) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, type, id, name })
  }

  const filtered = rows?.filter((r: any) => {
    if (!search) return true
    if (filterFn) return filterFn(r, search)
    const displayName = nameRenderer ? nameRenderer(r) : (r[nameField] ?? '')
    return String(displayName).toLowerCase().includes(search.toLowerCase())
  }) ?? []

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999, background: '#0A0918',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Close button — always visible, floats top-right */}
      <button
        onClick={onClose}
        className="datagrid-close"
        aria-label="Close"
      >
        <X size={22} />
      </button>

      {/* Header */}
      <div className="datagrid-header">
        {/* Row 1: Title centered */}
        <div className="datagrid-header-row1">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', width: '100%' }}>
            <Lock size={14} style={{ color: '#FFB800' }} />
            <span style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4' }}>{title}</span>
          </div>
        </div>
        {/* Row 2: Meta + Search + Actions */}
        <div className="datagrid-header-row2">
          <span style={{
            fontSize: 9, padding: '2px 8px', borderRadius: 5,
            background: 'rgba(255,184,0,0.12)', color: '#FFB800',
            fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Owner Only
          </span>
          <span style={{ fontSize: 11, color: '#8080A8' }}>
            {filtered.length} {table.replace(/_/g, ' ')}
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              padding: '6px 12px', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.04)',
              color: '#E0E0F4', fontSize: 12, outline: 'none', flex: 1, minWidth: 80,
            }}
          />
          <button
            onClick={() => setShowLog(!showLog)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8,
              background: showLog ? 'rgba(255,184,0,0.12)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${showLog ? 'rgba(255,184,0,0.25)' : 'rgba(255,255,255,0.08)'}`,
              color: showLog ? '#FFB800' : '#8080A8',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <ScrollText size={13} /> Audit Log
          </button>
          <button
            onClick={handleAddRow}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.25)',
              color: '#22C55E', fontSize: 11, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Add Row
          </button>
        </div>
      </div>

      {/* Audit Log Panel */}
      {showLog && (
        <div style={{
          maxHeight: 200, overflowY: 'auto',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,184,0,0.02)', padding: '12px 24px',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#FFB800',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8,
          }}>
            Activity Log
          </div>
          {auditLog && auditLog.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {auditLog.map((log: any) => (
                <div key={log.id} style={{ fontSize: 11, color: '#A0A0C8', display: 'flex', gap: 8 }}>
                  <span style={{ color: '#606088', flexShrink: 0, width: 130 }}>
                    {new Date(log.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                  <span>{log.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 11, color: '#606088' }}>No activity yet.</p>
          )}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {isLoading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#8080A8' }}>Loading...</div>
        ) : (
          <table style={{
            borderCollapse: 'collapse',
            minWidth: columns.reduce((s, c) => s + c.width, 200),
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 3,
                  width: 180, minWidth: 180, padding: '8px 10px',
                  background: '#0D0B1A',
                  borderBottom: '2px solid rgba(255,255,255,0.08)',
                  borderRight: '2px solid rgba(255,255,255,0.08)',
                  fontSize: 10, fontWeight: 700, color: '#8080A8',
                  textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left',
                }}>
                  Name
                </th>
                {columns.map(col => (
                  <th
                    key={col.key}
                    onContextMenu={e => handleContextMenu(e, 'col', col.key, col.label)}
                    style={{
                      position: 'sticky', top: 0, zIndex: 2,
                      width: col.width, minWidth: col.width,
                      padding: '8px 8px', background: '#0D0B1A',
                      borderBottom: '2px solid rgba(255,255,255,0.08)',
                      borderRight: '1px solid rgba(255,255,255,0.04)',
                      fontSize: 9, fontWeight: 700,
                      color: col.custom ? '#FFB800' : '#8080A8',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      textAlign: 'left', cursor: 'context-menu',
                    }}
                  >
                    {col.label}
                  </th>
                ))}
                <th
                  onClick={handleAddColumn}
                  style={{
                    position: 'sticky', top: 0, zIndex: 2,
                    width: 40, minWidth: 40, padding: '8px 4px',
                    background: '#0D0B1A',
                    borderBottom: '2px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer', textAlign: 'center', color: '#606088',
                  }}
                  title="Add column"
                >
                  <Plus size={14} />
                </th>
                <th style={{
                  position: 'sticky', top: 0, zIndex: 2,
                  width: 40, minWidth: 40, padding: '8px 4px',
                  background: '#0D0B1A',
                  borderBottom: '2px solid rgba(255,255,255,0.08)',
                }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((row: any, ri: number) => {
                const displayName = nameRenderer
                  ? nameRenderer(row)
                  : (row[nameField] ?? 'Unknown')
                return (
                  <tr
                    key={row.id}
                    style={{
                      background: ri % 2 === 0 ? 'rgba(255,255,255,0.015)' : 'transparent',
                    }}
                  >
                    <td
                      onContextMenu={e => handleContextMenu(e, 'row', row.id, displayName)}
                      style={{
                        position: 'sticky', left: 0, zIndex: 1,
                        padding: '6px 10px',
                        background: ri % 2 === 0 ? '#100E1E' : '#0D0B1A',
                        borderRight: '2px solid rgba(255,255,255,0.08)',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                        fontSize: 11, fontWeight: 700, color: '#E0E0F4',
                        whiteSpace: 'nowrap', cursor: 'context-menu',
                      }}
                    >
                      {displayName}
                    </td>
                    {columns.map(col => {
                      const cellId = `${row.id}-${col.key}`
                      const isEditing = editCell?.id === row.id && editCell?.key === col.key
                      const value = getCellValue(row, col.key)
                      const isSaved = savedCell === cellId
                      const isReadOnly = col.editable === false

                      if (isEditing && !isReadOnly) {
                        if (col.type === 'select') {
                          return (
                            <td
                              key={col.key}
                              style={{
                                padding: 2,
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                borderRight: '1px solid rgba(255,255,255,0.04)',
                              }}
                            >
                              <select
                                ref={editRef as any}
                                value={editValue}
                                onChange={e => {
                                  setEditValue(e.target.value)
                                  handleSave(row.id, col.key, e.target.value)
                                }}
                                onBlur={() => setEditCell(null)}
                                style={{
                                  width: '100%', padding: '6px 8px',
                                  background: 'rgba(255,184,0,0.08)',
                                  border: '2px solid #FFB800', borderRadius: 4,
                                  color: '#E0E0F4', fontSize: 11, outline: 'none',
                                }}
                              >
                                <option value="">--</option>
                                {col.options?.map(o => (
                                  <option key={o} value={o}>{o}</option>
                                ))}
                              </select>
                            </td>
                          )
                        }
                        return (
                          <td
                            key={col.key}
                            style={{
                              padding: 2,
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              borderRight: '1px solid rgba(255,255,255,0.04)',
                            }}
                          >
                            <textarea
                              ref={editRef as any}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => handleSave(row.id, col.key, editValue)}
                              onKeyDown={e => {
                                if (e.key === 'Escape') setEditCell(null)
                                if (e.key === 'Tab') {
                                  e.preventDefault()
                                  handleSave(row.id, col.key, editValue)
                                }
                              }}
                              style={{
                                width: '100%', minHeight: 60, padding: '6px 8px',
                                background: 'rgba(255,184,0,0.08)',
                                border: '2px solid #FFB800', borderRadius: 4,
                                color: '#E0E0F4', fontSize: 11, outline: 'none',
                                resize: 'vertical', fontFamily: 'inherit',
                                boxSizing: 'border-box',
                              }}
                            />
                          </td>
                        )
                      }

                      return (
                        <td
                          key={col.key}
                          onClick={() => {
                            if (!isReadOnly) {
                              setEditCell({ id: row.id, key: col.key })
                              setEditValue(value)
                            }
                          }}
                          style={{
                            padding: '6px 10px',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            borderRight: '1px solid rgba(255,255,255,0.04)',
                            fontSize: 11,
                            color: isReadOnly ? '#606088' : (value ? '#C0C0E0' : '#363656'),
                            cursor: isReadOnly ? 'default' : 'pointer',
                            maxWidth: col.width, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            position: 'relative',
                            background: isSaved ? 'rgba(34,197,94,0.08)' : undefined,
                          }}
                          title={isReadOnly ? value : (value || 'Click to edit')}
                        >
                          {value || '\u2014'}
                          {isSaved && (
                            <span style={{
                              position: 'absolute', top: 2, right: 4,
                              fontSize: 8, color: '#22C55E', fontWeight: 700,
                            }}>
                              Saved
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td style={{
                      padding: '4px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                    }} />
                    <td style={{
                      padding: '4px',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      textAlign: 'center',
                    }}>
                      <button
                        onClick={() => handleDeleteRow(row.id, displayName)}
                        style={{
                          background: 'none', border: 'none',
                          color: '#363656', cursor: 'pointer', padding: 4,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#363656')}
                        title="Delete row"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        {/* Add Row button at bottom */}
        {!isLoading && (
          <button
            onClick={handleAddRow}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              margin: '8px 14px', padding: '8px 16px', borderRadius: 8,
              background: 'rgba(34,197,94,0.06)',
              border: '1px dashed rgba(34,197,94,0.2)',
              color: '#22C55E', fontSize: 11, fontWeight: 600,
              cursor: 'pointer', width: 'fit-content',
            }}
          >
            <Plus size={13} /> Add Row
          </button>
        )}
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
            onClick={() => setContextMenu(null)}
          />
          <div style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            zIndex: 10001, background: '#1A1830',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            padding: 4, minWidth: 160,
          }}>
            {contextMenu.type === 'row' ? (
              <button
                onClick={() => {
                  handleDeleteRow(contextMenu.id, contextMenu.name)
                  setContextMenu(null)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 12px', borderRadius: 6,
                  background: 'none', border: 'none',
                  color: '#EF4444', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <Trash2 size={13} /> Delete &quot;{contextMenu.name}&quot;
              </button>
            ) : (
              <>
                {columns.find(c => c.key === contextMenu.id)?.custom ? (
                  <button
                    onClick={() => handleDeleteColumn(contextMenu.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '8px 12px', borderRadius: 6,
                      background: 'none', border: 'none',
                      color: '#EF4444', fontSize: 12, cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Trash2 size={13} /> Delete Column &quot;{contextMenu.name}&quot;
                  </button>
                ) : (
                  <div style={{ padding: '8px 12px', fontSize: 11, color: '#606088' }}>
                    Built-in column — cannot delete
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>,
    document.body
  )
}
