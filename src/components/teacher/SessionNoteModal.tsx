import { useState } from 'react'
import { X, Sparkles, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthContext } from '../../app/AuthContext'
import { useSaveSessionNote, useUpdateSessionNote, polishNoteWithZiro } from '../../hooks/useSessionNotes'
import { WORKED_ON_OPTIONS } from '../../hooks/useTeacherSchedule'
import { toast } from '../shared/Toast'
import { instrumentWithEmojiTitle } from '../../utils/instrumentEmoji'

interface SessionNoteModalProps {
  studentId: string
  studentName: string
  instrument: string | null
  scheduleBlockId?: string
  noteDate?: string
  blockType?: string
  existingNote?: {
    id: string
    raw_note: string
    ai_enhanced_note?: string
    topics_covered: string[]
    skills_progressing: string[]
    mood: string
    is_visible_to_parent: boolean
  }
  onClose: () => void
  onSaved: () => void
}

const MOOD_OPTIONS = [
  { value: 'great', emoji: '\uD83D\uDE04', label: 'Great' },
  { value: 'good', emoji: '\uD83D\uDE42', label: 'Good' },
  { value: 'okay', emoji: '\uD83D\uDE10', label: 'Okay' },
  { value: 'struggling', emoji: '\uD83D\uDE1F', label: 'Struggling' },
]

const SKILLS_OPTIONS = [
  'Improving',
  'Consistent',
  'Needs Practice',
  'Breakthrough Moment',
  'Ready to Level Up',
  'Building Foundation',
]

