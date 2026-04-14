import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CheckCheck, X } from 'lucide-react'
import { useNotificationCenter } from '../../hooks/useNotificationCenter'

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
  const navigate = useNavigate()

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
            top: sidebarOpen ? 6 : 4,
            right: sidebarOpen ? undefined : 6,
            left: sidebarOpen ? 22 : undefined,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: '#D4226A',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 4px',
            lineHeight: 1,
            boxShadow: '0 0 6px rgba(212,34,106,0.6)',
          }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'fixed',
          left: sidebarOpen ? 224 : 66,
          bottom: 60,
          width: 340,
          maxHeight: 420,
          background: 'rgba(16,14,28,0.97)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          backdropFilter: 'blur(20px)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 14px 10px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4', letterSpacing: 0.3 }}>
              Notifications
            </span>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead()}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#8080A8',
                    fontSize: 11,
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '2px 6px',
                    borderRadius: 4,
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
                  color: '#606088', padding: 2,
                }}
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '4px 0' }}>
            {notifications.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: '#606088',
                fontSize: 13,
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
                      navigate(n.route)
                      setOpen(false)
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    width: '100%',
                    padding: '10px 14px',
                    background: n.read ? 'transparent' : 'rgba(212,34,106,0.06)',
                    border: 'none',
                    borderLeft: n.read ? '3px solid transparent' : '3px solid #D4226A',
                    cursor: n.route ? 'pointer' : 'default',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    transition: 'background 150ms ease',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                  onMouseLeave={e => (e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(212,34,106,0.06)')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12,
                      fontWeight: n.read ? 500 : 700,
                      color: n.read ? '#A0A0B8' : '#E0E0F4',
                      lineHeight: 1.4,
                      marginBottom: 2,
                    }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{
                        fontSize: 11,
                        color: '#8080A8',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {n.body}
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: '#606088', marginTop: 3 }}>
                      {timeAgo(n.created_at)}
                    </div>
                  </div>
                  {!n.read && (
                    <div style={{
                      width: 8, height: 8, borderRadius: 4,
                      background: '#D4226A', flexShrink: 0, marginTop: 4,
                    }} />
                  )}
                  {n.read && (
                    <Check size={12} style={{ color: '#404060', flexShrink: 0, marginTop: 3 }} />
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
