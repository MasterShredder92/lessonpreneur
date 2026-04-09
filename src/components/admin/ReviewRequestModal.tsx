import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Copy, ExternalLink, Star, AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from '../shared/Toast'
import { useLastReviewRequest, useSendReviewRequest, generateReviewMessage } from '../../hooks/useReviewRequest'
import { useAuthContext } from '../../app/AuthContext'
import { supabase } from '../../lib/supabase'
import { useQuery } from '@tanstack/react-query'
import { getLocationColor } from '../../utils/locationColor'

const MOBILE_BP = 640

interface ReviewRequestModalProps {
  familyId: string
  familyName: string
  parentName: string
  locationId: string
  students: { name: string; instrument: string; createdAt: string }[]
  onClose: () => void
}

export default function ReviewRequestModal({
  familyId,
  familyName,
  parentName,
  locationId,
  students,
  onClose,
}: ReviewRequestModalProps) {
  const { profile } = useAuthContext()
  const [messageText, setMessageText] = useState('')
  const [generating, setGenerating] = useState(true)
  const [copied, setCopied] = useState(false)
  const [sending, setSending] = useState(false)
  const [isMobile, setIsMobile] = useState(window.innerWidth < MOBILE_BP)

  const { data: lastRequest } = useLastReviewRequest(familyId)
  const sendMutation = useSendReviewRequest()

  // Fetch location info for google_review_url and name
  const { data: location } = useQuery({
    queryKey: ['location-review-info', locationId],
    enabled: !!locationId,
    queryFn: async () => {
      const { data } = await supabase
        .from('locations')
        .select('name, google_review_url')
        .eq('id', locationId)
        .single()
      return data
    },
    staleTime: 1000 * 60 * 10,
  })

  const locationName = location?.name?.replace(' Music Lessons', '') ?? ''
  const googleReviewUrl = location?.google_review_url ?? ''
  const locationColor = getLocationColor(locationId)
  const parentFirstName = parentName?.split(' ')[0] ?? parentName ?? ''

  // Mobile detection
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < MOBILE_BP)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Generate AI message when location data is ready
  useEffect(() => {
    if (!locationName || !googleReviewUrl || students.length === 0) return
    let cancelled = false

    setGenerating(true)
    generateReviewMessage({
      parentFirstName,
      students,
      locationName,
      googleReviewUrl,
    })
      .then(({ message }) => {
        if (!cancelled) setMessageText(message)
      })
      .finally(() => {
        if (!cancelled) setGenerating(false)
      })

    return () => { cancelled = true }
  }, [locationName, googleReviewUrl, parentFirstName, students])

  // Days since last request
  const daysSinceLastRequest = lastRequest?.sent_at
    ? Math.round((Date.now() - new Date(lastRequest.sent_at).getTime()) / (24 * 60 * 60 * 1000))
    : null

  const lastRequestDate = lastRequest?.sent_at
    ? new Date(lastRequest.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const recentWarning = daysSinceLastRequest !== null && daysSinceLastRequest < 90

  const handleSend = async () => {
    if (!messageText.trim() || sending) return
    setSending(true)
    try {
      await sendMutation.mutateAsync({
        familyId,
        locationId,
        messageText: messageText.trim(),
        googleReviewUrl,
        requestedBy: profile?.id,
      })
      toast(`Review request queued for ${familyName}`, 'success')
      onClose()
    } catch {
      toast('Failed to save review request', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(googleReviewUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Gather contact info for display
  const { data: familyContact } = useQuery({
    queryKey: ['family-contact-info', familyId],
    enabled: !!familyId,
    queryFn: async () => {
      const { data } = await supabase
        .from('families')
        .select('primary_phone, primary_email')
        .eq('id', familyId)
        .single()
      return data
    },
    staleTime: 1000 * 60 * 5,
  })

  const overlayStyle: React.CSSProperties = isMobile
    ? { position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)', animation: 'fadeIn 180ms ease' }
    : { position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(2px)', animation: 'fadeIn 180ms ease' }

  const modalStyle: React.CSSProperties = isMobile
    ? { background: 'linear-gradient(150deg, rgba(22,20,40,0.99), rgba(16,14,30,0.99))', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '90vh', overflow: 'auto', animation: 'slideUp 240ms cubic-bezier(0.4,0,0.2,1)', paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }
    : { background: 'linear-gradient(150deg, rgba(22,20,40,0.99), rgba(16,14,30,0.99))', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(212,34,106,0.06)', animation: 'slideUp 240ms cubic-bezier(0.4,0,0.2,1)' }

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* ── HEADER ── */}
        {isMobile && (
          <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '10px auto 0' }} />
        )}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#E0E0F4', marginBottom: 4 }}>
                Review Request — {familyName?.replace(/\s+family$/i, '')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#A0A0C8' }}>{parentName}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 6,
                  background: `${locationColor}18`, border: `1px solid ${locationColor}40`, color: locationColor,
                }}>
                  {locationName}
                </span>
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 6, cursor: 'pointer', color: '#8080A8', minWidth: 32, minHeight: 32, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ padding: '16px 24px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* ── SECTION 1: MESSAGE PREVIEW ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Message Preview
            </div>
            {generating ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 20, justifyContent: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                <Loader2 size={16} style={{ color: '#D4226A', animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: '#A0A0C8' }}>Generating personalized message...</span>
              </div>
            ) : (
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                rows={7}
                style={{
                  width: '100%', padding: 14, borderRadius: 12, fontSize: 13, lineHeight: 1.5,
                  color: '#E0E0F4', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)',
                  resize: 'vertical', fontFamily: "'Plus Jakarta Sans', sans-serif", outline: 'none',
                  minHeight: isMobile ? 140 : 120,
                }}
                onFocus={(e) => { e.target.style.borderColor = 'rgba(212,34,106,0.4)' }}
                onBlur={(e) => { e.target.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
            )}
          </div>

          {/* ── SECTION 2: REVIEW LINK ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Google Review Link
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 12, color: '#A0A0C8',
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {googleReviewUrl || 'No review URL set for this location'}
              </div>
              <button
                onClick={handleCopyUrl}
                disabled={!googleReviewUrl}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: copied ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${copied ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: copied ? '#22C55E' : '#A0A0C8',
                  display: 'flex', alignItems: 'center', gap: 4, minHeight: 36, whiteSpace: 'nowrap',
                }}
              >
                <Copy size={12} /> {copied ? 'Copied!' : 'Copy'}
              </button>
              <button
                onClick={() => googleReviewUrl && window.open(googleReviewUrl, '_blank')}
                disabled={!googleReviewUrl}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  color: '#A0A0C8', display: 'flex', alignItems: 'center', gap: 4, minHeight: 36, whiteSpace: 'nowrap',
                }}
              >
                <ExternalLink size={12} /> Test
              </button>
            </div>
          </div>

          {/* ── SECTION 3: SEND METHOD ── */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Send Method
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ fontSize: 12, color: '#A0A0C8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📱</span> Will send via SMS to <span style={{ color: '#E0E0F4', fontWeight: 600 }}>{familyContact?.primary_phone ?? '—'}</span>
              </div>
              <div style={{ fontSize: 12, color: '#A0A0C8', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>📧</span> Will also send via email to <span style={{ color: '#E0E0F4', fontWeight: 600 }}>{familyContact?.primary_email ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* ── SECTION 4: LAST REQUEST INFO ── */}
          {daysSinceLastRequest !== null && (
            <div>
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: recentWarning ? 'rgba(255,184,0,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${recentWarning ? 'rgba(255,184,0,0.2)' : 'rgba(255,255,255,0.06)'}`,
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                {recentWarning ? (
                  <AlertTriangle size={14} style={{ color: '#FFB800', flexShrink: 0, marginTop: 1 }} />
                ) : (
                  <Star size={14} style={{ color: '#8080A8', flexShrink: 0, marginTop: 1 }} />
                )}
                <div>
                  <div style={{ fontSize: 12, color: recentWarning ? '#FFB800' : '#A0A0C8', fontWeight: 600 }}>
                    Last request sent {daysSinceLastRequest} days ago on {lastRequestDate}
                  </div>
                  {recentWarning && (
                    <div style={{ fontSize: 11, color: '#A0A0C8', marginTop: 4 }}>
                      This family was recently asked for a review. Are you sure you want to send another?
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── FOOTER ACTIONS ── */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              onClick={onClose}
              style={{
                padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8080A8',
                minHeight: 44,
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSend}
              disabled={generating || sending || !messageText.trim()}
              style={{
                padding: '10px 24px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: generating || sending ? 'rgba(212,34,106,0.3)' : 'linear-gradient(135deg, #D4226A, #A333FF)',
                border: 'none', color: '#fff', minHeight: 44,
                opacity: generating || sending || !messageText.trim() ? 0.5 : 1,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {sending ? (
                <>
                  <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                  Sending...
                </>
              ) : (
                <>
                  <Star size={14} />
                  Send Request
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Keyframe for spinner */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
      `}</style>
    </div>,
    document.body
  )
}