export default function SessionNoteModal({
  studentId,
  studentName,
  instrument,
  scheduleBlockId,
  noteDate,
  blockType,
  existingNote,
  onClose,
  onSaved,
}: SessionNoteModalProps) {
  // Call-out blocks are read-only — no session note allowed
  if (blockType === 'call_out') {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 10000,
          background: 'rgba(2,2,9,0.98)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ maxWidth: 400, padding: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>{'\uD83D\uDEAB'}</div>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#E0E0F4', margin: '0 0 8px' }}>
            Call-Out Session
          </h2>
          <p style={{ fontSize: 14, color: '#A0A0C8', lineHeight: 1.6, margin: '0 0 24px' }}>
            This session was marked as a call-out. No note required.
          </p>
          <button
            onClick={onClose}
            style={{
              padding: '10px 32px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#A0A0C8',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  const { tenantId } = useAuthContext()
  const saveNote = useSaveSessionNote()
  const updateNote = useUpdateSessionNote()
  const isEditing = !!existingNote

  const today = new Date().toISOString().split('T')[0]
  const displayDate = noteDate ?? today

  // Form state
  const [mood, setMood] = useState(existingNote?.mood ?? '')
  const [topicsCovered, setTopicsCovered] = useState<string[]>(existingNote?.topics_covered ?? [])
  const [skillsProgressing, setSkillsProgressing] = useState<string[]>(existingNote?.skills_progressing ?? [])
  const [rawNote, setRawNote] = useState(existingNote?.raw_note ?? '')
  const [isVisibleToParent, setIsVisibleToParent] = useState(existingNote?.is_visible_to_parent ?? true)

  // AI state
  const [aiEnhancedNote, setAiEnhancedNote] = useState<string | null>(existingNote?.ai_enhanced_note ?? null)
  const [isPolishing, setIsPolishing] = useState(false)
  const [showAiPreview, setShowAiPreview] = useState(!!existingNote?.ai_enhanced_note)

  // Get instrument-specific topic chips
  const instrumentKey = (instrument ?? 'default').toLowerCase()
  const topicOptions = WORKED_ON_OPTIONS[instrumentKey] ?? WORKED_ON_OPTIONS.default

  const toggleTopic = (topic: string) => {
    setTopicsCovered(prev =>
      prev.includes(topic) ? prev.filter(t => t !== topic) : [...prev, topic]
    )
  }

  const toggleSkill = (skill: string) => {
    setSkillsProgressing(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    )
  }

  const handlePolish = async () => {
    if (!rawNote.trim() || !tenantId) return
    setIsPolishing(true)
    try {
      const result = await polishNoteWithZiro({
        tenantId,
        studentName,
        instrument,
        mood,
        topicsCovered,
        skillsProgressing,
        rawNote,
      })
      setAiEnhancedNote(result)
      setShowAiPreview(true)
    } catch (err: any) {
      toast(err.message ?? 'Ziro could not polish the recap', 'error')
    } finally {
      setIsPolishing(false)
    }
  }

  const handleAcceptAi = () => {
    // AI note is already in state, just close the preview
    setShowAiPreview(false)
  }

  const handleEditAi = () => {
    // Copy AI text to raw note for manual editing
    if (aiEnhancedNote) {
      setRawNote(aiEnhancedNote)
    }
    setAiEnhancedNote(null)
    setShowAiPreview(false)
  }

  const handleRegenerate = () => {
    setAiEnhancedNote(null)
    setShowAiPreview(false)
    handlePolish()
  }

  const canSave = mood !== '' && rawNote.trim().length > 0

  const handleSave = async () => {
    if (!canSave) return
    try {
      if (isEditing && existingNote) {
        await updateNote.mutateAsync({
          noteId: existingNote.id,
          studentId,
          rawNote: rawNote.trim(),
          aiEnhancedNote: aiEnhancedNote ?? undefined,
          topicsCovered,
          skillsProgressing,
          mood,
          isVisibleToParent,
        })
      } else {
        await saveNote.mutateAsync({
          studentId,
          scheduleBlockId,
          noteDate: displayDate,
          rawNote: rawNote.trim(),
          aiEnhancedNote: aiEnhancedNote ?? undefined,
          topicsCovered,
          skillsProgressing,
          mood,
          isVisibleToParent,
        })
      }
      onSaved()
    } catch (err: any) {
      toast(err.message ?? 'Failed to save session recap', 'error')
    }
  }

  const isSaving = saveNote.isPending || updateNote.isPending

  const formattedDate = new Date(displayDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(2,2,9,0.98)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{ maxWidth: 480, margin: '0 auto', padding: 20, minHeight: '100vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: '#E0E0F4', margin: 0 }}>
              Session Recap
            </h2>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#D4226A', marginTop: 4 }}>
              {studentName}
            </div>
            <div style={{ fontSize: 12, color: '#A0A0C8', marginTop: 4, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span>{formattedDate}</span>
              {instrument && <span style={{ color: '#8080A8' }}>{instrumentWithEmojiTitle(instrument)}</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              padding: 8,
              cursor: 'pointer',
              color: '#8080A8',
              flexShrink: 0,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />

        {/* Mood Selector */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            How was the session? *
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {MOOD_OPTIONS.map(m => {
              const isSelected = mood === m.value
              return (
                <button
                  key={m.value}
                  onClick={() => setMood(m.value)}
                  style={{
                    flex: 1,
                    padding: '10px 4px',
                    borderRadius: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    background: isSelected ? 'rgba(255,184,0,0.15)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isSelected ? 'rgba(255,184,0,0.35)' : 'rgba(255,255,255,0.06)'}`,
                    cursor: 'pointer',
                    transition: 'all 100ms ease',
                  }}
                >
                  <span style={{ fontSize: 22 }}>{m.emoji}</span>
                  <span style={{
                    fontSize: 9, fontWeight: 700,
                    color: isSelected ? '#FFB800' : '#606088',
                  }}>
                    {m.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />

        {/* Topics Covered */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            Topics Covered
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {topicOptions.map(topic => {
              const isSelected = topicsCovered.includes(topic)
              return (
                <button
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 100,
                    fontSize: 12,
                    fontWeight: 600,
                    background: isSelected ? '#D4226A' : 'rgba(255,255,255,0.04)',
                    color: isSelected ? '#fff' : '#A0A0C8',
                    border: `1px solid ${isSelected ? '#D4226A' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer',
                    transition: 'all 100ms ease',
                  }}
                >
                  {topic}
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />

        {/* Skills Progressing */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            Skills Progress
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {SKILLS_OPTIONS.map(skill => {
              const isSelected = skillsProgressing.includes(skill)
              return (
                <button
                  key={skill}
                  onClick={() => toggleSkill(skill)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 100,
                    fontSize: 12,
                    fontWeight: 600,
                    background: isSelected ? '#D4226A' : 'rgba(255,255,255,0.04)',
                    color: isSelected ? '#fff' : '#A0A0C8',
                    border: `1px solid ${isSelected ? '#D4226A' : 'rgba(255,255,255,0.08)'}`,
                    cursor: 'pointer',
                    transition: 'all 100ms ease',
                  }}
                >
                  {skill}
                </button>
              )
            })}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 24 }} />

        {/* Session Recap Textarea */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: '#8080A8', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 10,
          }}>
            Session Recap *
          </div>
          <textarea
            value={rawNote}
            onChange={e => setRawNote(e.target.value.slice(0, 1000))}
            placeholder="What happened in today's lesson? What went well? What should they practice?"
            rows={4}
            spellCheck={true}
            lang="en"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 12,
              color: '#E0E0F4',
              padding: 14,
              width: '100%',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
              minHeight: 90,
              outline: 'none',
              boxSizing: 'border-box',
              lineHeight: 1.5,
            }}
          />
          <div style={{ fontSize: 10, color: '#606088', textAlign: 'right', marginTop: 4 }}>{rawNote.length}/1000</div>
        </div>

        {/* Ziro polish button */}
        {rawNote.trim().length > 0 && !showAiPreview && (
          <button
            onClick={handlePolish}
            disabled={isPolishing}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              padding: '12px 16px',
              borderRadius: 10,
              background: 'rgba(255,184,0,0.12)',
              border: '1px solid rgba(255,184,0,0.25)',
              color: '#FFB800',
              fontSize: 13,
              fontWeight: 700,
              cursor: isPolishing ? 'default' : 'pointer',
              opacity: isPolishing ? 0.7 : 1,
              transition: 'all 150ms ease',
              marginBottom: 20,
            }}
          >
            {isPolishing ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Ziro is writing...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Polish with Ziro
              </>
            )}
          </button>
        )}

        {/* AI Preview */}
        {showAiPreview && aiEnhancedNote && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#FFB800', textTransform: 'uppercase',
              letterSpacing: '0.06em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <Sparkles size={12} />
              Ziro's Version
            </div>
            <div style={{
              background: 'rgba(255,184,0,0.06)',
              border: '1px solid rgba(255,184,0,0.15)',
              borderRadius: 12,
              padding: 14,
              fontSize: 13,
              color: '#D0D0E8',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap',
            }}>
              {aiEnhancedNote}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={handleAcceptAi}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'rgba(34,197,94,0.1)', color: '#22C55E',
                  border: '1px solid rgba(34,197,94,0.2)', cursor: 'pointer',
                }}
              >
                Accept
              </button>
              <button
                onClick={handleEditAi}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'rgba(255,255,255,0.04)', color: '#A0A0C8',
                  border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                onClick={handleRegenerate}
                disabled={isPolishing}
                style={{
                  flex: 1, padding: '10px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: 'rgba(255,184,0,0.08)', color: '#FFB800',
                  border: '1px solid rgba(255,184,0,0.2)', cursor: 'pointer',
                  opacity: isPolishing ? 0.5 : 1,
                }}
              >
                {isPolishing ? '...' : 'Regenerate'}
              </button>
            </div>
          </div>
        )}

        {/* Accepted AI badge */}
        {aiEnhancedNote && !showAiPreview && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20,
            padding: '8px 12px', borderRadius: 8,
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
          }}>
            <Sparkles size={12} style={{ color: '#22C55E' }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#22C55E' }}>
              Ziro-polished version will be sent to parents
            </span>
          </div>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 20 }} />

        {/* Visibility Toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24, padding: '10px 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isVisibleToParent ? (
              <Eye size={16} style={{ color: '#A0A0C8' }} />
            ) : (
              <EyeOff size={16} style={{ color: '#606088' }} />
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: '#A0A0C8' }}>
              Visible to parent
            </span>
          </div>
          <button
            onClick={() => setIsVisibleToParent(!isVisibleToParent)}
            style={{
              width: 44,
              height: 24,
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              position: 'relative',
              background: isVisibleToParent ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)',
              transition: 'background 200ms ease',
            }}
          >
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: isVisibleToParent ? '#22C55E' : '#606088',
              position: 'absolute',
              top: 3,
              left: isVisibleToParent ? 23 : 3,
              transition: 'all 200ms ease',
            }} />
          </button>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!canSave || isSaving}
          style={{
            background: canSave ? '#D4226A' : 'rgba(255,255,255,0.06)',
            color: canSave ? '#fff' : '#606088',
            width: '100%',
            padding: 14,
            borderRadius: 12,
            border: 'none',
            fontSize: 15,
            fontWeight: 700,
            cursor: canSave && !isSaving ? 'pointer' : 'default',
            opacity: isSaving ? 0.6 : 1,
            transition: 'all 150ms ease',
            boxShadow: canSave ? '0 4px 16px rgba(212,34,106,0.3)' : 'none',
            marginBottom: 20,
          }}
        >
          {isSaving ? 'Saving...' : isEditing ? 'Update Recap' : 'Save Recap'}
        </button>
      </div>

      {/* Spin animation for loader */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
