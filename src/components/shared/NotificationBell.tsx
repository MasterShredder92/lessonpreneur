import { useState, useRef, useEffect } from 'react'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useNotificationCenter } from '../../hooks/useNotificationCenter'
import { adminPathToSurface, useAdminSurface } from '../../contexts/AdminSurfaceContext'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NotificationBell({ sidebarOpen }: { sidebarOpen: boolean }) {
  const { notifications, unreadCount, markRead, markAllRead, requestPermission } = useNotificationCenter()
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const { setSurface } = useAdminSurface()

  // Request browser notification permission on mount
  useEffect(() => { requestPermission() }, [requestPermission])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        className={`nav-item${open ? ' active' : ''}`}
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v) }}
        title={!sidebarOpen ? 'Notifications' : undefined}
        style={{ position: 'relative' }}
      >
        <Bell size={15} />
        <span className="nav-label">Notifications</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: sidebarOpen ? 'var(--space-6)' : 'var(--space-xs)',
            right: sidebarOpen ? undefined : 'var(--space-6)',
            left: sidebarOpen ? 'var(--space-dense)' : undefined,
            minWidth: 'var(--space-lg)',
            height: 'var(--space-lg)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-primary)',
            color: 'var(--text-primary)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-bold)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: `0 var(--space-xs)`,
            lineHeight: 1,
            boxShadow: `0 0 var(--space-sm) var(--primary-30)`,
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: sidebarOpen ? 'calc(var(--space-4xl) * 7)' : 'calc(var(--space-4xl) * 2 + var(--space-2xs))',
          bottom: 'var(--space-min-label)',
          width: 'calc(var(--space-5xl) * 8 + var(--space-2xl))',
          maxHeight: 'calc(var(--space-5xl) * 10 + var(--space-2xl))',
          background: 'var(--bg-surface-deep)',
          border: 'var(--border-width) solid var(--white-8)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(var(--space-2xl))',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--space-md) var(--space-18) var(--space-10)',
            borderBottom: 'var(--border-width) solid var(--white-6)',
          }}>
            <span style={{ fontSize: 'var(--font-size-md)', fontWeight: 'var(--font-weight-bold)', color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-6)', alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-placard)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-medium)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-xs)',
                    padding: 'var(--space-2xs) var(--space-6)',
                    borderRadius: 'var(--radius-2xs)',
                  }}
                  title="Mark all read"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-caption)', padding: 'var(--space-2xs)',
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: 'var(--space-xs) 0' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: 'var(--space-5xl) var(--space-2xl)',
                textAlign: 'center',
                color: 'var(--text-caption)',
                fontSize: 'var(--font-size-md)',
              }}>
                No notifications yet
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id)
                    if (n.route) {
                      const s = adminPathToSurface(n.route)
                      if (s) setSurface(s)
                      setOpen(false)
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-10)',
                    width: '100%',
                    padding: 'var(--space-10) var(--space-18)',
                    background: n.read ? 'transparent' : 'var(--primary-8)',
                    border: 'none',
                    borderLeft: n.read ? `calc(3 * var(--border-width)) solid transparent` : `calc(3 * var(--border-width)) solid var(--color-primary)`,
                    cursor: n.route ? 'pointer' : 'default',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'background 150ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--white-4)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'var(--primary-8)')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 'var(--font-size-lg)',
                      fontWeight: n.read ? 'var(--font-weight-medium)' : 'var(--font-weight-bold)',
                      color: n.read ? 'var(--text-muted)' : 'var(--text-secondary)',
                      lineHeight: 1.4,
                      marginBottom: 'var(--space-2xs)',
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-placard)',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-caption)', marginTop: 'var(--space-3xs)' }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {!n.read && (
                    <div style={{
                      width: 'var(--space-sm)', height: 'var(--space-sm)', borderRadius: 'var(--radius-2xs)',
                      background: 'var(--color-primary)', flexShrink: 0, marginTop: 'var(--space-xs)',
                    }} />
                  )}
                  {n.read && (
                    <Check size={12} style={{ color: 'var(--text-empty)', flexShrink: 0, marginTop: 'var(--space-3xs)' }} />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
