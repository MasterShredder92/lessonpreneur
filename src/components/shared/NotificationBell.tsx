import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUnreadCount, useRecentNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, useNotificationRealtime, NOTIF_ICONS } from '../../hooks/useNotifications'
import { Bell } from 'lucide-react'

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  return `${days}d`
}

export default function NotificationBell() {
  const { data: unreadCount } = useUnreadCount()
  const { data: notifications } = useRecentNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Enable realtime updates
  useNotificationRealtime()

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleClick = (notif: any) => {
    if (!notif.read) markRead.mutate(notif.id)
    if (notif.route) { navigate(notif.route); setOpen(false) }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(!open)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        position: 'relative', padding: 6, color: open ? '#f59e0b' : '#8080A8',
      }}>
        <Bell size={18} />
        {(unreadCount ?? 0) > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            width: 16, height: 16, borderRadius: 8,
            background: '#EF4444', color: '#fff',
            fontSize: 9, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '2px solid #08080c',
          }}>
            {unreadCount! > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 36,
          width: 340, maxHeight: 420, overflowY: 'auto',
          background: '#101018', border: '1px solid #1a1a28',
          borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          zIndex: 1000,
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #1a1a28',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#E0E0F4' }}>Notifications</span>
            {(unreadCount ?? 0) > 0 && (
              <button onClick={() => markAllRead.mutate()} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 11, color: '#8080A8', textDecoration: 'underline',
              }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          {!notifications || notifications.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: '#606088', fontSize: 12 }}>
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: '10px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                    cursor: n.route ? 'pointer' : 'default',
                    background: n.read ? 'transparent' : 'rgba(245,158,11,0.03)',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                  onMouseLeave={e => e.currentTarget.style.background = n.read ? 'transparent' : 'rgba(245,158,11,0.03)'}
                >
                  <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>
                    {NOTIF_ICONS[n.type] ?? '\uD83D\uDD14'}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 700, color: n.read ? '#A0A0C8' : '#E0E0F4' }}>
                      {n.title}
                    </div>
                    {n.body && (
                      <div style={{ fontSize: 11, color: '#8080A8', marginTop: 2, lineHeight: 1.4 }}>
                        {n.body.length > 80 ? n.body.substring(0, 80) + '...' : n.body}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: '#606088', flexShrink: 0, marginTop: 2 }}>
                    {timeAgo(n.created_at)}
                  </span>
                  {!n.read && (
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: '#f59e0b', flexShrink: 0, marginTop: 6 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
