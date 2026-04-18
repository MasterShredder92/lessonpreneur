import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X, Trash2, Plus, Lock, ScrollText } from 'lucide-react'
import { qk } from '../../lib/queryKeys'

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
  const { role, profile, tenantId } = useAuthContext()
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
        position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--surface-master)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ textAlign: 'center' }}>
          <Lock size={40} style={{ color: 'var(--text-caption)', marginBottom: 'var(--space-md)' }} />
          <p style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-placard)' }}>Access Restricted</p>
          <p style={{ fontSize: 'var(--font-size-lg)', color: 'var(--text-caption)', marginTop: 'var(--space-6)' }}>
            Only the account owner can access the Master Editor.
          </p>
          <button
            onClick={onClose}
            style={{
              marginTop: 'var(--space-lg)', padding: 'var(--space-sm) var(--space-2xl)', borderRadius: 'var(--radius-sm)',
              background: 'var(--white-6)', border: 'var(--border-width) solid var(--white-10)',
              color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--font-size-lg)',
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
    queryKey: [...qk.activity.masterEditor, table],
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
    queryKey: [...qk.datagrid.all, table, tenantId],
    queryFn: async () => {
      let q = supabase
        .from(table)
        .select(query)
        .order(orderBy, { ascending: orderBy === 'created_at' ? false : true })
      if (tenantId) q = q.eq('tenant_id', tenantId)
      const { data, error } = await q
      if (error) throw new Error(`DataGrid(${table}): ${error.message}`)
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
    qc.invalidateQueries({ queryKey: [...qk.datagrid.all, table] })
    setEditCell(null)
  }

  const handleDeleteRow = async (id: string, name: string) => {
    const ok = confirm(`Are you sure you want to delete ${name}? This cannot be undone.`)
    if (!ok) return
    let delQuery = supabase.from(table).delete().eq('id', id)
    if (tenantId) delQuery = delQuery.eq('tenant_id', tenantId)
    const { error: delErr } = await delQuery
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
    qc.invalidateQueries({ queryKey: [...qk.datagrid.all, table] })
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
    qc.invalidateQueries({ queryKey: [...qk.datagrid.all, table] })
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
      position: 'fixed', inset: 0, zIndex: 99999, background: 'var(--surface-master)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', justifyContent: 'center', width: '100%' }}>
            <Lock size={14} style={{ color: 'var(--color-warning)' }} />
            <span style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)' }}>{title}</span>
          </div>
        </div>
        {/* Row 2: Meta + Search + Actions */}
        <div className="datagrid-header-row2">
          <span style={{
            fontSize: 'var(--font-size-2xs)', padding: 'var(--space-2xs) var(--space-sm)', borderRadius: 'var(--space-mini)',
            background: 'var(--warning-12)', color: 'var(--color-warning)',
            fontWeight: 'var(--font-weight-bold)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            Owner Only
          </span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-placard)' }}>
            {filtered.length} {table.replace(/_/g, ' ')}
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              padding: 'var(--space-6) var(--space-md)', borderRadius: 'var(--radius-sm)',
              border: 'var(--border-width) solid var(--white-10)',
              background: 'var(--white-4)',
              color: 'var(--text-secondary)', fontSize: 'var(--font-size-lg)', outline: 'none', flex: 1, minWidth: 'calc(var(--space-lg) * 5)',
            }}
          />
          <button
            onClick={() => setShowLog(!showLog)}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-mini)',
              padding: 'var(--space-6) var(--space-18)', borderRadius: 'var(--radius-sm)',
              background: showLog ? 'var(--warning-12)' : 'var(--white-4)',
              border: `var(--border-width) solid ${showLog ? 'var(--warning-25)' : 'var(--white-8)'}`,
              color: showLog ? 'var(--color-warning)' : 'var(--text-placard)',
              fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer',
            }}
          >
            <ScrollText size={13} /> Audit Log
          </button>
          <button
            onClick={handleAddRow}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-mini)',
              padding: 'var(--space-6) var(--space-18)', borderRadius: 'var(--radius-sm)',
              background: 'var(--success-10)',
              border: 'var(--border-width) solid var(--success-25)',
              color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)', cursor: 'pointer',
            }}
          >
            <Plus size={13} /> Add Row
          </button>
        </div>
      </div>

      {/* Audit Log Panel */}
      {showLog && (
        <div style={{
          maxHeight: 'calc(var(--space-5xl) * 5)', overflowY: 'auto',
          borderBottom: 'var(--border-width) solid var(--white-8)',
          background: 'var(--warning-6)', padding: 'var(--space-md) var(--space-xl)',
        }}>
          <div style={{
            fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--color-warning)',
            textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-sm)',
          }}>
            Activity Log
          </div>
          {auditLog && auditLog.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
              {auditLog.map((log: any) => (
                <div key={log.id} style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', display: 'flex', gap: 'var(--space-sm)' }}>
                  <span style={{ color: 'var(--text-caption)', flexShrink: 0, width: 'calc(var(--space-lg) * 8 + var(--space-xs))' }}>
                    {new Date(log.created_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                    })}
                  </span>
                  <span>{log.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-caption)' }}>No activity yet.</p>
          )}
        </div>
      )}

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-5xl)', textAlign: 'center', color: 'var(--text-placard)' }}>Loading...</div>
        ) : (
          <table style={{
            borderCollapse: 'collapse',
            minWidth: columns.reduce((s, c) => s + c.width, 200),
          }}>
            <thead>
              <tr>
                <th style={{
                  position: 'sticky', left: 0, top: 0, zIndex: 3,
                  width: 'calc(var(--space-5xl) * 4 + var(--space-2xl))', minWidth: 'calc(var(--space-5xl) * 4 + var(--space-2xl))', padding: 'var(--space-sm) var(--space-10)',
                  background: 'var(--surface-modal)',
                  borderBottom: 'calc(2 * var(--border-width)) solid var(--white-8)',
                  borderRight: 'calc(2 * var(--border-width)) solid var(--white-8)',
                  fontSize: 'var(--font-size-xs)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-placard)',
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
                      padding: 'var(--space-sm)', background: 'var(--surface-modal)',
                      borderBottom: 'calc(2 * var(--border-width)) solid var(--white-8)',
                      borderRight: 'var(--border-width) solid var(--white-4)',
                      fontSize: 'var(--font-size-2xs)', fontWeight: 'var(--font-weight-bold)',
                      color: col.custom ? 'var(--color-warning)' : 'var(--text-placard)',
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
                    width: 'var(--space-5xl)', minWidth: 'var(--space-5xl)', padding: 'var(--space-sm) var(--space-xs)',
                    background: 'var(--surface-modal)',
                    borderBottom: 'calc(2 * var(--border-width)) solid var(--white-8)',
                    cursor: 'pointer', textAlign: 'center', color: 'var(--text-caption)',
                  }}
                  title="Add column"
                >
                  <Plus size={14} />
                </th>
                <th style={{
                  position: 'sticky', top: 0, zIndex: 2,
                  width: 'var(--space-5xl)', minWidth: 'var(--space-5xl)', padding: 'var(--space-sm) var(--space-xs)',
                  background: 'var(--surface-modal)',
                  borderBottom: 'calc(2 * var(--border-width)) solid var(--white-8)',
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
                      background: ri % 2 === 0 ? 'var(--white-3)' : 'transparent',
                    }}
                  >
                    <td
                      onContextMenu={e => handleContextMenu(e, 'row', row.id, displayName)}
                      style={{
                        position: 'sticky', left: 0, zIndex: 1,
                        padding: 'var(--space-6) var(--space-10)',
                        background: ri % 2 === 0 ? 'var(--surface-raised)' : 'var(--surface-modal)',
                        borderRight: 'calc(2 * var(--border-width)) solid var(--white-8)',
                        borderBottom: 'var(--border-width) solid var(--white-4)',
                        fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)',
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
                                padding: 'var(--space-2xs)',
                                borderBottom: 'var(--border-width) solid var(--white-4)',
                                borderRight: 'var(--border-width) solid var(--white-4)',
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
                                  width: '100%', padding: 'var(--space-6) var(--space-sm)',
                                  background: 'var(--warning-8)',
                                  border: 'calc(2 * var(--border-width)) solid var(--color-warning)', borderRadius: 'var(--radius-2xs)',
                                  color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', outline: 'none',
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
                              padding: 'var(--space-2xs)',
                              borderBottom: 'var(--border-width) solid var(--white-4)',
                              borderRight: 'var(--border-width) solid var(--white-4)',
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
                                width: '100%', minHeight: 'var(--space-min-label)', padding: 'var(--space-6) var(--space-sm)',
                                background: 'var(--warning-8)',
                                border: 'calc(2 * var(--border-width)) solid var(--color-warning)', borderRadius: 'var(--radius-2xs)',
                                color: 'var(--text-secondary)', fontSize: 'var(--font-size-sm)', outline: 'none',
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
                            padding: 'var(--space-6) var(--space-10)',
                            borderBottom: 'var(--border-width) solid var(--white-4)',
                            borderRight: 'var(--border-width) solid var(--white-4)',
                            fontSize: 'var(--font-size-sm)',
                            color: isReadOnly ? 'var(--text-caption)' : (value ? 'var(--text-subtle)' : 'var(--text-empty)'),
                            cursor: isReadOnly ? 'default' : 'pointer',
                            maxWidth: col.width, overflow: 'hidden',
                            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            position: 'relative',
                            background: isSaved ? 'var(--success-8)' : undefined,
                          }}
                          title={isReadOnly ? value : (value || 'Click to edit')}
                        >
                          {value || '\u2014'}
                          {isSaved && (
                            <span style={{
                              position: 'absolute', top: 'var(--space-2xs)', right: 'var(--space-xs)',
                              fontSize: 'var(--font-size-2xs)', color: 'var(--color-success)', fontWeight: 'var(--font-weight-bold)',
                            }}>
                              Saved
                            </span>
                          )}
                        </td>
                      )
                    })}
                    <td style={{
                      padding: 'var(--space-xs)',
                      borderBottom: 'var(--border-width) solid var(--white-4)',
                    }} />
                    <td style={{
                      padding: 'var(--space-xs)',
                      borderBottom: 'var(--border-width) solid var(--white-4)',
                      textAlign: 'center',
                    }}>
                      <button
                        onClick={() => handleDeleteRow(row.id, displayName)}
                        style={{
                          background: 'none', border: 'none',
                          color: 'var(--text-empty)', cursor: 'pointer', padding: 'var(--space-xs)',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-empty)')}
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
              display: 'flex', alignItems: 'center', gap: 'var(--space-6)',
              margin: 'var(--space-sm) var(--space-18)', padding: 'var(--space-sm) var(--space-lg)', borderRadius: 'var(--radius-sm)',
              background: 'var(--success-6)',
              border: 'var(--border-width) dashed var(--success-20)',
              color: 'var(--color-success)', fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)',
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
            zIndex: 10001, background: 'var(--surface-raised)',
            border: 'var(--border-width) solid var(--white-15)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-md)',
            padding: 'var(--space-xs)', minWidth: 'calc(var(--space-lg) * 10)',
          }}>
            {contextMenu.type === 'row' ? (
              <button
                onClick={() => {
                  handleDeleteRow(contextMenu.id, contextMenu.name)
                  setContextMenu(null)
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                  width: '100%', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-xs)',
                  background: 'none', border: 'none',
                  color: 'var(--color-danger)', fontSize: 'var(--font-size-lg)', cursor: 'pointer', textAlign: 'left',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-8)')}
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
                      display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
                      width: '100%', padding: 'var(--space-sm) var(--space-md)', borderRadius: 'var(--radius-xs)',
                      background: 'none', border: 'none',
                      color: 'var(--color-danger)', fontSize: 'var(--font-size-lg)', cursor: 'pointer', textAlign: 'left',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-8)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <Trash2 size={13} /> Delete Column &quot;{contextMenu.name}&quot;
                  </button>
                ) : (
                  <div style={{ padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--font-size-sm)', color: 'var(--text-caption)' }}>
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
